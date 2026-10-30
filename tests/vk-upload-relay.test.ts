import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRelayInput,isPublicRelayIpv4,makeRelayHandler} from '../lib/server/vk/upload-relay.ts';
import {relayUpload} from '../lib/server/vk/upload-relay-transport.ts';
import {EventEmitter} from 'node:events';
import type {request as httpsRequest,RequestOptions} from 'node:https';
const target='https://pu.vk.ru/c906628/ss2321/upload.php?act=do_add&wallphoto=1&hash=private';
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const body=()=>({groupId:242095689,uploadUrl:target,imageBase64:png});
const req=()=>new Request('https://stage.lentaro.ru/api/social-accounts/vk/upload-test',{method:'POST',headers:{origin:'https://stage.lentaro.ru','content-type':'application/json'},body:JSON.stringify(body())});
test('relay accepts only the exact observed upload family and bounded PNG',()=>{
  assert.equal(parseRelayInput(body()).image.length,12);
  for(const uploadUrl of ['https://evil.test/c1/ss1/upload.php?act=do_add&wallphoto=1',target.replace('pu.vk.ru','pu1.vk.ru'),target+'&access_token=private',target+'#x',target.replace('upload.php','other.php')])assert.throws(()=>parseRelayInput({...body(),uploadUrl}));
  assert.throws(()=>parseRelayInput({...body(),groupId:123}));assert.throws(()=>parseRelayInput({...body(),token:'secret'}));
});
test('DNS guard rejects private reserved and non-IPv4 destinations',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','203.0.113.1','224.0.0.1','::1'])assert.equal(isPublicRelayIpv4(ip),false,ip);
  assert.equal(isPublicRelayIpv4('87.240.190.67'),true);
});
test('handler admits owner before claiming and performs upload only once',async()=>{
  const calls:string[]=[];let used=false;
  const handler=makeRelayHandler({authorize:async()=>{calls.push('auth');return 'owner';},claim:async()=>{calls.push('claim');if(used)return false;used=true;return true;},upload:async()=>{calls.push('upload');return {status:'UPLOAD_CONFIRMED',httpStatus:200};}});
  const r=await handler(req());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(await r.json(),{status:'UPLOAD_CONFIRMED',httpStatus:200});
  assert.equal((await handler(req())).status,409);assert.deepEqual(calls,['auth','claim','upload','auth','claim']);
});
test('unauthorized/cross-origin requests never claim or upload, exceptions sanitized',async()=>{
  let mutations=0;
  const handler=makeRelayHandler({authorize:async()=>{throw Error('private-token');},claim:async()=>{mutations++;return true;},upload:async()=>{mutations++;throw Error('private-url');}});
  const response=await handler(req());assert.equal(response.status,401);assert.equal((await response.text()).includes('private'),false);assert.equal(mutations,0);
  const cross=new Request(req(),{headers:{origin:'https://evil.test','content-type':'application/json'}});
  assert.equal((await handler(cross)).status,403);assert.equal(mutations,0);
});

test('transport rejects private DNS before any HTTP request',async()=>{
  let calls=0;
  const request=(()=>{calls++;throw Error('must not send');}) as unknown as typeof httpsRequest;
  const result=await relayUpload(parseRelayInput(body()),{resolve:async()=>['127.0.0.1'],request});
  assert.deepEqual(result,{status:'UPSTREAM_UNCONFIRMED'});assert.equal(calls,0);
});
test('transport pins public IP, preserves TLS name, rejects redirects and sanitizes response',async()=>{
  for(const code of [200,302]){
    let sent=0;let seen:RequestOptions|undefined;
    const request=((url:URL,options:RequestOptions,callback:(res:EventEmitter)=>void)=>{
      assert.equal(url.hostname,'pu.vk.ru');seen=options;
      const req=Object.assign(new EventEmitter(),{destroy(){},end(payload:Buffer){
        sent++;assert.equal(payload.includes(Buffer.from('image/png')),true);
        const res=Object.assign(new EventEmitter(),{statusCode:code,destroy(){}});callback(res);
        queueMicrotask(()=>{res.emit('data',Buffer.from(JSON.stringify({server:1,photo:'private',hash:'private'})));res.emit('end');});
      }});return req;
    }) as unknown as typeof httpsRequest;
    const result=await relayUpload(parseRelayInput(body()),{resolve:async()=>['87.240.190.67'],request});
    assert.equal(sent,1);assert.equal(seen?.servername,'pu.vk.ru');assert.equal(seen?.family,4);assert.equal(seen?.agent,false);
    const lookup=seen?.lookup as unknown as (host:string,options:unknown,callback:(error:unknown,ip:string,family:number)=>void)=>void;
    lookup('pu.vk.ru',{},(error,ip,family)=>{assert.equal(error,null);assert.equal(ip,'87.240.190.67');assert.equal(family,4);});
    assert.equal(result.status,code===200?'UPLOAD_CONFIRMED':'UPSTREAM_HTTP_REJECTED');
    assert.equal(JSON.stringify(result).includes('private'),false);
  }
});

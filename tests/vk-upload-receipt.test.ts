import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {request as httpsRequest,RequestOptions} from 'node:https';
import * as relay from '../lib/server/vk/upload-relay.ts';
import * as transport from '../lib/server/vk/upload-relay-transport.ts';
import {RECEIPT_OPERATION,RECEIPT_ENDPOINT} from '../public/vk-upload-receipt.mjs';
import {DIAGNOSTIC_OPERATION} from '../public/vk-upload-diagnostic.mjs';
const target='https://pu.vk.ru/c906628/ss2321/upload.php?act=do_add&wallphoto=1&hash=private-signed-url';
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const receipt=()=>({server:17,photo:' [{"opaque":"photo"}] ',hash:' opaque-hash '});
const body=()=>({groupId:242095689,uploadUrl:target,imageBase64:png});
const request=(raw:unknown=body(),headers:Record<string,string>={})=>new Request(`https://stage.lentaro.ru${RECEIPT_ENDPOINT}`,{method:'POST',headers:{origin:'https://stage.lentaro.ru','content-type':'application/json','x-planly-vk-diagnostic':RECEIPT_OPERATION,...headers},body:JSON.stringify(raw)});
function handler(deps:Parameters<typeof relay.makeRelayHandler>[0]){assert.equal(typeof relay.makeReceiptRelayHandler,'function','separate receipt relay handler must exist');return relay.makeReceiptRelayHandler(deps);}
function fixture(upload?:Parameters<typeof relay.makeRelayHandler>[0]['upload']){
  let claimed=false;const calls:string[]=[];
  const deps={authorize:async()=>{calls.push('auth');return 'owner';},claim:async()=>{calls.push('claim');if(claimed)return false;claimed=true;return true;},upload:upload??(async()=>{calls.push('upload');return {status:'UPLOAD_CONFIRMED' as const,httpStatus:200,receipt:receipt(),accessToken:'must-not-escape'};})};
  return {handler:handler(deps),calls,deps};
}

test('new owner relay returns only bounded receipt once and never echoes tokens or signed upload URL',async()=>{
  const f=fixture(),response=await f.handler(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:receipt()});
  assert.equal((await f.handler(request())).status,409);assert.deepEqual(f.calls,['auth','claim','upload','auth','claim']);
});
test('old upload-only handler still drops receipt even when its upload dependency returns one',async()=>{
  const f=fixture(),old=relay.makeRelayHandler(f.deps);
  const response=await old(request(body(),{'x-planly-vk-diagnostic':DIAGNOSTIC_OPERATION}));
  assert.deepEqual(await response.json(),{status:'UPLOAD_CONFIRMED',httpStatus:200});
});
test('old/missing/wrong operation, foreign origin and fetch-site cannot consume the new receipt claim',async()=>{
  const f=fixture();
  for(const req of [request(body(),{'x-planly-vk-diagnostic':DIAGNOSTIC_OPERATION}),request(body(),{'x-planly-vk-diagnostic':''}),request(body(),{'x-planly-vk-diagnostic':'old'}),request(body(),{origin:'https://evil.test'}),request(body(),{'sec-fetch-site':'cross-site'})])assert.equal((await f.handler(req)).status,403);
  assert.ok(!f.calls.includes('claim'));assert.ok(!f.calls.includes('upload'));
});
test('malformed URL, group, PNG, token-bearing or oversized input is rejected before a claim',async()=>{
  const f=fixture();
  for(const raw of [{...body(),groupId:1},{...body(),accessToken:'must-not-accept'}, {...body(),uploadUrl:target+'&access_token=must-not-accept'},
    {...body(),uploadUrl:target.replace('pu.vk.ru','pu1.vk.ru')},{...body(),uploadUrl:target.replace('https:','http:')},{...body(),uploadUrl:target.replace('upload.php','other.php')},
    {...body(),imageBase64:'not-base64'},{...body(),imageBase64:'x'.repeat(1_350_001)}])assert.equal((await f.handler(request(raw))).status,422);
  assert.ok(!f.calls.includes('claim'));assert.ok(!f.calls.includes('upload'));
});
test('new receipt handler denies anonymous/non-owner admission without claim or raw exception echo',async()=>{
  for(const [name,status,label] of [['UnauthorizedError',401,'OWNER_SESSION_REQUIRED'],['ForbiddenError',403,'OWNER_ACCESS_DENIED'],['Error',503,'ADMISSION_UNAVAILABLE']] as const){
    let mutations=0;const h=handler({authorize:async()=>{const error=Error('must-not-escape');error.name=name;throw error;},claim:async()=>{mutations++;return true;},upload:async()=>{mutations++;return {status:'UPLOAD_CONFIRMED',receipt:receipt()};}});
    const response=await h(request());assert.equal(response.status,status);assert.deepEqual(await response.json(),{status:label});assert.equal(mutations,0);
  }
});
test('new invalid receipt is never confirmed and an unknown upload outcome remains permanently claimed',async()=>{
  const invalid=fixture(async()=>({status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:{...receipt(),photo:'[]'}}));
  assert.deepEqual(await (await invalid.handler(request())).json(),{status:'UPSTREAM_RESPONSE_INVALID',httpStatus:200});
  const unknown=fixture(async()=>{throw Error('private-signed-url');});
  const response=await unknown.handler(request());assert.equal(response.status,502);assert.deepEqual(await response.json(),{status:'UPSTREAM_UNCONFIRMED'});
  assert.equal((await unknown.handler(request())).status,409);
});
test('concurrent new receipt requests share one claim and cancellation before or after claim starts no upload',async()=>{
  const f=fixture(),responses=await Promise.all([f.handler(request()),f.handler(request())]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.calls.filter(v=>v==='upload').length,1);
  for(const stage of ['before','after']){
    const controller=new AbortController();let uploads=0,claims=0;
    const h=handler({authorize:async()=>'owner',claim:async()=>{claims++;controller.abort();return true;},upload:async()=>{uploads++;return {status:'UPLOAD_CONFIRMED',receipt:receipt()};}});
    if(stage==='before')controller.abort();const response=await h(new Request(request(),{signal:controller.signal}));assert.equal(response.status,409);assert.equal(uploads,0);assert.equal(claims,stage==='before'?0:1);
  }
});

function networkFixture(response:{status?:number;raw?:unknown;bytes?:Buffer;headers?:Record<string,string>;error?:boolean;throwRequest?:boolean}={}){
  let calls=0;let options:RequestOptions|undefined;let host='';let destroyed=false;
  const send=((url:URL,seen:RequestOptions,callback:(res:EventEmitter)=>void)=>{
    calls++;host=url.hostname;options=seen;if(response.throwRequest)throw Error('private-tls-error');
    return Object.assign(new EventEmitter(),{destroy(){destroyed=true;},end(payload:Buffer){
      assert.ok(payload.includes(Buffer.from('Content-Type: image/png')));assert.ok(!payload.includes(Buffer.from('access_token')));
      if(response.error){queueMicrotask(()=>req.emit('error',Error('private-tls-error')));return;}
      const incoming=Object.assign(new EventEmitter(),{statusCode:response.status??200,headers:response.headers??{},destroy(){destroyed=true;}});callback(incoming);
      queueMicrotask(()=>{incoming.emit('data',response.bytes??Buffer.from(JSON.stringify(response.raw??{...receipt(),access_token:'must-not-escape',nested:{url:target}})));incoming.emit('end');});
    }});
  }) as unknown as typeof httpsRequest;
  // Keep the event emitter needed by the asynchronous socket-error fixture.
  let req:EventEmitter;
  const requestImpl=((...args:Parameters<typeof httpsRequest>)=>{const result=(send as (...params:Parameters<typeof httpsRequest>)=>ReturnType<typeof httpsRequest>)(...args);req=result;return result;}) as typeof httpsRequest;
  return {network:{resolve:async()=>['87.240.190.67'],request:requestImpl},get calls(){return calls;},get options(){return options;},get host(){return host;},get destroyed(){return destroyed;}};
}
function upload(){assert.equal(typeof transport.relayUploadReceipt,'function','receipt-capable pinned transport must exist');return transport.relayUploadReceipt;}

test('new transport pins public destination and strict TLS while old transport remains status-only',async()=>{
  const input=relay.parseRelayInput(body()),first=networkFixture();const result=await upload()(input,first.network);
  assert.deepEqual(result,{status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:receipt()});assert.equal(first.calls,1);assert.equal(first.host,'pu.vk.ru');assert.equal(first.options?.servername,'pu.vk.ru');assert.equal(first.options?.family,4);assert.equal(first.options?.rejectUnauthorized,true);assert.equal(first.options?.agent,false);
  const lookup=first.options?.lookup as unknown as (host:string,options:unknown,callback:(error:unknown,address:string,family:number)=>void)=>void;
  lookup('pu.vk.ru',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'87.240.190.67');assert.equal(family,4);});
  const second=networkFixture();assert.deepEqual(await transport.relayUpload(input,second.network),{status:'UPLOAD_CONFIRMED',httpStatus:200});
});
test('receipt transport rejects private/mixed DNS and unexpected host before HTTP work',async()=>{
  const input=relay.parseRelayInput(body());
  for(const addresses of [['127.0.0.1'],['87.240.190.67','10.0.0.1'],['::1'],[]]){
    const n=networkFixture();assert.deepEqual(await upload()(input,{...n.network,resolve:async()=>addresses}),{status:'UPSTREAM_UNCONFIRMED'});assert.equal(n.calls,0);
  }
  for(const url of ['https://evil.test/',target.replace('https:','http:'),target.replace('upload.php','other.php'),target+'&access_token=must-not-accept']){
    const n=networkFixture();let resolutions=0;
    assert.deepEqual(await upload()({...input,uploadUrl:new URL(url)},{...n.network,resolve:async()=>{resolutions++;return ['87.240.190.67'];}}),{status:'UPSTREAM_UNCONFIRMED'});assert.equal(n.calls,0);assert.equal(resolutions,0);
  }
});
test('HTTP405 and redirect remain one safe upload rejection without receipt or raw headers/body',async()=>{
  for(const status of [405,302]){
    const n=networkFixture({status,headers:{allow:'GET, HEAD','content-type':'text/html','set-cookie':'must-not-escape'},bytes:Buffer.from('<h1>405 Method Not Allowed</h1>private-signed-url')});
    const result=await upload()(relay.parseRelayInput(body()),n.network);assert.equal(n.calls,1);assert.deepEqual(result,{status:'UPSTREAM_HTTP_REJECTED',httpStatus:status,diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION'}});assert.equal(JSON.stringify(result).includes('private'),false);
  }
});
test('empty/oversized/malformed receipt and TLS/socket errors return only safe terminal outcomes',async()=>{
  for(const response of [{raw:{...receipt(),photo:'[]'}},{raw:{...receipt(),hash:''}},{bytes:Buffer.from('{bad')},{bytes:Buffer.alloc(1_100_001)},{error:true},{throwRequest:true}]){
    const n=networkFixture(response),result=await upload()(relay.parseRelayInput(body()),n.network);
    assert.equal(result.status,response.error||response.throwRequest?'UPSTREAM_UNCONFIRMED':'UPSTREAM_RESPONSE_INVALID');assert.equal(Object.hasOwn(result,'receipt'),false);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(n.calls,1);
  }
});
test('new route authenticates both admission and upload before any external transport',async()=>{
  const modulePath='../app/api/social-accounts/vk/upload-receipt-test/route.ts';const route=await import(modulePath).catch(()=>null);assert.ok(route?.GET&&route?.POST,'owner-only receipt route must exist');
  assert.equal((await route.GET(new Request(`https://stage.lentaro.ru${RECEIPT_ENDPOINT}`))).status,401);assert.equal((await route.POST(request())).status,401);
});

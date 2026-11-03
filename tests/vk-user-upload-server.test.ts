import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {makeUserUploadHandler,runUserUpload,USER_UPLOAD_OPERATION,FIXED_USER_UPLOAD_PNG} from '../lib/server/vk/user-upload-test.ts';

const token=randomBytes(40).toString('base64url');
const now=1_800_000_000_000;
const body=()=>({groupId:242095689,accessToken:token,scopes:['wall','photos','groups'],issuedAt:now});
const request=(raw:unknown=body(),headers:Record<string,string>={})=>new Request('https://stage.lentaro.ru/api/social-accounts/vk/user-upload-test',{method:'POST',headers:{origin:'https://stage.lentaro.ru','content-type':'application/json','x-planly-vk-user-upload':USER_UPLOAD_OPERATION,...headers},body:JSON.stringify(raw)});
function fixture(overrides:Record<string,unknown>={}){
  let claimed=false;const calls:string[]=[];
  const handler=makeUserUploadHandler({now:()=>now,authorize:async()=>{calls.push('authorize');return 'owner';},claim:async()=>{calls.push('claim');if(claimed)return false;claimed=true;return true;},upload:async()=>{calls.push('upload');return {status:'UPLOAD_CONFIRMED',httpStatus:200};},...overrides});
  return {handler,calls};
}
test('owner user upload consumes one independent operation and returns a closed diagnostic',async()=>{
  const {handler,calls}=fixture();
  const first=await handler(request());assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');
  assert.deepEqual(await first.json(),{status:'UPLOAD_CONFIRMED',httpStatus:200});
  assert.equal((await handler(request())).status,409);assert.deepEqual(calls,['authorize','claim','upload','authorize','claim']);
});
test('wrong origin, fetch metadata, operation, JSON shape and stale/future input cannot consume the attempt',async()=>{
  const {handler,calls}=fixture();
  for(const req of [request(body(),{origin:'https://evil.invalid'}),request(body(),{'sec-fetch-site':'cross-site'}),request(body(),{'x-planly-vk-user-upload':'old'}),request({...body(),groupId:1}),request({...body(),issuedAt:now-120_001}),request({...body(),issuedAt:now+1}),request({...body(),accessToken:token+'\n'}),request({...body(),scopes:['wall','photos']}),request({...body(),uploadUrl:'https://evil.invalid'})]){
    assert.ok((await handler(req)).status>=400);
  }
  assert.ok(!calls.includes('claim'));assert.ok(!calls.includes('upload'));
});
test('anonymous and non-owner admission remain distinct and never consume or upload',async()=>{
  for(const [name,status,label] of [['UnauthorizedError',401,'OWNER_SESSION_REQUIRED'],['ForbiddenError',403,'OWNER_ACCESS_DENIED'],['Error',503,'ADMISSION_UNAVAILABLE']] as const){
    const {handler,calls}=fixture({authorize:async()=>{const e=Error(token);e.name=name;throw e;}});
    const result=await handler(request());assert.equal(result.status,status);assert.deepEqual(await result.json(),{status:label});assert.equal(calls.length,0);
  }
});
test('oversized token body is rejected before claim and returned diagnostics cannot echo secret fields',async()=>{
  const {handler,calls}=fixture();assert.equal((await handler(request({...body(),accessToken:'x'.repeat(21_000)}))).status,422);assert.ok(!calls.includes('claim'));
  const injected=fixture({upload:async()=>({status:'UPLOAD_CONFIRMED',httpStatus:200,accessToken:token,photo:'private',hash:'private',uploadUrl:'https://secret.invalid'})});
  assert.deepEqual(await (await injected.handler(request())).json(),{status:'UPLOAD_CONFIRMED',httpStatus:200});
});
test('unknown exception is sanitized and permanent claim prevents another provider attempt',async()=>{
  const {handler,calls}=fixture({upload:async()=>{calls.push('upload');throw Error(token);}});
  const first=await handler(request());assert.deepEqual(await first.json(),{status:'UPSTREAM_UNCONFIRMED'});
  assert.equal((await handler(request())).status,409);assert.equal(calls.filter(v=>v==='upload').length,1);
});
test('concurrent operations share the injected atomic claim; only one starts provider work',async()=>{
  const {handler,calls}=fixture();const responses=await Promise.all([handler(request()),handler(request())]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(calls.filter(v=>v==='upload').length,1);
});
test('aborted request never consumes or contacts provider',async()=>{
  const {handler,calls}=fixture();const controller=new AbortController();controller.abort();
  assert.equal((await handler(new Request(request(),{signal:controller.signal}))).status,409);assert.ok(!calls.includes('claim'));
});
test('stalled body is cancelled by the handler deadline before claim',async()=>{
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
  const {handler,calls}=fixture({deadlineMs:15});
  const req=new Request('https://stage.lentaro.ru/api/social-accounts/vk/user-upload-test',{method:'POST',headers:request().headers,body:stream,duplex:'half'} as RequestInit);
  const result=await handler(req);assert.equal(result.status,409);assert.deepEqual(await result.json(),{status:'CANCELLED'});assert.equal(cancelled,true);assert.ok(!calls.includes('claim'));
});
test('uncertain claim deadline never starts provider work or releases a potentially committed claim',async()=>{
  const {handler,calls}=fixture({deadlineMs:15,claim:()=>new Promise(()=>{})});
  const result=await handler(request());assert.deepEqual(await result.json(),{status:'UPSTREAM_UNCONFIRMED'});assert.ok(!calls.includes('upload'));
});
test('cancellation after first API read never prepares the upload address',async()=>{
  const controller=new AbortController();let calls=0;
  const fetchImpl:typeof fetch=async()=>{calls++;controller.abort();return api({count:1,items:[242095689]});};
  assert.equal((await runUserUpload(body(),controller.signal,fetchImpl)).status,'UPSTREAM_UNCONFIRMED');assert.equal(calls,1);
});

const api=(response:unknown)=>Response.json({response});
function transportFixture(replies?: (url:URL,index:number)=>Response|Promise<Response>){
  const requests:{url:URL;init:RequestInit}[]=[];
  const fetchImpl:typeof fetch=async(url,init)=>{
    const target=new URL(String(url));requests.push({url:target,init:init!});
    assert.ok(!target.href.includes(token));assert.equal(init!.method,'POST');assert.equal(init!.redirect,'error');assert.ok(init!.signal instanceof AbortSignal);
    if(replies)return replies(target,requests.length-1);
    if(target.pathname.endsWith('groups.get'))return api({count:1,items:[242095689]});
    if(target.pathname.endsWith('photos.getWallUploadServer'))return api({album_id:-14,user_id:88,group_id:242095689,upload_url:'https://pu.vk.ru/c123/ss321/upload.php?act=do_add&wallphoto=1'});
    return Response.json({server:17,photo:'[{"photo":"private"}]',hash:'private'});
  };
  return {requests,fetchImpl};
}
test('server checks editor membership then prepares and uploads only the fixed PNG using native FormData',async()=>{
  const {requests,fetchImpl}=transportFixture();const result=await runUserUpload(body(),new AbortController().signal,fetchImpl);
  assert.deepEqual(result,{status:'UPLOAD_CONFIRMED',httpStatus:200});assert.equal(requests.length,3);
  const groups=requests[0].init.body as URLSearchParams;assert.equal(groups.get('access_token'),token);assert.equal(groups.get('filter'),'editor');assert.equal(groups.get('count'),'1000');
  assert.ok(!requests.some(r=>/saveWallPhoto|wall.post/.test(r.url.pathname)));
  const form=requests[2].init.body as FormData;assert.ok(form instanceof FormData);assert.deepEqual([...form.keys()],['photo']);const photo=form.get('photo') as File;
  assert.equal(photo.type,'image/png');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),Buffer.from(FIXED_USER_UPLOAD_PNG,'base64'));assert.equal(new Headers(requests[2].init.headers).get('authorization'),null);
});
test('valid unmatched editor lists and malformed replies have distinct failures before upload URL preparation',async()=>{
  for(const [groups,status] of [[{count:1,items:[1]},'COMMUNITY_CONTROL_REQUIRED'],[{count:2000,items:[1]},'COMMUNITY_CONTROL_REQUIRED'],[{count:2,items:[242095689,242095689]},'INVALID_PROVIDER_RESPONSE'],[{count:1,items:['242095689']},'INVALID_PROVIDER_RESPONSE'],[null,'INVALID_PROVIDER_RESPONSE']] as const){
    const {requests,fetchImpl}=transportFixture(()=>api(groups));const result=await runUserUpload(body(),new AbortController().signal,fetchImpl);
    assert.equal(result.status,status);assert.equal(requests.length,1);
    if(status==='INVALID_PROVIDER_RESPONSE')assert.deepEqual(result.diagnostic,{stage:'GROUPS_READ',reason:'INVALID_RESPONSE'});
  }
});
test('provider errors unsafe upload URLs and token echoes are closed and cannot cause file transport',async()=>{
  for(const upload of [{upload_url:'https://evil.invalid/upload',album_id:-14,user_id:88},{upload_url:'https://pu.vk.ru/c1/upload?access_token='+token,album_id:-14,user_id:88},{upload_url:'https://pu.vk.ru/c1/upload',album_id:-14,user_id:88,group_id:123}]){
    const {requests,fetchImpl}=transportFixture((_url,index)=>index===0?api({count:1,items:[242095689]}):api(upload));
    const result=await runUserUpload(body(),new AbortController().signal,fetchImpl);assert.equal(result.status,'UPLOAD_ADDRESS_REJECTED');assert.equal(requests.length,2);assert.ok(!JSON.stringify(result).includes(token));
  }
});
test('HTTP rejection and malformed success never expose provider body or upload receipt',async()=>{
  for(const [response,status] of [[new Response(token,{status:405}),'UPSTREAM_HTTP_REJECTED'],[Response.json({server:17,photo:'[]',hash:token}),'UPSTREAM_RESPONSE_INVALID'],[Response.json({server:17,photo:'private',hash:token}),'UPSTREAM_RESPONSE_INVALID']] as const){
    const base=transportFixture();const fetchImpl:typeof fetch=async(url,init)=>new URL(String(url)).hostname==='pu.vk.ru'?response:base.fetchImpl(url,init);
    const result=await runUserUpload(body(),new AbortController().signal,fetchImpl);assert.equal(result.status,status);assert.ok(!JSON.stringify(result).includes(token));
  }
});

for(const [index,stage] of [[0,'GROUPS_READ'],[1,'UPLOAD_ADDRESS_READ']] as const){
  for(const [mode,expected] of [
    ['http',{status:'PROVIDER_READ_REJECTED',httpStatus:403,diagnostic:{stage,reason:'HTTP_REJECTED'}}],
    ['api',{status:'PROVIDER_READ_REJECTED',httpStatus:200,diagnostic:{stage,reason:'API_REJECTED',errorCode:27}}],
    ['invalid',{status:'INVALID_PROVIDER_RESPONSE',httpStatus:200,diagnostic:{stage,reason:'INVALID_RESPONSE'}}],
    ['tls',{status:'UPSTREAM_UNCONFIRMED',diagnostic:{stage,reason:'TRANSPORT_FAILED',transport:'TLS_UNTRUSTED'}}],
  ] as const){
    test(`${stage} distinguishes ${mode} without echo or extra provider calls`,async()=>{
      const base=transportFixture();let calls=0;
      const fetchImpl:typeof fetch=async(url,init)=>{
        if(calls++!==index)return base.fetchImpl(url,init);
        if(mode==='http')return new Response(token,{status:403});
        if(mode==='api')return Response.json({error:{error_code:27,error_msg:token,request_params:[{key:'access_token',value:token}]}});
        if(mode==='invalid')return new Response(token,{status:200});
        throw Object.assign(new TypeError(token),{cause:Object.assign(Error(token),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'})});
      };
      const result=await runUserUpload(body(),new AbortController().signal,fetchImpl);
      assert.deepEqual(result,expected);assert.equal(calls,index+1);assert.ok(!JSON.stringify(result).includes(token));
      assert.ok(!base.requests.some(r=>/saveWallPhoto|wall.post/.test(r.url.pathname)));
    });
  }
}
test('file upload transport and upload response validation report different stages',async()=>{
  for(const [mode,expected] of [
    ['reset',{status:'UPSTREAM_UNCONFIRMED',diagnostic:{stage:'FILE_UPLOAD',reason:'TRANSPORT_FAILED',transport:'CONNECTION_RESET'}}],
    ['http',{status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic:{stage:'FILE_UPLOAD',reason:'HTTP_REJECTED'}}],
    ['json',{status:'UPSTREAM_RESPONSE_INVALID',httpStatus:200,diagnostic:{stage:'UPLOAD_RESPONSE',reason:'INVALID_RESPONSE'}}],
  ] as const){
    const base=transportFixture();let calls=0;
    const fetchImpl:typeof fetch=async(url,init)=>{
      calls++;if(new URL(String(url)).hostname!=='pu.vk.ru')return base.fetchImpl(url,init);
      if(mode==='reset')throw Object.assign(Error(token),{code:'ECONNRESET'});
      return new Response(token,{status:mode==='http'?405:200});
    };
    assert.deepEqual(await runUserUpload(body(),new AbortController().signal,fetchImpl),expected);assert.equal(calls,3);
  }
});
test('API numeric diagnostic is bounded and arbitrary strings or errors never become a code',async()=>{
  for(const code of [token,-1,1_000_000,2.5,null]){
    const result=await runUserUpload(body(),new AbortController().signal,async()=>Response.json({error:{error_code:code,error_msg:token}}));
    assert.deepEqual(result,{status:'PROVIDER_READ_REJECTED',httpStatus:200,diagnostic:{stage:'GROUPS_READ',reason:'API_REJECTED'}});
  }
});
test('HTTP handler carries only sanitized stage fields and preserves consumed operation',async()=>{
  const {handler,calls}=fixture({upload:async()=>({status:'PROVIDER_READ_REJECTED',httpStatus:200,diagnostic:{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27,transport:token,token,photo:token,hash:token,url:token}})});
  assert.deepEqual(await (await handler(request())).json(),{status:'PROVIDER_READ_REJECTED',httpStatus:200,diagnostic:{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27}});
  assert.equal((await handler(request())).status,409);assert.equal(calls.filter(v=>v==='claim').length,2);assert.equal(USER_UPLOAD_OPERATION,'vk-user-upload-20261103-01');
});
test('unknown transport codes remain OTHER and a deadline retains the active stage',async()=>{
  const unexpected=await runUserUpload(body(),new AbortController().signal,async()=>{throw Object.assign(Error(token),{code:token});});
  assert.deepEqual(unexpected,{status:'UPSTREAM_UNCONFIRMED',diagnostic:{stage:'GROUPS_READ',reason:'TRANSPORT_FAILED',transport:'OTHER'}});
  const controller=new AbortController();const result=await runUserUpload(body(),controller.signal,async()=>{controller.abort();throw Error(token);});
  assert.deepEqual(result,{status:'UPSTREAM_UNCONFIRMED',diagnostic:{stage:'GROUPS_READ',reason:'DEADLINE'}});
});

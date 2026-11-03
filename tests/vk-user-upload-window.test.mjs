import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGIN,TTL,USER_UPLOAD_OPERATION,validateUserUploadPayload,createUserUploadReceiver,executeUserUpload,safeUserUploadResult,ownerUserUploadAdmission,sanitizeUserUploadDiagnostic,userUploadDiagnosticText} from '../public/vk-user-upload-core.mjs';
const token='vk1.a.'+'x'.repeat(32), nonce='ab'.repeat(16);
const payload=(now=1000)=>({groupId:242095689,accessToken:token,scopes:['wall','photos','groups'],issuedAt:now});
function fixture(overrides={}){
  let clock=1000,admissions=0,calls=0,previews=0;const opener={},messages=[],renders=[];
  const r=createUserUploadReceiver({opener,now:()=>clock,admit:async()=>{admissions++;return {status:'OWNER_SESSION_RECOGNIZED'};},confirmPeer:async()=>true,
    execute:async(p,active)=>{calls++;assert.deepEqual(p,payload());assert.equal(active(),true);return {status:'UPLOAD_CONFIRMED',httpStatus:200};},
    send:m=>messages.push(m),preview:()=>{previews++;},render:(...args)=>renders.push(args),...overrides});
  const event=(type,extra={})=>({origin:ORIGIN,source:opener,data:{type,nonce,...(type==='HELLO'?{operation:USER_UPLOAD_OPERATION}:{}),...extra}});
  return {r,event,opener,messages,renders,counts:()=>({admissions,calls,previews}),expire:()=>{clock+=TTL;},ready:async()=>{await r.receive(event('HELLO'));await r.receive(event('PAYLOAD',{payload:payload()}));}};
}
test('transient token payload has strict fixed destination and bounded fresh input',()=>{
  assert.deepEqual(validateUserUploadPayload(payload(),1000),payload());
  for(const p of [{...payload(),uploadUrl:'https://evil.test'},{...payload(),groupId:1},{...payload(),scopes:['photos']},{...payload(),accessToken:token+'\n'},{...payload(),issuedAt:1001},{...payload(),issuedAt:1000-TTL},{...payload(),accessToken:'x'.repeat(16001)}])assert.throws(()=>validateUserUploadPayload(p,1000));
});
test('exact peer and explicit confirmation are required; rendering never receives token',async()=>{
  const f=fixture();await f.r.receive({...f.event('HELLO'),origin:'https://vk.ru'});await f.r.receive({...f.event('HELLO'),source:{}});await f.r.receive(f.event('HELLO',{nonce:'bad'}));
  assert.deepEqual(f.counts(),{admissions:0,calls:0,previews:0});
  await f.ready();assert.deepEqual(f.counts(),{admissions:1,calls:0,previews:1});
  assert.equal(JSON.stringify(f.renders).includes(token),false);
  await f.r.confirm();await f.r.confirm();assert.deepEqual(f.counts(),{admissions:2,calls:1,previews:1});
  assert.equal(JSON.stringify(f.messages).includes(token),false);assert.equal(f.messages.at(-1).result.status,'UPLOAD_CONFIRMED');
});
test('replacement during peer confirmation and cancel during admission prevent server POST',async()=>{
  let resolve;const f=fixture({confirmPeer:()=>new Promise(r=>{resolve=r;})});await f.ready();const pending=f.r.confirm();
  await f.r.receive(f.event('PAYLOAD',{payload:payload()}));resolve(true);await pending;assert.equal(f.counts().calls,0);
  let admit;const g=fixture({admit:()=>new Promise(r=>{admit=r;})});const wait=g.r.receive(g.event('HELLO'));g.r.cancel();admit({status:'OWNER_SESSION_RECOGNIZED'});await wait;await g.r.confirm();assert.equal(g.counts().calls,0);
});
test('expired windows and owner denial never transfer token to server',async()=>{
  const f=fixture();await f.ready();f.expire();await f.r.confirm();assert.equal(f.counts().calls,0);assert.equal(f.messages.at(-1).result.status,'WINDOW_EXPIRED');
  const g=fixture({admit:async()=>({status:'OWNER_ACCESS_DENIED'})});await g.ready();await g.r.confirm();assert.equal(g.counts().calls,0);assert.equal(g.messages.at(-1).result.status,'OWNER_ACCESS_DENIED');
});
test('executor only posts fixed protocol once and persists only attempt marker',async()=>{
  const map=new Map([['old-marker','ATTEMPTED']]);let calls=0;
  const args={payload:payload(),active:()=>true,now:()=>1000,storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},locks:{request:async(_n,_o,fn)=>fn({})},
    fetchImpl:async(url,init)=>{calls++;assert.equal(url,'/api/social-accounts/vk/user-upload-test');assert.equal(init.method,'POST');assert.equal(init.credentials,'same-origin');assert.equal(init.headers['X-Planly-VK-User-Upload'],USER_UPLOAD_OPERATION);assert.deepEqual(JSON.parse(init.body),payload());return Response.json({status:'UPLOAD_CONFIRMED',token,httpStatus:200});}};
  assert.deepEqual(await executeUserUpload(args),{status:'UPLOAD_CONFIRMED',httpStatus:200});assert.equal((await executeUserUpload(args)).status,'ALREADY_ATTEMPTED');
  assert.equal(calls,1);assert.deepEqual([...map],[['old-marker','ATTEMPTED'],[USER_UPLOAD_OPERATION,'ATTEMPTED']]);
});
test('new diagnostic operation preserves the consumed first attempt and rejects its old window',async()=>{
  const previous='vk-user-upload-20261103-01';
  const map=new Map([[previous,'ATTEMPTED']]);let posts=0;
  const options={payload:payload(),active:()=>true,now:()=>1000,storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},
    locks:{request:async(_n,_o,fn)=>fn({})},fetchImpl:async()=>{posts++;return Response.json({status:'PROVIDER_READ_REJECTED',diagnostic:{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27}});}};
  assert.equal(USER_UPLOAD_OPERATION,'vk-user-upload-diagnostic-20261103-02');
  assert.equal((await executeUserUpload(options)).status,'PROVIDER_READ_REJECTED');
  assert.equal((await executeUserUpload(options)).status,'ALREADY_ATTEMPTED');
  assert.equal(posts,1);assert.deepEqual([...map],[[previous,'ATTEMPTED'],[USER_UPLOAD_OPERATION,'ATTEMPTED']]);
  const f=fixture();await f.r.receive(f.event('HELLO',{operation:previous}));await f.r.receive(f.event('PAYLOAD',{payload:payload()}));await f.r.confirm();
  assert.equal(f.counts().calls,0);assert.equal(f.counts().admissions,0);
});
test('unknown response consumes marker; absent lock/storage/cancellation sends nothing',async()=>{
  const map=new Map();let calls=0;
  const options={payload:payload(),active:()=>true,now:()=>1000,storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},locks:{request:async(_n,_o,f)=>f({})},fetchImpl:async()=>{calls++;throw new Error(token);}};
  assert.equal((await executeUserUpload(options)).status,'UPSTREAM_UNCONFIRMED');assert.equal((await executeUserUpload(options)).status,'ALREADY_ATTEMPTED');assert.equal(calls,1);
  for(const changed of [{locks:null},{active:()=>false},{storage:{getItem:()=>{throw Error(token);}}}]){
    let deniedCalls=0;
    await executeUserUpload({...options,...changed,storage:changed.storage??{getItem:()=>null,setItem:()=>{}},fetchImpl:async()=>{deniedCalls++;throw Error('MUST NOT CALL');}});
    assert.equal(deniedCalls,0);
  }
});
test('fresh owner denial and stale peer block dispatch; expiry after dispatch is uncertain',async()=>{
  let admissions=0;
  const denied=fixture({admit:async()=>({status:++admissions===1?'OWNER_SESSION_RECOGNIZED':'OWNER_ACCESS_DENIED'})});
  await denied.ready();await denied.r.confirm();assert.equal(denied.counts().calls,0);assert.equal(denied.messages.at(-1).result.status,'OWNER_ACCESS_DENIED');
  const stale=fixture({confirmPeer:async()=>false});await stale.ready();await stale.r.confirm();assert.equal(stale.counts().calls,0);
  let complete;const uncertain=fixture({execute:()=>new Promise(resolve=>{complete=resolve;})});await uncertain.ready();const wait=uncertain.r.confirm();
  await new Promise(r=>setImmediate(r));uncertain.expire();uncertain.r.tick();complete({status:'UPLOAD_CONFIRMED'});await wait;
  assert.equal(uncertain.messages.at(-1).result.status,'UPSTREAM_UNCONFIRMED');
});
test('closed result and owner admission reject echo and malformed responses',async()=>{
  assert.deepEqual(safeUserUploadResult({status:token,httpStatus:999,accessToken:token}),{status:'UPSTREAM_UNCONFIRMED'});
  assert.deepEqual(safeUserUploadResult({status:'PROVIDER_READ_REJECTED',httpStatus:403,echo:token}),{status:'PROVIDER_READ_REJECTED',httpStatus:403});
  assert.deepEqual(await ownerUserUploadAdmission(async(url,init)=>{assert.equal(url,'/api/social-accounts/vk/user-upload-test');assert.equal(init.credentials,'same-origin');return Response.json({status:'OWNER_SESSION_RECOGNIZED'});}),{status:'OWNER_SESSION_RECOGNIZED'});
});
test('bounded user upload diagnostic survives result sanitization without provider echo',()=>{
  const raw={stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27,accessToken:token,nested:{description:token},transport:'TLS_UNTRUSTED'};
  assert.deepEqual(sanitizeUserUploadDiagnostic(raw),{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27});
  assert.deepEqual(safeUserUploadResult({status:'UPSTREAM_UNCONFIRMED',httpStatus:200,diagnostic:raw,echo:token}),{
    status:'UPSTREAM_UNCONFIRMED',httpStatus:200,diagnostic:{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27},
  });
  assert.deepEqual(sanitizeUserUploadDiagnostic({stage:'UPLOAD_ADDRESS_READ',reason:'TRANSPORT_FAILED',transport:'TLS_UNTRUSTED',errorCode:27}),{
    stage:'UPLOAD_ADDRESS_READ',reason:'TRANSPORT_FAILED',transport:'TLS_UNTRUSTED',
  });
  assert.equal(JSON.stringify(safeUserUploadResult({status:'UPSTREAM_UNCONFIRMED',diagnostic:raw})).includes(token),false);
});
test('diagnostic rejects unknown stages/reasons, nested values and out-of-range metadata',()=>{
  for(const raw of [null,[],[token],token,{}, {stage:token,reason:'UNKNOWN'},{stage:'FILE_UPLOAD',reason:token},{stage:['FILE_UPLOAD'],reason:'UNKNOWN'},
    {stage:'FILE_UPLOAD',reason:{message:token}}])assert.equal(sanitizeUserUploadDiagnostic(raw),undefined);
  for(const errorCode of [-1,1_000_000,1.5,NaN,Infinity,'27',{},[27]])assert.deepEqual(sanitizeUserUploadDiagnostic({stage:'GROUPS_READ',reason:'API_REJECTED',errorCode}),{stage:'GROUPS_READ',reason:'API_REJECTED'});
  for(const transport of [token,{},['DNS_FAILURE']])assert.deepEqual(sanitizeUserUploadDiagnostic({stage:'FILE_UPLOAD',reason:'TRANSPORT_FAILED',transport}),{stage:'FILE_UPLOAD',reason:'TRANSPORT_FAILED'});
  for(const transport of ['TLS_UNTRUSTED','DNS_FAILURE','CONNECT_TIMEOUT','CONNECTION_RESET','OTHER'])assert.deepEqual(sanitizeUserUploadDiagnostic({stage:'FILE_UPLOAD',reason:'TRANSPORT_FAILED',transport}),{stage:'FILE_UPLOAD',reason:'TRANSPORT_FAILED',transport});
  assert.deepEqual(safeUserUploadResult({status:'UPSTREAM_UNCONFIRMED',diagnostic:{stage:token,reason:'UNKNOWN'}}),{status:'UPSTREAM_UNCONFIRMED'});
});
test('diagnostic UI text uses fixed labels and bounded API code only',()=>{
  assert.match(userUploadDiagnosticText({stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27,description:token}),/Проверка управления группой.*VK отклонил запрос.*27/);
  assert.match(userUploadDiagnosticText({stage:'FILE_UPLOAD',reason:'TRANSPORT_FAILED',transport:'TLS_UNTRUSTED',description:token}),/Отправка файла.*Ошибка соединения.*сертификат/);
  for(const raw of [{stage:token,reason:'UNKNOWN'},{stage:'FILE_UPLOAD',reason:token},[token]])assert.equal(userUploadDiagnosticText(raw),'');
  assert.equal(userUploadDiagnosticText({stage:'UPLOAD_RESPONSE',reason:'INVALID_RESPONSE',message:token}).includes(token),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGIN,TTL,OPERATION,validatePayload,createReceiver,executeUpload,requestPeerConfirmation,safeResult} from '../public/vk-upload-window-core.mjs';
import {DIAGNOSTIC_OPERATION} from '../public/vk-upload-diagnostic.mjs';
const nonce='ab'.repeat(16);
const payload=()=>({groupId:242095689,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=private',imageBase64:btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0,0,0))});
function fixture(){
 let clock=1,admissions=0,uploads=0;const opener={},sent=[],previews=[];
 const r=createReceiver({opener,now:()=>clock,confirmPeer:async()=>true,admit:async()=>{admissions++;return {status:'OWNER_SESSION_RECOGNIZED'};},
   execute:async(p,active)=>{assert.equal(active(),true);uploads++;assert.deepEqual(p,payload());return {status:'UPLOAD_CONFIRMED',httpStatus:200};},
   send:x=>sent.push(x),preview:p=>previews.push(p),render:()=>{}});
 const event=(type,extra={})=>({origin:ORIGIN,source:opener,data:{type,nonce,...(type==='HELLO'?{operation:DIAGNOSTIC_OPERATION}:{}),...extra}});
 return {r,event,sent,previews,counts:()=>({admissions,uploads}),expire:()=>{clock+=TTL;}};
}
test('receiver requires exact origin/source/nonce and never uploads on handshake',async()=>{
 const f=fixture();
 await f.r.receive({...f.event('HELLO'),origin:'https://evil.test'});
 await f.r.receive({...f.event('HELLO'),source:{}});
 await f.r.receive(f.event('HELLO',{nonce:'short'}));
 assert.deepEqual(f.counts(),{admissions:0,uploads:0});
 await f.r.receive(f.event('HELLO'));await f.r.receive(f.event('PAYLOAD',{payload:payload()}));
 assert.equal(f.previews.length,1);assert.deepEqual(f.counts(),{admissions:1,uploads:0});
 await f.r.confirm();await f.r.confirm();
 assert.deepEqual(f.counts(),{admissions:2,uploads:1});
 assert.equal(f.sent.at(-1).result.status,'UPLOAD_CONFIRMED');
});
test('payload replacement, nonce reuse and expiry fail closed',async()=>{
 const f=fixture();await f.r.receive(f.event('HELLO'));await f.r.receive(f.event('PAYLOAD',{payload:payload()}));
 await f.r.receive(f.event('PAYLOAD',{payload:{...payload(),uploadUrl:payload().uploadUrl+'&x=2'}}));
 await f.r.confirm();assert.equal(f.counts().uploads,0);
 const g=fixture();await g.r.receive(g.event('HELLO'));g.expire();await g.r.receive(g.event('PAYLOAD',{payload:payload()}));await g.r.confirm();assert.equal(g.counts().uploads,0);
});
test('cancellation fences late authorization and denies upload',async()=>{
 let resolve;const opener={},sent=[];let calls=0;
 const r=createReceiver({opener,now:()=>0,admit:()=>new Promise(r=>{resolve=r;}),execute:async()=>{calls++;},send:m=>sent.push(m),preview:()=>{},render:()=>{}});
 const hello=r.receive({origin:ORIGIN,source:opener,data:{type:'HELLO',nonce,operation:DIAGNOSTIC_OPERATION}});
 r.cancel();resolve({status:'OWNER_SESSION_RECOGNIZED'});await hello;await r.confirm();
 assert.equal(calls,0);assert.equal(sent.filter(x=>x.type==='ADMITTED').length,0);
});
test('payload validator rejects token fields, unsafe URL, oversized or malformed image',()=>{
 assert.deepEqual(validatePayload(payload()),payload());
 for(const p of [{...payload(),access_token:'secret'},{...payload(),groupId:1},{...payload(),uploadUrl:payload().uploadUrl+'&access_token=secret'},
   {...payload(),uploadUrl:payload().uploadUrl.replace('pu.vk.ru','evil.test')},{...payload(),imageBase64:'AAAA'},{...payload(),imageBase64:'A'.repeat(1_333_340)}])assert.throws(()=>validatePayload(p));
});
test('executor keeps consumed markers, dispatches once and never saves or posts',async()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const locks={request:async(_name,_options,fn)=>fn({})};let requests=0;
 const fetchImpl=async(url,options)=>{requests++;assert.equal(url,'/api/social-accounts/vk/upload-test');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),payload());return Response.json({status:'UPLOAD_CONFIRMED',httpStatus:200});};
 const options={payload:payload(),active:()=>true,storage,locks,fetchImpl};
 assert.equal((await executeUpload(options)).status,'UPLOAD_CONFIRMED');
 assert.equal((await executeUpload(options)).status,'ALREADY_ATTEMPTED');
 assert.equal(requests,1);assert.equal(values.get(OPERATION),'ATTEMPTED');
});
test('executor cannot dispatch when cancelled, lock unavailable or marker cannot persist',async()=>{
 for(const kind of ['cancel','lock','storage']){
  let requests=0;const options={payload:payload(),active:()=>kind!=='cancel',storage:{getItem:()=>null,setItem:()=>{throw {}; }},
   locks:{request:async(_n,_o,f)=>f(kind==='lock'?null:{})},fetchImpl:async()=>{requests++;}};
  await executeUpload(options);assert.equal(requests,0);
 }
});
test('admission failures and an expired unclaimed window cannot preview or execute',async()=>{
 for(const status of ['OWNER_SESSION_REQUIRED','OWNER_ACCESS_DENIED','ADMISSION_UNAVAILABLE']){
  const opener={},messages=[];let uploads=0,previews=0;
  const r=createReceiver({opener,now:()=>0,admit:async()=>({status}),execute:async()=>{uploads++;},send:m=>messages.push(m),preview:()=>{previews++;},render:()=>{}});
  await r.receive({origin:ORIGIN,source:opener,data:{type:'HELLO',nonce,operation:DIAGNOSTIC_OPERATION}});await r.confirm();
  assert.equal(messages.at(-1).result.status,status);assert.equal(uploads,0);assert.equal(previews,0);
 }
 let clock=0,calls=0;const opener={};
 const r=createReceiver({opener,now:()=>clock,admit:async()=>{calls++;},execute:async()=>{},send:()=>{},preview:()=>{},render:()=>{}});
 clock=TTL;r.tick();await r.receive({origin:ORIGIN,source:opener,data:{type:'HELLO',nonce,operation:DIAGNOSTIC_OPERATION}});assert.equal(calls,0);
});
test('fresh denial before confirmation cannot execute; expiry after dispatch reports uncertainty',async()=>{
 let admissions=0,calls=0;const opener={},messages=[];let clock=0,complete;
 const options={opener,now:()=>clock,confirmPeer:async()=>true,admit:async()=>({status:++admissions===1?'OWNER_SESSION_RECOGNIZED':'OWNER_ACCESS_DENIED'}),
 execute:async()=>{calls++;},send:m=>messages.push(m),preview:()=>{},render:()=>{}};
 const r=createReceiver(options);const event=type=>({origin:ORIGIN,source:opener,data:{type,nonce,...(type==='HELLO'?{operation:DIAGNOSTIC_OPERATION}:{}),...(type==='PAYLOAD'?{payload:payload()}:{})}});
 await r.receive(event('HELLO'));await r.receive(event('PAYLOAD'));await r.confirm();assert.equal(calls,0);assert.equal(messages.at(-1).result.status,'OWNER_ACCESS_DENIED');
 const g=createReceiver({...options,admit:async()=>({status:'OWNER_SESSION_RECOGNIZED'}),execute:()=>new Promise(resolve=>{complete=resolve;})});
 await g.receive(event('HELLO'));await g.receive(event('PAYLOAD'));const pending=g.confirm();await new Promise(r=>setImmediate(r));
 clock=TTL;g.tick();complete({status:'UPLOAD_CONFIRMED'});await pending;
 assert.equal(messages.at(-1).result.status,'SERVER_UPLOAD_UNCONFIRMED');
});
test('no current source acknowledgement means no upload even with valid owner session',async()=>{
 let calls=0;const opener={};const r=createReceiver({opener,now:()=>0,confirmPeer:async()=>false,
  admit:async()=>({status:'OWNER_SESSION_RECOGNIZED'}),execute:async()=>{calls++;},send:()=>{},preview:()=>{},render:()=>{}});
 await r.receive({origin:ORIGIN,source:opener,data:{type:'HELLO',nonce,operation:DIAGNOSTIC_OPERATION}});
 await r.receive({origin:ORIGIN,source:opener,data:{type:'PAYLOAD',nonce,payload:payload()}});
 await r.confirm();assert.equal(calls,0);assert.equal(r.phase(),'DONE');
});
test('fresh source acknowledgement is bound to source/origin/nonce/challenge and times out',async()=>{
 let listener,timer,active=true;const opener={},sent=[];const events={addEventListener:(_n,f)=>{listener=f;},removeEventListener:()=>{listener=null;}};
 const args={opener,nonce,active:()=>active,events,send:m=>sent.push(m),randomNonce:()=> 'cd'.repeat(16),schedule:f=>{timer=f;return 1;},stop:()=>{}};
 const promise=requestPeerConfirmation(args);let settled=false;void promise.then(()=>{settled=true;});
 const ack={type:'CONFIRM_ACK',nonce,challenge:sent[0].challenge};
 listener({origin:'https://evil.test',source:opener,data:ack});listener({origin:ORIGIN,source:{},data:ack});
 listener({origin:ORIGIN,source:opener,data:{...ack,challenge:'ef'.repeat(16)}});await Promise.resolve();assert.equal(settled,false);
 listener({origin:ORIGIN,source:opener,data:ack});assert.equal(await promise,true);assert.equal(listener,null);
 const timeout=requestPeerConfirmation(args);timer();assert.equal(await timeout,false);
 const cancelled=requestPeerConfirmation(args);active=false;listener({origin:ORIGIN,source:opener,data:ack});assert.equal(await cancelled,false);
});
test('new diagnostic has its own key and preserves old consumed marker; metadata stays sanitized',async()=>{
 assert.equal(OPERATION,'planly-'+DIAGNOSTIC_OPERATION);
 const old='planly-vk-server-upload-only-20261030-01';const data=new Map([[old,'ATTEMPTED']]);
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const result=await executeUpload({payload:payload(),active:()=>true,storage,locks:{request:async(_n,_o,f)=>f({})},
  fetchImpl:async()=>Response.json({status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION',private:'secret'}})});
 assert.equal(data.get(old),'ATTEMPTED');assert.equal(data.get(OPERATION),'ATTEMPTED');
 assert.deepEqual(result,{status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION'}});
 assert.equal(safeResult({status:'UPSTREAM_HTTP_REJECTED',diagnostic:{allowPost:'SECRET'}}).diagnostic,undefined);
});
test('old or mixed popup handshakes cannot admit a new diagnostic',async()=>{
 const f=fixture();const old=f.event('HELLO');delete old.data.operation;
 await f.r.receive(old);await f.r.receive(f.event('HELLO',{operation:'old-operation'}));
 assert.deepEqual(f.counts(),{admissions:0,uploads:0});assert.equal(f.previews.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../public/vk-upload-window-core.mjs';
import * as sender from '../experiments/vk-miniapp-probe/first-party-upload.mjs';
import * as proof from '../experiments/vk-miniapp-probe/single-photo-test.mjs';
import {createProbe} from '../experiments/vk-miniapp-probe/controller.mjs';
import {RECEIPT_OPERATION,RECEIPT_POST_OPERATION,RECEIPT_MESSAGE,RECEIPT_ENDPOINT,RECEIPT_WINDOW_PATH} from '../public/vk-upload-receipt.mjs';
import {DIAGNOSTIC_OPERATION} from '../public/vk-upload-diagnostic.mjs';
const nonce='ab'.repeat(16),receipt={server:1,photo:'private-photo',hash:'private-hash'};
const payload=()=>({groupId:242095689,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=opaque',imageBase64:btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0,0,0))});

test('new receiver returns private receipt only to its admitted exact peer after fresh confirmation',async()=>{
  assert.equal(typeof core.createReceiptReceiver,'function');
  const opener={},sent=[],rendered=[];let uploads=0,admissions=0;
  const receiver=core.createReceiptReceiver({opener,now:()=>1,confirmPeer:async()=>true,admit:async()=>{admissions++;return {status:'OWNER_SESSION_RECOGNIZED'};},
    execute:async()=>{uploads++;return {status:'UPLOAD_CONFIRMED',httpStatus:200,receipt,secret:'never-render'};},send:x=>sent.push(x),preview:()=>{},render:(...args)=>rendered.push(args)});
  const event=(type,extra={})=>({origin:core.ORIGIN,source:opener,data:{type,nonce,...(type==='HELLO'?{operation:RECEIPT_OPERATION}:{}),...extra}});
  await receiver.receive({...event('HELLO'),origin:'https://evil.test'});
  await receiver.receive(event('HELLO',{operation:DIAGNOSTIC_OPERATION}));
  assert.equal(admissions,0);
  await receiver.receive(event('HELLO'));await receiver.receive(event('PAYLOAD',{payload:payload()}));
  assert.equal(uploads,0);await receiver.confirm();await receiver.confirm();
  assert.equal(uploads,1);assert.equal(admissions,2);assert.deepEqual(sent.at(-1).result.receipt,receipt);
  assert.equal(JSON.stringify(rendered).includes('private-photo'),false);assert.equal(JSON.stringify(rendered).includes('private-hash'),false);
  assert.equal(JSON.stringify(rendered).includes('never-render'),false);
});

test('new executor uses only its exact endpoint/header and keeps old claims while dispatching once',async()=>{
  assert.equal(typeof core.executeReceiptUpload,'function');
  const values=new Map([['planly-vk-newphoto-20261029-01','ATTEMPTED'],['planly-vk-newphoto-20261106-01','ATTEMPTED']]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},locks={request:async(_key,_options,fn)=>fn({})};let calls=0;
  const options={payload:payload(),active:()=>true,storage,locks,fetchImpl:async(path,init)=>{
    calls++;assert.equal(path,RECEIPT_ENDPOINT);assert.equal(init.headers['X-Planly-VK-Diagnostic'],RECEIPT_OPERATION);
    assert.deepEqual(JSON.parse(init.body),payload());return Response.json({status:'UPLOAD_CONFIRMED',httpStatus:200,receipt});
  }};
  assert.deepEqual((await core.executeReceiptUpload(options)).receipt,receipt);
  assert.equal((await core.executeReceiptUpload(options)).status,'ALREADY_ATTEMPTED');assert.equal(calls,1);
  assert.equal(values.get('planly-vk-newphoto-20261029-01'),'ATTEMPTED');assert.equal(values.get('planly-vk-newphoto-20261106-01'),'ATTEMPTED');
  assert.equal(JSON.stringify([...values]).includes('private'),false);
});

test('old upload-only executor never exposes a new server receipt',async()=>{
  const values=new Map();
  const result=await core.executeUpload({payload:payload(),active:()=>true,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},
    locks:{request:async(_key,_options,fn)=>fn({})},fetchImpl:async()=>Response.json({status:'UPLOAD_CONFIRMED',httpStatus:200,receipt})});
  assert.deepEqual(result,{status:'UPLOAD_CONFIRMED',httpStatus:200});
});

test('receipt sender opens only its fixed owned page and never exports a token',async()=>{
  assert.equal(typeof sender.openReceiptUpload,'function');
  const handlers=new Set(),posts=[];let opened;
  const popup={closed:false,postMessage:m=>posts.push(m)};
  const events={addEventListener:(_type,f)=>handlers.add(f),removeEventListener:(_type,f)=>handlers.delete(f)};
  const flow=sender.openReceiptUpload({events,openWindow:url=>{opened=url;return popup;},randomNonce:()=>nonce,now:()=>1,schedule:()=>1,stop:()=>{}});
  assert.equal(opened,core.ORIGIN+RECEIPT_WINDOW_PATH);
  const emit=data=>{for(const f of [...handlers])f({origin:core.ORIGIN,source:popup,data});};
  emit({type:'READY',operation:DIAGNOSTIC_OPERATION});assert.equal(posts.length,0);
  emit({type:'READY',operation:RECEIPT_OPERATION});assert.equal(posts[0].operation,RECEIPT_OPERATION);
  const result=flow.run({uploadUrl:payload().uploadUrl,image:new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'}),active:()=>true,sensitiveToken:'private-token-not-exported'});
  emit({type:'ADMITTED',nonce});await new Promise(r=>setImmediate(r));
  assert.equal(JSON.stringify(posts).includes('private-token'),false);
  emit({type:'CONFIRM_REQUEST',nonce,challenge:'cd'.repeat(16)});
  emit({type:'RESULT',nonce,result:{status:'UPLOAD_CONFIRMED',httpStatus:200,receipt,token:'private-token-not-exported'}});
  assert.deepEqual((await result).receipt,receipt);assert.equal(JSON.stringify(await result).includes('private-token'),false);
});

test('receipt sender rejects a fabricated success before payload and confirmation ACK',async()=>{
  const handlers=new Set(),popup={closed:false,postMessage:()=>{}};
  const events={addEventListener:(_type,f)=>handlers.add(f),removeEventListener:(_type,f)=>handlers.delete(f)};
  const flow=sender.openReceiptUpload({events,openWindow:()=>popup,randomNonce:()=>nonce,now:()=>1,schedule:()=>1,stop:()=>{}});
  const emit=data=>{for(const f of [...handlers])f({origin:core.ORIGIN,source:popup,data});};
  emit({type:'READY',operation:RECEIPT_OPERATION});
  emit({type:'RESULT',nonce,result:{status:'UPLOAD_CONFIRMED',receipt}});
  const result=await flow.run({active:()=>true});
  assert.equal(result.status,'PAYLOAD_REJECTED');assert.equal(JSON.stringify(result).includes('private'),false);
});

function publicationFixture(){
  const apiCalls=[];const token='synthetic-private-vk-token';
  const bridge={send:async(method,params)=>{
    if(method==='VKWebAppInit')return {};
    if(method==='VKWebAppGetAuthToken')return {scope:'wall,photos,groups',access_token:token};
    if(params.method==='groups.get')return {response:{count:1,items:[242095689]}};
    if(params.method==='photos.getWallUploadServer')return {response:{upload_url:payload().uploadUrl,user_id:123}};
    apiCalls.push(params);
    if(params.method==='photos.saveWallPhoto'){assert.equal(params.params.photo,receipt.photo);return {response:[{id:7,owner_id:123}]};}
    assert.equal(params.method,'wall.post');return {response:{post_id:8}};
  }};
  return {probe:createProbe(bridge,{appId:'54809413'}),apiCalls,token};
}
test('receipt publication uses fixed new intent, keeps token in Bridge and never invokes direct upload',async()=>{
  const f=publicationFixture();assert.equal(typeof f.probe.publishReceiptTest,'function');
  await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  let calls=0;
  const result=await f.probe.publishReceiptTest({image:new Blob(['synthetic'],{type:'image/png'}),claim:()=>true,
    upload:()=>{throw Error('Direct browser upload is forbidden');},transport:async input=>{
      calls++;assert.deepEqual(Object.keys(input).sort(),['active','image','uploadUrl']);
      assert.equal(input.active(),true);return {status:'UPLOAD_CONFIRMED',receipt,httpStatus:200};
    }});
  assert.equal(result.phase,'TEST_POST_CONFIRMED');assert.equal(calls,1);assert.equal(f.apiCalls.length,2);
  assert.equal(f.apiCalls[1].params.guid,RECEIPT_POST_OPERATION);assert.equal(f.apiCalls[1].params.message,RECEIPT_MESSAGE);
  assert.equal(f.apiCalls[1].params.attachments,'photo123_7');
  const visible=JSON.stringify(result);for(const secret of [f.token,receipt.photo,receipt.hash])assert.equal(visible.includes(secret),false);
});
test('server rejection stops before save/post and exposes only safe HTTP diagnostics',async()=>{
  const f=publicationFixture();assert.equal(typeof f.probe.publishReceiptTest,'function');
  await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  const result=await f.probe.publishReceiptTest({image:new Blob(['synthetic'],{type:'image/png'}),claim:()=>true,transport:async()=>({status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,receipt,raw:f.token,
    diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION',private:f.token}})});
  assert.equal(result.phase,'TEST_OUTCOME_UNKNOWN');assert.equal(result.stage,'SERVER_UPLOAD_PENDING');assert.equal(result.uploadDiagnostic.httpStatus,405);
  assert.equal(result.uploadDiagnostic.status,'UPSTREAM_HTTP_REJECTED');assert.equal(f.apiCalls.length,0);
  const visible=JSON.stringify(result);for(const secret of [f.token,receipt.photo,receipt.hash])assert.equal(visible.includes(secret),false);
});
test('new publication marker is separate and permanent while both consumed direct markers stay unchanged',()=>{
  assert.equal(typeof proof.claimReceiptPost,'function');
  const values=new Map([['planly-vk-newphoto-20261029-01','ATTEMPTED'],['planly-vk-newphoto-20261106-01','ATTEMPTED']]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  assert.equal(proof.claimReceiptPost(storage),true);assert.equal(proof.claimReceiptPost(storage),false);
  assert.equal(values.get(RECEIPT_POST_OPERATION),'ATTEMPTED');assert.equal(values.size,3);
});

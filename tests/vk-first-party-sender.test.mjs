import test from 'node:test';
import assert from 'node:assert/strict';
import {openFirstPartyUpload} from '../experiments/vk-miniapp-probe/first-party-upload.mjs';
import {ORIGIN,WINDOW_PATH,TTL} from '../public/vk-upload-window-core.mjs';
const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'});
const options=()=>({active:()=>true,image:png,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=private',sensitiveToken:'DO_NOT_SEND_TOKEN'});
function fixture(blocked=false){
 let listener,tick,time=0;const sent=[];const popup={closed:false,postMessage:(m,o)=>sent.push({m,o})};let opened=0;
 const flow=openFirstPartyUpload({openWindow:(url,target)=>{opened++;assert.equal(url,ORIGIN+WINDOW_PATH);assert.equal(target,'_blank');return blocked?null:popup;},
  events:{addEventListener:(_n,l)=>{listener=l;},removeEventListener:()=>{listener=null;}},now:()=>time,randomNonce:()=> 'ab'.repeat(16),schedule:f=>{tick=f;return 1;},stop:()=>{}});
 return {flow,popup,sent,event:(data,source=popup,origin=ORIGIN)=>listener?.({data,source,origin}),tick:()=>tick?.(),expire:()=>{time+=TTL;tick();},opened:()=>opened};
}
test('popup opens synchronously; exact peer handshake transfers only bounded URL/image/group',async()=>{
 const f=fixture();assert.equal(f.opened(),1);const promise=f.flow.run(options());
 f.event({type:'READY'},{},ORIGIN);f.event({type:'READY'},f.popup,'https://evil.test');assert.equal(f.sent.length,0);
 f.event({type:'READY'});const nonce=f.sent[0].m.nonce;
 f.event({type:'ADMITTED',nonce:'cd'.repeat(16)});assert.equal(f.sent.length,1);
 f.event({type:'ADMITTED',nonce});await new Promise(r=>setImmediate(r));
 const message=f.sent.find(x=>x.m.type==='PAYLOAD');assert.ok(message);assert.equal(message.o,ORIGIN);
 assert.deepEqual(Object.keys(message.m.payload).sort(),['groupId','imageBase64','uploadUrl']);assert.equal(JSON.stringify(message).includes('DO_NOT_SEND_TOKEN'),false);
 f.event({type:'RESULT',nonce,result:{status:'UPLOAD_CONFIRMED',httpStatus:200,token:'private'}});
 assert.deepEqual(await promise,{status:'UPLOAD_CONFIRMED',httpStatus:200});
});
test('blocked/closed/expired/cancelled popup cannot send a payload',async()=>{
 const blocked=fixture(true);assert.equal((await blocked.flow.run(options())).status,'WINDOW_UNAVAILABLE');
 for(const action of ['close','expire','cancel']){
  const f=fixture();const promise=f.flow.run(options());
  if(action==='close'){f.popup.closed=true;f.tick();}else if(action==='expire')f.expire();else f.flow.cancel();
  await promise;assert.equal(f.sent.filter(x=>x.m.type==='PAYLOAD').length,0);
 }
});

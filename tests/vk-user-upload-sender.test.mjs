import test from 'node:test';
import assert from 'node:assert/strict';
import {openUserTokenUpload} from '../experiments/vk-miniapp-probe/user-token-upload.mjs';
import {ORIGIN,TTL,USER_UPLOAD_OPERATION,USER_UPLOAD_WINDOW_PATH} from '../public/vk-user-upload-core.mjs';
const token='vk1.a.'+'x'.repeat(32);
function fixture(blocked=false){
  let listener,time=1000,tick,opened=0;const sent=[],popup={closed:false,postMessage:(m,o)=>sent.push({m,o})};
  const flow=openUserTokenUpload({openWindow:(url,target)=>{opened++;assert.equal(url,ORIGIN+USER_UPLOAD_WINDOW_PATH);assert.equal(target,'_blank');return blocked?null:popup;},events:{addEventListener:(_n,l)=>{listener=l;},removeEventListener:()=>{listener=null;}},now:()=>time,randomNonce:()=> 'ab'.repeat(16),schedule:fn=>{tick=fn;return 1;},stop:()=>{}});
  return {flow,popup,sent,opened:()=>opened,event:(data,source=popup,origin=ORIGIN)=>listener?.({data,source,origin}),expire:()=>{time+=TTL;tick();},close:()=>{popup.closed=true;tick();}};
}
test('sender synchronously opens fixed window and sends token only to admitted exact peer',async()=>{
  const f=fixture();assert.equal(f.opened(),1);const pending=f.flow.run({accessToken:token,active:()=>true});
  f.event({type:'READY',operation:USER_UPLOAD_OPERATION},{},ORIGIN);f.event({type:'READY',operation:USER_UPLOAD_OPERATION},f.popup,'https://evil.test');assert.equal(f.sent.length,0);
  f.event({type:'READY',operation:USER_UPLOAD_OPERATION});const nonce=f.sent[0].m.nonce;f.event({type:'ADMITTED',nonce:'cd'.repeat(16)});assert.equal(f.sent.length,1);
  f.event({type:'ADMITTED',nonce});assert.equal(f.sent[1].o,ORIGIN);assert.deepEqual(f.sent[1].m.payload,{groupId:242095689,accessToken:token,scopes:['wall','photos','groups'],issuedAt:1000});
  f.event({type:'CONFIRM_REQUEST',nonce,challenge:'cd'.repeat(16)});assert.equal(f.sent.at(-1).m.type,'CONFIRM_ACK');
  f.event({type:'RESULT',nonce,result:{status:'UPLOAD_CONFIRMED',accessToken:token}});assert.deepEqual(await pending,{status:'UPLOAD_CONFIRMED'});
});
test('blocked, closed, expired and cancelled senders cannot send token or resume',async()=>{
  const blocked=fixture(true);assert.equal((await blocked.flow.run({accessToken:token,active:()=>true})).status,'WINDOW_UNAVAILABLE');
  for(const action of ['expire','close','cancel']){
    const f=fixture();const pending=f.flow.run({accessToken:token,active:()=>true});if(action==='cancel')f.flow.cancel();else f[action]();await pending;
    f.event({type:'READY',operation:USER_UPLOAD_OPERATION});assert.equal(f.sent.some(x=>x.m.type==='PAYLOAD'),false);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serverUploadOnly} from '../experiments/vk-miniapp-probe/server-upload-only.mjs';
const input=()=>({active:()=>true,claim:()=>true,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=private',image:new Blob(['test'],{type:'image/png'})});
test('server test verifies owner session then sends only URL and image to fixed same-origin route',async()=>{
  const calls=[];const o=input();
  o.fetchImpl=async(url,init)=>{calls.push({url,init});return Response.json({status:init.method==='GET'?'OWNER_SESSION_RECOGNIZED':'UPLOAD_CONFIRMED',httpStatus:200});};
  assert.deepEqual(await serverUploadOnly(o),{status:'UPLOAD_CONFIRMED',httpStatus:200});
  assert.deepEqual(calls.map(c=>[c.url,c.init.method]),[['/api/social-accounts/vk/upload-test','GET'],['/api/social-accounts/vk/upload-test','POST']]);
  const body=JSON.parse(calls[1].init.body);assert.deepEqual(Object.keys(body).sort(),['groupId','imageBase64','uploadUrl']);
  assert.equal(body.groupId,242095689);assert.equal(calls[1].init.credentials,'include');assert.equal(calls[1].init.redirect,'error');
});
test('missing owner admission never claims or uploads',async()=>{
  const o=input();let claims=0;let requests=0;o.claim=()=>{claims++;return true;};
  o.fetchImpl=async()=>{requests++;return Response.json({status:'OWNER_SESSION_REQUIRED'},{status:401});};
  assert.deepEqual(await serverUploadOnly(o),{status:'OWNER_SESSION_REQUIRED'});assert.equal(claims,0);assert.equal(requests,1);
});
test('cancelled admission and unknown response never disclose errors or retry',async()=>{
  const o=input();let active=true;let claims=0;o.active=()=>active;o.claim=()=>{claims++;return true;};
  o.fetchImpl=async()=>{active=false;return Response.json({status:'OWNER_SESSION_RECOGNIZED'});};
  assert.deepEqual(await serverUploadOnly(o),{status:'CANCELLED'});assert.equal(claims,0);
  const p=input();let calls=0;p.fetchImpl=async()=>{calls++;if(calls===1)return Response.json({status:'OWNER_SESSION_RECOGNIZED'});throw Error('private-url');};
  assert.deepEqual(await serverUploadOnly(p),{status:'SERVER_UPLOAD_UNCONFIRMED'});assert.equal(calls,2);
});

test('rendered diagnostic policy permits its same-origin relay request',()=>{
  const html=readFileSync(new URL('../experiments/vk-miniapp-probe/index.html',import.meta.url),'utf8');
  const connect=html.match(/connect-src ([^;]+);/)?.[1].split(/\s+/);
  assert.equal(connect?.includes("'self'"),true);
});

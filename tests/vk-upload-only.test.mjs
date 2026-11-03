import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadOnly,claimUploadOnly,UPLOAD_ONLY_OPERATION} from '../experiments/vk-miniapp-probe/upload-only.mjs';
import {TEST_OPERATION} from '../experiments/vk-miniapp-probe/single-photo-test.mjs';
function fixture(){
  let claimed=false;const calls=[];
  const options={active:()=>true,claim:()=>{if(claimed)return false;claimed=true;return true;},uploadUrl:'https://pu.vk.ru/upload?hash=private',image:new Blob(['test'],{type:'image/png'}),
    fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({server:1,photo:'private-photo',hash:'private-hash'}),{status:200});}};
  return {options,calls};
}
test('upload-only sends one multipart request and never returns private response',async()=>{
  const f=fixture();assert.deepEqual(await uploadOnly(f.options),{status:'UPLOAD_CONFIRMED',httpStatus:200});
  assert.equal(f.calls.length,1);const init=f.calls[0].init;
  assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  assert.equal(init.body.get('photo').type,'image/png');assert.equal(init.body.has('access_token'),false);
  assert.deepEqual(await uploadOnly(f.options),{status:'ALREADY_ATTEMPTED'});assert.equal(f.calls.length,1);
});
test('upload-only preserves the original publication marker',()=>{
  const map=new Map([[TEST_OPERATION,'ATTEMPTED']]);const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  assert.equal(claimUploadOnly(storage),true);assert.equal(map.get(TEST_OPERATION),'ATTEMPTED');
  assert.equal(map.get(UPLOAD_ONLY_OPERATION),'ATTEMPTED');assert.equal(claimUploadOnly(storage),false);
});
test('unsafe target and unavailable marker prevent network request',async()=>{
  const f=fixture();f.options.uploadUrl='https://evil.test/x';assert.equal((await uploadOnly(f.options)).status,'PRECONDITION_FAILED');assert.equal(f.calls.length,0);
  const g=fixture();g.options.claim=()=>{throw Error('private');};assert.equal((await uploadOnly(g.options)).status,'MARKER_UNAVAILABLE');assert.equal(g.calls.length,0);
});
test('HTTP rejection, malformed body and transport error are distinct and sanitized',async()=>{
  const f=fixture();f.options.fetchImpl=async()=>new Response('private',{status:403});
  assert.deepEqual(await uploadOnly(f.options),{status:'HTTP_REJECTED',httpStatus:403});
  const g=fixture();g.options.fetchImpl=async()=>new Response('private',{status:200});
  assert.deepEqual(await uploadOnly(g.options),{status:'RESPONSE_INVALID',httpStatus:200});
  const h=fixture();h.options.fetchImpl=async()=>{throw TypeError('private-url-and-token');};
  assert.deepEqual(await uploadOnly(h.options),{status:'FETCH_UNCONFIRMED',errorKind:'TypeError'});
  assert.equal((await uploadOnly(h.options)).status,'ALREADY_ATTEMPTED');
});
test('cancellation after fetch cannot report confirmed upload',async()=>{
  const f=fixture();let active=true;f.options.active=()=>active;
  f.options.fetchImpl=async()=>{active=false;return new Response('{}');};
  assert.deepEqual(await uploadOnly(f.options),{status:'CANCELLED_AFTER_START'});
});

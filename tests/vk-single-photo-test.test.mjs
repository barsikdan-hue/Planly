import test from 'node:test';
import assert from 'node:assert/strict';
import {publishOne,TEST_MESSAGE,claimTest,TEST_OPERATION,inspectPreconditions,safeUploadHost} from '../experiments/vk-miniapp-probe/single-photo-test.mjs';
function fixture(){
  const calls=[];let claimed=false;
  const o={active:()=>true,claim:()=>{if(claimed)return false;claimed=true;return true;},
    uploadUrl:'https://pu.vk.com/c123/upload.php',image:new Blob(['synthetic'],{type:'image/png'}),
    upload:async()=>{calls.push('upload');return {server:1,photo:'opaque-photo',hash:'opaque-hash'};},
    api:async(method,params)=>{calls.push({method,params});return method==='photos.saveWallPhoto'?[{id:7,owner_id:-242095689}]:{post_id:9};}};
  return {o,calls};
}
test('one upload save and fixed target publication, no second attempt',async()=>{
  const f=fixture();assert.deepEqual(await publishOne(f.o),{phase:'TEST_POST_CONFIRMED',postId:9});
  assert.equal(f.calls.length,3);assert.equal(f.calls[1].method,'photos.saveWallPhoto');
  assert.deepEqual(f.calls[2],{method:'wall.post',params:{owner_id:-242095689,from_group:1,message:TEST_MESSAGE,attachments:'photo-242095689_7',guid:'planly-vk-newphoto-20261029-01'}});
  assert.deepEqual(await publishOne(f.o),{phase:'TEST_ALREADY_ATTEMPTED'});assert.equal(f.calls.length,3);
});
test('unsafe upload destinations never upload or claim operation',async()=>{
  for(const uploadUrl of ['http://pu.vk.com/x','https://evil.test/x','https://pu.vk.com.evil.test/x','https://pu.vk.com:8443/x','https://u:p@pu.vk.com/x','https://pu.vk.com/x#fragment']){
    const f=fixture();f.o.uploadUrl=uploadUrl;f.o.claim=()=>{throw Error('must not claim');};
    assert.deepEqual(await publishOne(f.o),{phase:'TEST_PRECONDITION_FAILED'});assert.equal(f.calls.length,0);
  }
});
test('unknown upload or post outcome prevents all retries and never echoes errors',async()=>{
  for(const step of ['upload','api']){
    const f=fixture();f.o[step]=async()=>{throw Error('private-token');};
    const result=await publishOne(f.o);assert.equal(result.phase,'TEST_OUTCOME_UNKNOWN');
    assert.equal(JSON.stringify(result).includes('private-token'),false);
    assert.equal((await publishOne(f.o)).phase,'TEST_ALREADY_ATTEMPTED');
  }
});
test('malformed upload and foreign saved photo cannot produce a post',async()=>{
  const f=fixture();f.o.upload=async()=>({server:0,photo:'[]',hash:''});
  assert.equal((await publishOne(f.o)).phase,'TEST_OUTCOME_UNKNOWN');assert.equal(f.calls.length,0);
  const g=fixture();g.o.api=async()=>[{id:7,owner_id:123}];
  assert.equal((await publishOne(g.o)).phase,'TEST_OUTCOME_UNKNOWN');assert.equal(g.calls.length,1);
});
test('reset after upload or save prevents next mutation',async()=>{
  for(const stopAfter of ['upload','save']){
    const f=fixture();let active=true;f.o.active=()=>active;
    if(stopAfter==='upload'){const orig=f.o.upload;f.o.upload=async()=>{const r=await orig();active=false;return r;};}
    else{const orig=f.o.api;f.o.api=async(...args)=>{const r=await orig(...args);active=false;return r;};}
    assert.equal((await publishOne(f.o)).phase,'TEST_OUTCOME_UNKNOWN');
    assert.equal(f.calls.length,stopAfter==='upload'?1:2);
  }
});

test('persistent latch contains only a fixed marker and refuses existing operation',()=>{
  const map=new Map();const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
  assert.equal(claimTest(storage),true);assert.equal(claimTest(storage),false);
  assert.deepEqual([...map],[[TEST_OPERATION,'ATTEMPTED']]);
});
test('token-bearing upload URL is rejected before a claim',async()=>{
  const f=fixture();f.o.sensitiveToken='private-token';f.o.uploadUrl+='?secret=private-token';
  assert.equal((await publishOne(f.o)).phase,'TEST_PRECONDITION_FAILED');assert.equal(f.calls.length,0);
});

test('dry run identifies exact precondition without a claim or upload',()=>{
  const f=fixture();let claims=0;f.o.claim=()=>{claims++;return true;};
  assert.equal(inspectPreconditions(f.o),'READY');
  assert.equal(inspectPreconditions({...f.o,uploadUrl:'https://upload.vk.com/private'}),'UPLOAD_HOST');
  assert.equal(inspectPreconditions({...f.o,image:null}),'IMAGE_MISSING');
  assert.equal(inspectPreconditions({...f.o,image:new Blob(['x'],{type:'image/jpeg'})}),'IMAGE_TYPE');
  assert.equal(inspectPreconditions({...f.o,active:()=>false}),'CANCELLED');
  assert.equal(claims,0);assert.equal(f.calls.length,0);
});

test('host diagnostic exposes only recognized upload-shaped DNS names, never URL secrets',()=>{
  assert.equal(safeUploadHost('https://pu123.vkuserphoto.ru/upload?token=private-secret#private'),'pu123.vkuserphoto.ru');
  assert.equal(safeUploadHost('https://pu.vk.com/upload?hash=private'),'pu.vk.com');
  for(const url of ['https://private-secret.evil.test/x','https://private-secret.vk.com/x','https://pu.vk.com.evil.test/x','not-url'])assert.equal(safeUploadHost(url),'REDACTED');
  assert.equal(safeUploadHost('https://pu123.vk.com/x','pu123'),'REDACTED');
});

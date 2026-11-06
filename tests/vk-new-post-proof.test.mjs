import test from 'node:test';
import assert from 'node:assert/strict';
import * as proof from '../experiments/vk-miniapp-probe/single-photo-test.mjs';
import {createProbe} from '../experiments/vk-miniapp-probe/controller.mjs';

const legacyOperation='planly-vk-newphoto-20261029-01';
const legacyMessage='Тест Planly: автоматическая загрузка нового изображения в VK';
const currentMessage='Тест Lentaro 06.11.2026: новая картинка и текст через VK API';

test('new owner-requested proof has its own fixed identity and visible dated text',()=>{
  assert.equal(proof.TEST_OPERATION,'planly-vk-newphoto-20261106-01');
  assert.equal(proof.TEST_MESSAGE,currentMessage);
  assert.equal(proof.LEGACY_TEST_OPERATION,legacyOperation);
  assert.equal(proof.LEGACY_TEST_MESSAGE,legacyMessage);
});

test('separate new claim preserves the consumed legacy marker and refuses its own second claim',()=>{
  const values=new Map([[legacyOperation,'ATTEMPTED']]);
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  assert.equal(proof.claimTest(storage),true);
  assert.equal(proof.claimTest(storage),false);
  assert.deepEqual([...values],[[legacyOperation,'ATTEMPTED'],['planly-vk-newphoto-20261106-01','ATTEMPTED']]);
});

const post=(id,text)=>({id,owner_id:-242095689,text,attachments:[{type:'photo',photo:{id:7,owner_id:-242095689}}]});
test('current readback cannot mistake a legacy receipt for the new dated post',async()=>{
  assert.deepEqual(await proof.readTestResult(async()=>({count:1,items:[post(3,legacyMessage)]})),{status:'NO_MATCH_IN_SAMPLE'});
  assert.deepEqual(await proof.readTestResult(async()=>({count:2,items:[post(3,legacyMessage),post(8,currentMessage)]})),{status:'MATCH_FOUND',postId:8});
});

test('legacy readback remains available without any new claim or provider write',async()=>{
  assert.equal(typeof proof.readLegacyTestResult,'function');
  let calls=0;
  const result=await proof.readLegacyTestResult(async(method,params)=>{
    calls++;assert.equal(method,'wall.get');assert.equal(params.count,5);
    return {count:2,items:[post(8,currentMessage),post(3,legacyMessage)]};
  });
  assert.equal(calls,1);assert.deepEqual(result,{status:'MATCH_FOUND',postId:3});
});

function publicationFixture(ownerId=123){
  const calls=[];
  const options={active:()=>true,claim:()=>true,uploadUserId:123,
    uploadUrl:'https://pu.vk.ru/test',image:new Blob(['synthetic'],{type:'image/png'}),
    upload:async()=>({server:1,photo:'opaque',hash:'opaque'}),
    api:async(method,params)=>{calls.push({method,params});return method==='photos.saveWallPhoto'?[{id:7,owner_id:ownerId}]:{post_id:8};}};
  return {options,calls};
}
test('saved uploader-owned photo is published using its actual owner, not the wall owner',async()=>{
  const {options,calls}=publicationFixture();
  assert.deepEqual(await proof.publishOne(options),{phase:'TEST_POST_CONFIRMED',postId:8});
  assert.equal(calls[1].params.attachments,'photo123_7');assert.equal(calls[1].params.owner_id,-242095689);
});
test('foreign, private and unproven positive photo owners never reach wall.post',async()=>{
  for(const mode of ['foreign','private','missing-proof','invalid-proof']){
    const {options,calls}=publicationFixture(mode==='foreign'?456:123);
    if(mode==='private')options.api=async(method,params)=>{calls.push({method,params});return [{id:7,owner_id:-242095689,access_key:'private'}];};
    if(mode==='missing-proof')delete options.uploadUserId;
    if(mode==='invalid-proof')options.uploadUserId='123';
    assert.equal((await proof.publishOne(options)).phase,'TEST_OUTCOME_UNKNOWN');
    assert.equal(calls.some(call=>call.method==='wall.post'),false);
  }
});
test('readback recognizes only a positively owned photo proven by the authenticated upload response',async()=>{
  const api=async()=>({count:1,items:[{...post(8,currentMessage),attachments:[{type:'photo',photo:{id:7,owner_id:123}}]}]});
  assert.deepEqual(await proof.readTestResult(api,123),{status:'MATCH_FOUND',postId:8});
  assert.deepEqual(await proof.readTestResult(api,456),{status:'NO_MATCH_IN_SAMPLE'});
  assert.deepEqual(await proof.readTestResult(api),{status:'NO_MATCH_IN_SAMPLE'});
});
test('controller pins uploader proof from fresh VK response and ignores injected caller owner',async()=>{
  const calls=[];
  const bridge={send:async(method,params)=>{
    if(method==='VKWebAppInit')return {};
    if(method==='VKWebAppGetAuthToken')return {scope:'wall,photos,groups',access_token:'synthetic-token-in-memory-only'};
    calls.push(params.method);
    if(params.method==='groups.get')return {response:{count:1,items:[242095689]}};
    if(params.method==='photos.getWallUploadServer')return {response:{upload_url:'https://pu.vk.ru/test',user_id:123,group_id:242095689}};
    if(params.method==='photos.saveWallPhoto')return {response:[{id:7,owner_id:123}]};
    assert.equal(params.method,'wall.post');assert.equal(params.params.attachments,'photo123_7');return {response:{post_id:8}};
  }};
  const probe=createProbe(bridge,{appId:'54809413'});
  await probe.initialize();await probe.requestAccess();await probe.checkPhoto();
  const {options}=publicationFixture();
  const result=await probe.publishTest({...options,uploadUserId:456});
  assert.equal(result.phase,'TEST_POST_CONFIRMED');assert.equal(calls.filter(method=>method==='wall.post').length,1);
  assert.equal(JSON.stringify(result).includes('uploadUserId'),false);
});

test('fresh preparation cannot reuse prior uploader proof or accept a caller-supplied replacement',async()=>{
  let preparations=0,posts=0;
  const bridge={send:async(method,params)=>{
    if(method==='VKWebAppInit')return {};
    if(method==='VKWebAppGetAuthToken')return {scope:'wall,photos,groups',access_token:'synthetic-token-in-memory-only'};
    if(params.method==='groups.get')return {response:{count:1,items:[242095689]}};
    if(params.method==='photos.getWallUploadServer')return {response:{upload_url:'https://pu.vk.ru/test',...(++preparations===1?{user_id:123}:{})}};
    if(params.method==='photos.saveWallPhoto')return {response:[{id:7,owner_id:123}]};
    posts++;return {response:{post_id:8}};
  }};
  const probe=createProbe(bridge,{appId:'54809413'});
  await probe.initialize();await probe.requestAccess();await probe.checkPhoto();
  const {options}=publicationFixture();
  assert.equal((await probe.publishTest(options)).phase,'TEST_OUTCOME_UNKNOWN');
  assert.equal(preparations,2);assert.equal(posts,0);
});

test('malformed uploader or foreign group in VK preparation fails before claiming or uploading',async()=>{
  for(const fields of [{user_id:'123'},{user_id:0},{user_id:-123},{user_id:123,group_id:1}]){
    const bridge={send:async(method,params)=>{
      if(method==='VKWebAppInit')return {};
      if(method==='VKWebAppGetAuthToken')return {scope:'wall,photos,groups',access_token:'synthetic-token-in-memory-only'};
      if(params.method==='groups.get')return {response:{count:1,items:[242095689]}};
      assert.equal(params.method,'photos.getWallUploadServer');
      return {response:{upload_url:'https://pu.vk.ru/test',...fields}};
    }};
    const probe=createProbe(bridge,{appId:'54809413'});
    await probe.initialize();await probe.requestAccess();
    assert.equal((await probe.checkPhoto()).phase,'CHECK_FAILED');
    let mutations=0;
    await probe.publishTest({claim:()=>{mutations++;return true;},upload:async()=>{mutations++;}});
    assert.equal(mutations,0);
  }
});

for(const [reason,saved,uploader] of [
  ['RESPONSE_SHAPE',{items:[]},123],
  ['PHOTO_COUNT',[],123],
  ['PHOTO_COUNT',[{id:7,owner_id:123},{id:8,owner_id:123}],123],
  ['PHOTO_ID_INVALID',[{id:'7',owner_id:123}],123],
  ['PHOTO_OWNER_INVALID',[{id:7,owner_id:'123'}],123],
  ['UPLOADER_PROOF_MISSING',[{id:7,owner_id:123}],undefined],
  ['PHOTO_OWNER_MISMATCH',[{id:7,owner_id:456}],123],
  ['PHOTO_OWNER_MISMATCH',[{id:7,owner_id:-999}],123],
  ['PHOTO_ACCESS_KEY_PRESENT',[{id:7,owner_id:123,access_key:'sensitive-key'}],123],
])test(`saved-photo rejection exposes only closed ${reason} diagnostic (${JSON.stringify(saved).length})`,async()=>{
  const {options,calls}=publicationFixture();options.uploadUserId=uploader;
  options.api=async(method,params)=>{calls.push({method,params});return saved;};
  const result=await proof.publishReceiptPost(options);
  assert.deepEqual(result,{phase:'TEST_OUTCOME_UNKNOWN',stage:'SAVE_RESPONSE_RECEIVED',errorCode:null,saveDiagnostic:reason});
  assert.equal(calls.length,1);assert.equal(calls[0].method,'photos.saveWallPhoto');
  for(const value of ['sensitive-key','owner_id','uploadUserId','access_key','opaque'])assert.equal(JSON.stringify(result).includes(value),false);
});

test('cancellation after save is distinguished and never posts',async()=>{
  const {options}=publicationFixture();let active=true;options.active=()=>active;
  options.api=async method=>{assert.equal(method,'photos.saveWallPhoto');active=false;return [{id:7,owner_id:123}];};
  const result=await proof.publishReceiptPost(options);
  assert.equal(result.stage,'SAVE_RESPONSE_RECEIVED');assert.equal(result.saveDiagnostic,'CANCELLED');
});

test('provider-thrown diagnostic fields are never trusted or copied',async()=>{
  const {options,calls}=publicationFixture();
  options.api=async(method,params)=>{calls.push({method,params});throw {saveDiagnostic:'PHOTO_OWNER_MISMATCH',raw:'sensitive-key',error_code:15};};
  assert.deepEqual(await proof.publishReceiptPost(options),{phase:'TEST_OUTCOME_UNKNOWN',stage:'SAVE_STARTED',errorCode:15});
  assert.equal(calls.length,1);
});

test('valid saved receipt still posts once without rejection diagnostics',async()=>{
  for(const owner of [123,-242095689]){
    const {options,calls}=publicationFixture(owner);
    assert.deepEqual(await proof.publishReceiptPost(options),{phase:'TEST_POST_CONFIRMED',postId:8});
    assert.equal(calls.filter(call=>call.method==='wall.post').length,1);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbe } from '../experiments/vk-miniapp-probe/controller.mjs';

function fixture({scope='wall,photos',admin=true,photoError=false}={}) {
  const calls=[];
  const token='synthetic-private-token-never-render';
  const bridge={send:async(method,params)=>{
    calls.push({method,params});
    if(method==='VKWebAppInit')return {};
    if(method==='VKWebAppGetAuthToken')return {access_token:token,scope};
    if(params.method==='groups.getById')return {response:{groups:[{id:242095689,is_admin:admin?1:0,admin_level:admin?3:0}]}};
    if(photoError)throw {error_data:{error_code:27,error_description:token}};
    return {response:{upload_url:'https://upload.example.test/private-session'}};
  }};
  return {bridge,calls,token,probe:createProbe(bridge,{appId:'54809413'})};
}

test('outside VK or wrong app never asks for a grant',async()=>{
  for(const appId of [undefined,'54809575','54809413;evil']){
    const f=fixture();const p=createProbe(f.bridge,{appId});
    await p.initialize();await p.requestAccess();await p.checkPhoto();
    assert.equal(f.calls.length,0);assert.equal(p.snapshot().phase,'OPEN_IN_VK');
  }
});
test('init alone does not request permissions or contact API',async()=>{
  const f=fixture();await f.probe.initialize();
  assert.deepEqual(f.calls.map(x=>x.method),['VKWebAppInit']);
  assert.equal(f.probe.snapshot().phase,'READY');
});
test('explicit grant uses confirmed Mini App, scopes and no token UI',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();
  assert.deepEqual(f.calls[1],{method:'VKWebAppGetAuthToken',params:{app_id:54809413,scope:'wall,photos'}});
  assert.equal(f.probe.snapshot().phase,'AUTHORIZED');
  assert.equal(JSON.stringify(f.probe.snapshot()).includes(f.token),false);
  assert.equal(f.probe.snapshot().expiresIn,null);
});
test('missing real grant scope prohibits API probes',async()=>{
  const f=fixture({scope:'photos'});await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  assert.equal(f.probe.snapshot().phase,'MISSING_SCOPES');
  assert.equal(f.calls.length,2);
});
test('successful photo probe performs exactly two reads, never uploads or sends',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  assert.deepEqual(f.calls.filter(x=>x.method==='VKWebAppCallAPIMethod').map(x=>x.params.method),['groups.getById','photos.getWallUploadServer']);
  assert.equal(f.calls[3].params.params.access_token,f.token);
  assert.equal(f.probe.snapshot().phase,'PHOTO_ENDPOINT_AVAILABLE');
  const visible=JSON.stringify(f.probe.snapshot());
  assert.equal(visible.includes(f.token),false);assert.equal(visible.includes('private-session'),false);
});
test('non-admin cannot probe the photo endpoint',async()=>{
  const f=fixture({admin:false});await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  assert.equal(f.probe.snapshot().phase,'COMMUNITY_CONTROL_REQUIRED');assert.equal(f.calls.length,3);
});
test('provider errors never reflect private error text',async()=>{
  const f=fixture({photoError:true});await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  assert.equal(f.probe.snapshot().phase,'CHECK_FAILED');assert.equal(f.probe.snapshot().errorCode,27);
  assert.equal(JSON.stringify(f.probe.snapshot()).includes(f.token),false);
});
test('reset ignores a late grant and never restores private state',async()=>{
  const f=fixture();await f.probe.initialize();let resolve;
  f.bridge.send=()=>new Promise(done=>{resolve=done;});
  const pending=f.probe.requestAccess();f.probe.reset();resolve({access_token:f.token,scope:'wall,photos'});await pending;
  assert.equal(f.probe.snapshot().phase,'READY');await f.probe.checkPhoto();
  assert.equal(f.probe.snapshot().phase,'READY');
});
test('duplicate permission clicks start only one request',async()=>{
  const f=fixture();await f.probe.initialize();let resolve;let requests=0;
  f.bridge.send=()=>{requests++;return new Promise(done=>{resolve=done;});};
  const pending=f.probe.requestAccess();await f.probe.requestAccess();
  assert.equal(requests,1);resolve({access_token:f.token,scope:'wall,photos'});await pending;
});
test('reset during community lookup prevents the next API request',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();let resolve;let requests=0;
  f.bridge.send=()=>{requests++;return new Promise(done=>{resolve=done;});};
  const pending=f.probe.checkPhoto();f.probe.reset();
  resolve({response:{groups:[{id:242095689,is_admin:1,admin_level:3}]}});await pending;
  assert.equal(requests,1);assert.equal(f.probe.snapshot().phase,'READY');
});
test('an invalid or foreign community response fails before photo probe',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();
  let requests=0;f.bridge.send=async()=>{requests++;return {response:{groups:[{id:123,is_admin:1,admin_level:3}]}};};
  await f.probe.checkPhoto();assert.equal(requests,1);
  assert.equal(f.probe.snapshot().phase,'COMMUNITY_CONTROL_REQUIRED');
});

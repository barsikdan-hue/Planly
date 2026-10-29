import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbe } from '../experiments/vk-miniapp-probe/controller.mjs';

function fixture({scope='wall,photos,groups',admin=true,photoError=false}={}) {
  const calls=[];
  const token='synthetic-private-token-never-render';
  const bridge={send:async(method,params)=>{
    calls.push({method,params});
    if(method==='VKWebAppInit')return {};
    if(method==='VKWebAppGetAuthToken')return {access_token:token,scope};
    if(params.method==='groups.get')return {response:{count:admin?1:0,items:admin?[242095689]:[]}};
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
  assert.deepEqual(f.calls[1],{method:'VKWebAppGetAuthToken',params:{app_id:54809413,scope:'wall,photos,groups'}});
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
  assert.deepEqual(f.calls.filter(x=>x.method==='VKWebAppCallAPIMethod').map(x=>x.params.method),['groups.get','photos.getWallUploadServer']);
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
  const pending=f.probe.requestAccess();f.probe.reset();resolve({access_token:f.token,scope:'wall,photos,groups'});await pending;
  assert.equal(f.probe.snapshot().phase,'READY');await f.probe.checkPhoto();
  assert.equal(f.probe.snapshot().phase,'READY');
});
test('duplicate permission clicks start only one request',async()=>{
  const f=fixture();await f.probe.initialize();let resolve;let requests=0;
  f.bridge.send=()=>{requests++;return new Promise(done=>{resolve=done;});};
  const pending=f.probe.requestAccess();await f.probe.requestAccess();
  assert.equal(requests,1);resolve({access_token:f.token,scope:'wall,photos,groups'});await pending;
});
test('reset during community lookup prevents the next API request',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();let resolve;let requests=0;
  f.bridge.send=()=>{requests++;return new Promise(done=>{resolve=done;});};
  const pending=f.probe.checkPhoto();f.probe.reset();
  resolve({response:{count:1,items:[242095689]}});await pending;
  assert.equal(requests,1);assert.equal(f.probe.snapshot().phase,'READY');
});
test('an invalid or foreign community response fails before photo probe',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();
  let requests=0;f.bridge.send=async()=>{requests++;return {response:{count:1,items:[123]}};};
  await f.probe.checkPhoto();assert.equal(requests,1);
  assert.equal(f.probe.snapshot().phase,'COMMUNITY_CONTROL_REQUIRED');
});

test('missing groups grant blocks all API calls',async()=>{
  const f=fixture({scope:'wall,photos'});await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  assert.equal(f.probe.snapshot().phase,'MISSING_SCOPES');assert.equal(f.calls.length,2);
});
test('control proof is scoped to current token editor list and never exposes other IDs',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  assert.deepEqual(f.calls[2].params,{method:'groups.get',params:{access_token:f.token,v:'5.199',filter:'editor',extended:0,count:1000,offset:0}});
  assert.deepEqual(f.probe.snapshot().communityDiagnostic,{shape:'items_array',matched:true,complete:true});
  f.probe.reset();assert.equal(f.probe.snapshot().communityDiagnostic,null);
});
test('malformed, foreign and incomplete list responses fail closed without another request',async()=>{
  for(const response of [{count:1,items:['242095689']},{count:1,items:[123]},{count:2,items:[123]},{count:1,items:[{id:242095689}]},{count:0,items:[242095689]},{count:2,items:[242095689,242095689]}]){
    const f=fixture();await f.probe.initialize();await f.probe.requestAccess();let requests=0;
    f.bridge.send=async()=>{requests++;return {response};};
    await f.probe.checkPhoto();
    assert.equal(requests,1);assert.notEqual(f.probe.snapshot().phase,'PHOTO_ENDPOINT_AVAILABLE');
    assert.equal(JSON.stringify(f.probe.snapshot()).includes('private'),false);
  }
});

test('incomplete list is explicit and does not paginate automatically',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();let requests=0;
  f.bridge.send=async()=>{requests++;return {response:{count:1001,items:[123]}};};
  await f.probe.checkPhoto();assert.equal(requests,1);
  assert.equal(f.probe.snapshot().phase,'COMMUNITY_LIST_INCOMPLETE');
  assert.deepEqual(f.probe.snapshot().communityDiagnostic,{shape:'items_array',matched:false,complete:false});
});

test('valid target match never exposes other community IDs or extra response fields',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();const send=f.bridge.send;
  f.bridge.send=async(method,params)=>params.method==='groups.get'
    ?{response:{count:2,items:[987654321,242095689],secret:f.token}}:send(method,params);
  await f.probe.checkPhoto();assert.equal(f.probe.snapshot().phase,'PHOTO_ENDPOINT_AVAILABLE');
  assert.equal(JSON.stringify(f.probe.snapshot()).includes('987654321'),false);
  assert.equal(JSON.stringify(f.probe.snapshot()).includes(f.token),false);
  const snapshot=f.probe.snapshot();snapshot.communityDiagnostic.matched=false;
  assert.equal(f.probe.snapshot().communityDiagnostic.matched,true);
});

test('reset and fresh authorization cannot resume an old publication preflight',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  const send=f.bridge.send;let resolve;let uploads=0;let delay=true;
  f.bridge.send=(method,params)=>params.method==='groups.get'&&delay
    ?new Promise(done=>{resolve=done;}):send(method,params);
  const pending=f.probe.publishTest({image:new Blob(['test'],{type:'image/png'}),claim:()=>true,upload:async()=>{uploads++;throw {};}});
  f.probe.reset();delay=false;await f.probe.requestAccess();await f.probe.checkPhoto();
  resolve({response:{count:1,items:[242095689]}});await pending;
  assert.equal(uploads,0);assert.equal(f.probe.snapshot().phase,'PHOTO_ENDPOINT_AVAILABLE');
});

test('reset while generating image prevents claim and upload',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  let resolve;let claims=0;
  const pending=f.probe.publishTest({makeImage:()=>new Promise(done=>{resolve=done;}),claim:()=>{claims++;return true;},upload:async()=>{throw {};}});
  // Preflight has two awaited Bridge reads before image generation.
  while(!resolve)await new Promise(done=>setImmediate(done));
  f.probe.reset();resolve(new Blob(['test'],{type:'image/png'}));await pending;
  assert.equal(claims,0);assert.equal(f.probe.snapshot().phase,'READY');
});

test('local preflight inspection does not call VK or mutate operation marker',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();await f.probe.checkPhoto();
  const before=f.calls.length;let reads=0;
  await f.probe.inspectTest({makeImage:async()=>new Blob(['test'],{type:'image/png'}),storageStatus:()=>{reads++;return 'AVAILABLE';}});
  assert.equal(f.calls.length,before);assert.equal(reads,1);
  assert.deepEqual(f.probe.snapshot().preflight,{reason:'UPLOAD_HOST',storage:'AVAILABLE',host:'REDACTED'});
  f.probe.reset();assert.equal(f.probe.snapshot().preflight,null);
});

test('readback requires a grant, reads once and never starts publication',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.readbackTest();assert.equal(f.calls.length,1);
  await f.probe.requestAccess();let requests=0;
  f.bridge.send=async(method,params)=>{requests++;assert.equal(method,'VKWebAppCallAPIMethod');assert.equal(params.method,'wall.get');return {response:{count:0,items:[]}};};
  await f.probe.readbackTest();assert.equal(requests,1);
  assert.deepEqual(f.probe.snapshot().readback,{status:'NO_MATCH_IN_SAMPLE'});
  assert.equal(f.probe.snapshot().phase,'AUTHORIZED');
  f.probe.reset();assert.equal(f.probe.snapshot().readback,null);
});

test('reset discards late readback without restoring old state',async()=>{
  const f=fixture();await f.probe.initialize();await f.probe.requestAccess();let resolve;
  f.bridge.send=()=>new Promise(done=>{resolve=done;});
  const pending=f.probe.readbackTest();f.probe.reset();resolve({response:{count:0,items:[]}});await pending;
  assert.equal(f.probe.snapshot().readback,null);assert.equal(f.probe.snapshot().phase,'READY');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createVerifier,OPERATION,MESSAGE} from '../experiments/vk-render-check/core.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
function fixture(overrides={},readbackOnly=false) {
 let clock=1_800_000_000_000;
 const calls=[];
 const fetchImpl=async(url,init={})=>{
  const body=init.body instanceof URLSearchParams?Object.fromEntries(init.body):{};
  const method=new URL(url).pathname.split('/').at(-1);
  calls.push({url,body,init,method});
  if(overrides[method]){const value=await overrides[method](body);return value instanceof Response?value:Response.json(value);}
  const payload={auth:{access_token:'PRIVATE_ACCESS',refresh_token:'PRIVATE_REFRESH',state:body.state,expires_in:3600,scope:'wall photos'},
   'users.get':{response:[{id:815727447}]},
   'groups.getById':{response:{groups:[{id:242095689,type:'group',is_admin:1,admin_level:3,name:'test'}]}},
   'groups.get':{response:{count:1,items:[242095689]}},
   'photos.getWallUploadServer':{response:{upload_url:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1',album_id:-14,user_id:815727447,group_id:242095689}},
   'upload.php':{server:1,photo:'[{"photo":"opaque"}]',hash:'opaque'},
   'photos.saveWallPhoto':{response:[{id:42,owner_id:815727447}]},
   'wall.post':{response:{post_id:51}},
   'wall.getById':{response:{items:[{id:51,owner_id:-242095689,text:MESSAGE,attachments:[{type:'photo',photo:{id:42,owner_id:815727447}}]}]}}}[method];
  assert.ok(payload,`unexpected network method ${method}`);
  return Response.json(payload);
 };
 const v=createVerifier({origin:'https://vk-check.example',serviceToken:'PRIVATE_SERVICE',permitPublicKey:publicKey.export({type:'spki',format:'pem'}),fetchImpl,now:()=>clock,image:new Uint8Array([137,80,78,71,13,10,26,10,1]),readbackOnly});
 async function connect(){const u=new URL(v.start('owner-session'));return v.callback('owner-session',new URLSearchParams({state:u.searchParams.get('state'),code:'PRIVATE_CODE',device_id:'PRIVATE_DEVICE'}));}
 function permit(extra={}){const s=v.status();const payload={operation:OPERATION,bootId:s.bootId,grantId:s.grantId,expiresAt:clock+30_000,...extra};const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return {payload:encoded,signature:sign(null,Buffer.from(encoded),privateKey).toString('base64url')};}
 return {v,calls,connect,permit,advance:n=>clock+=n};
}

test('startup and status do not contact VK, expose secrets, or allow publication',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.v.status().status,'READY_FOR_AUTH');
 await assert.rejects(f.v.publish(f.permit()),/NOT_READY/);assert.equal(f.calls.length,0);
});
test('authorization requests the owned app, wall/photos, consent, random state and S256',()=>{
 const f=fixture();const u=new URL(f.v.start('owner-session'));
 assert.equal(u.origin,'https://id.vk.ru');assert.equal(u.searchParams.get('client_id'),'54809575');
 assert.equal(u.searchParams.get('scope'),'wall photos');assert.equal(u.searchParams.get('prompt'),'consent');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('code_challenge').length,43);
 assert.ok(u.searchParams.get('state').length>=32);assert.equal(u.searchParams.has('service_token'),false);
});
test('callback rejects session/state mismatch and duplicate fields before network',async()=>{
 for(const type of ['session','state','duplicates']){const f=fixture();const u=new URL(f.v.start('owner-session'));const q=new URLSearchParams({state:u.searchParams.get('state'),code:'code',device_id:'dev'});
  if(type==='state')q.set('state','wrong');if(type==='duplicates')q.append('code','other');
  const r=await f.v.callback(type==='session'?'foreign':'owner-session',q);assert.equal(r.status,'AUTH_FAILED');assert.equal(f.calls.length,0);
 }
});
test('expired state fails without token exchange',async()=>{const f=fixture();const u=new URL(f.v.start('owner-session'));f.advance(600_001);await f.v.callback('owner-session',new URLSearchParams({state:u.searchParams.get('state'),code:'c',device_id:'d'}));assert.equal(f.calls.length,0);});
test('returned state and wall/photos are independently required',async()=>{
 for(const extra of [{state:'wrong'},{scope:'email'},{scope:undefined}]){
  const f=fixture({auth:b=>({access_token:'PRIVATE_ACCESS',refresh_token:'PRIVATE_REFRESH',expires_in:3600,scope:'wall photos',state:b.state,...extra})});
  assert.equal((await f.connect()).status,'AUTH_FAILED');assert.equal(f.calls.length,1);
 }
});
test('failed OAuth attempt cannot be restarted in same boot with stale scope/identity diagnostics',async()=>{const f=fixture({'users.get':()=>({response:[{id:123}]})});await f.connect();const before=f.v.status();assert.throws(()=>f.v.start('owner-session'),/AUTH_ALREADY_USED/);assert.deepEqual(f.v.status(),before);assert.equal(f.calls.length,2);});
test('wrong current VK user stops before group/photo/upload calls',async()=>{const f=fixture({'users.get':()=>({response:[{id:123}]})});await f.connect();assert.equal(f.v.status().reason,'IDENTITY_MISMATCH');assert.deepEqual(f.calls.map(c=>c.method),['auth','users.get']);});
test('current-user query never supplies an explicit user_ids',async()=>{const f=fixture();assert.equal((await f.connect()).status,'PERMISSIONS_VERIFIED');assert.equal(f.calls.find(c=>c.method==='users.get').body.user_ids,undefined);assert.equal(f.calls.length,4);});
test('strict editor/admin gate remains intact with finite role diagnostics',async()=>{
 const f=fixture({'groups.getById':()=>({response:{groups:[{id:242095689,type:'group',is_admin:0,admin_level:1}]}})});
 await f.connect();assert.equal(f.v.status().status,'AUTH_FAILED');assert.equal(f.v.status().reason,'VK_POST_PERMISSION');assert.equal(f.v.status().roles.adminLevel,'MODERATOR');assert.equal(f.calls.length,3);
});
test('observed missing role fields use positive editor-list proof and remain upload/post free',async()=>{const f=fixture({'groups.getById':()=>({response:{groups:[{id:242095689,type:'group',name:'test'}]}})});const r=await f.connect();assert.equal(r.status,'PERMISSIONS_VERIFIED');assert.deepEqual(r.roles,{isAdmin:'MISSING',adminLevel:'MISSING'});assert.equal(r.managementProof,'EDITOR_FILTER');assert.deepEqual(f.calls.map(c=>c.method),['auth','users.get','groups.getById','groups.get','photos.getWallUploadServer']);assert.equal(f.calls.find(c=>c.method==='groups.get').body.user_id,undefined);});
test('missing role proof API denial is reported before any upload/post or false permission success',async()=>{const f=fixture({'groups.getById':()=>({response:{groups:[{id:242095689,type:'group'}]}}),'groups.get':()=>({error:{error_code:1051,error_msg:'PRIVATE_ACCESS'}})});const r=await f.connect();assert.equal(r.status,'AUTH_FAILED');assert.equal(r.diagnostic.vkErrorCode,1051);assert.equal(r.diagnostic.stage,'COMMUNITY_VALIDATION');assert.equal(f.calls.length,4);assert.equal(JSON.stringify(r).includes('PRIVATE_ACCESS'),false);});
test('role diagnostics do not label string role values as valid numbers',async()=>{const f=fixture({'groups.getById':()=>({response:{groups:[{id:242095689,type:'group',is_admin:'1',admin_level:'2'}]}})});await f.connect();assert.equal(f.v.status().roles.isAdmin,'INVALID');assert.equal(f.v.status().roles.adminLevel,'INVALID');assert.equal(f.v.status().status,'AUTH_FAILED');});
test('1051 is reported as provider denial without a fallback or mutation',async()=>{const f=fixture({'photos.getWallUploadServer':()=>({error:{error_code:1051,error_msg:'PRIVATE_ACCESS'}})});await f.connect();const r=f.v.status();assert.equal(r.vkErrorCode,1051);assert.equal(r.status,'AUTH_FAILED');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(f.calls.length,4);});
test('authorization callback is single-use and never uploads/posts',async()=>{const f=fixture();await f.connect();const count=f.calls.length;const r=await f.v.callback('owner-session',new URLSearchParams({state:'anything',code:'c',device_id:'d'}));assert.equal(r.status,'PERMISSIONS_VERIFIED');assert.equal(f.calls.length,count);});
test('foreign-host upload URL fails preflight without posting',async()=>{const f=fixture({'photos.getWallUploadServer':()=>({response:{upload_url:'https://evil.example/upload',album_id:1,user_id:815727447}})});await f.connect();assert.equal(f.v.status().status,'AUTH_FAILED');assert.equal(f.calls.length,4);});
test('signed short-lived permit is bound to boot/grant/op; no unsigned send',async()=>{
 for(const change of [{bootId:'foreign'},{grantId:'foreign'},{operation:'old-attempt'},{expiresAt:1}]){const f=fixture();await f.connect();await assert.rejects(f.v.publish(f.permit(change)),/PERMIT/);assert.equal(f.calls.length,4);}
 const f=fixture();await f.connect();const p=f.permit();p.signature='invalid';await assert.rejects(f.v.publish(p),/PERMIT/);assert.equal(f.calls.length,4);
});
test('one publication reuses connector upload/save guards and confirms exact wall readback',async()=>{
 const f=fixture();await f.connect();const p=f.permit();const r=await f.v.publish(p);assert.equal(r.status,'POST_CONFIRMED');assert.equal(r.postUrl,'https://vk.com/wall-242095689_51');
 assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);assert.equal(f.calls.find(c=>c.method==='wall.post').body.guid,OPERATION);assert.equal(f.calls.find(c=>c.method==='wall.post').body.message,MESSAGE);
 await assert.rejects(f.v.publish(p),/ATTEMPTED/);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);
});
test('concurrent publication admits one request before any await',async()=>{const f=fixture();await f.connect();const p=f.permit();const r=await Promise.allSettled([f.v.publish(p),f.v.publish(p)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);});
test('unknown wall outcome is terminal; no automatic resend/readback by guessed id',async()=>{const f=fixture({'wall.post':()=>{throw new Error('PRIVATE_ACCESS url=PRIVATE_UPLOAD');}});await f.connect();const p=f.permit();const r=await f.v.publish(p);assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.reason,'AMBIGUOUS_DELIVERY');await assert.rejects(f.v.publish(p),/ATTEMPTED/);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);});
test('saved photo of foreign owner stops before wall.post; owner guard is not relaxed',async()=>{const f=fixture({'photos.saveWallPhoto':()=>({response:[{id:42,owner_id:777}]})});await f.connect();const r=await f.v.publish(f.permit());assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.diagnostic.photoReceiptReason,'PHOTO_OWNER_MISMATCH');assert.equal(f.calls.some(c=>c.method==='wall.post'),false);});
test('invalid upload receipt captures closed field diagnostics, preserves guard and never saves/posts',async()=>{const f=fixture({'upload.php':()=>({server:0,photo:'[]',hash:'PRIVATE_UPLOAD_HASH'})});await f.connect();const p=f.permit();const r=await f.v.publish(p);assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.stage,'UPLOAD_RESPONSE');assert.equal(r.uploadResponse.server,'ZERO');assert.equal(r.uploadResponse.photo,'EMPTY_ARRAY');assert.equal(r.uploadResponse.hash,'PRESENT');assert.equal(r.uploadResponse.reason,'SERVER_INVALID');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(f.calls.filter(c=>c.method==='upload.php').length,1);assert.equal(f.calls.some(c=>['photos.saveWallPhoto','wall.post'].includes(c.method)),false);await assert.rejects(f.v.publish(p),/ATTEMPTED/);});
test('restart cannot use an old signed permit and does not recover token',async()=>{const a=fixture();await a.connect();const p=a.permit();const b=fixture();await b.connect();await assert.rejects(b.v.publish(p),/PERMIT/);assert.equal(b.calls.length,4);});
test('expired in-memory credential cannot upload',async()=>{const f=fixture();await f.connect();const p=f.permit();f.advance(1_200_001);await assert.rejects(f.v.publish(p),/NOT_READY/);assert.equal(f.calls.length,4);});
test('mismatched wall text/photo is unconfirmed even with wall.post receipt',async()=>{const f=fixture({'wall.getById':()=>({response:{items:[{id:51,owner_id:-242095689,text:'wrong',attachments:[]}]}})});await f.connect();const r=await f.v.publish(f.permit());assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.reason,'READBACK_MISMATCH');assert.equal(r.postUrl,'https://vk.com/wall-242095689_51');});

test('read-only mode can read only posts5/6 once, has no retained expected photo identity and cannot publish',async()=>{
 const f=fixture({'wall.getById':p=>({response:{items:[{...matchingPost(),id:Number(p.posts.split('_')[1])}]}})},true);
 await assert.rejects(f.v.readExisting(),/NOT_READY/);await f.connect();
 await assert.rejects(f.v.publish(f.permit()),/READ_ONLY_MODE/);
 const result=await f.v.readExisting();assert.equal(result.status,'READBACK_OBSERVED');assert.equal(result.observations.length,2);
 for(const [i,entry]of result.observations.entries()){
  assert.equal(entry.postNumber,5+i);const d=entry.readbackDiagnostic;
  assert.equal(d.postIdMatches,true);assert.equal(d.wallOwnerMatches,true);assert.equal(d.textMatches,true);assert.equal(d.photoCountMatches,true);
  assert.equal(d.photoIdentityMatches,null);assert.equal(d.unavailable.photoIdentityMatches,'EXPECTED_IDENTITY_NOT_RETAINED');assert.equal(d.reason,'READBACK_INCOMPLETE');
 }
 assert.deepEqual(f.calls.filter(c=>c.method==='wall.getById').map(c=>c.body.posts),['-242095689_5','-242095689_6']);
 assert.equal(f.calls.some(c=>['photos.getWallUploadServer','upload.php','photos.saveWallPhoto','wall.post'].includes(c.method)),false);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);await assert.rejects(f.v.readExisting(),/READ_ALREADY_USED/);
});

test('read-only existing-post inspection is unavailable in publication mode',async()=>{
 const f=fixture();await f.connect();await assert.rejects(f.v.readExisting(),/READ_ONLY_MODE/);
});

test('concurrent existing-post inspections admit one bounded pair; failed first read does not expand the budget',async()=>{
 const f=fixture({'wall.getById':p=>p.posts.endsWith('_5')?{error:{error_code:15,error_msg:'PRIVATE'}}:{response:{items:[{...matchingPost(),id:6}]}}},true);await f.connect();
 const results=await Promise.allSettled([f.v.readExisting(),f.v.readExisting()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const result=results.find(r=>r.status==='fulfilled').value;assert.equal(result.observations[0].readbackDiagnostic.reason,'READBACK_API_ERROR');assert.equal(result.observations[1].readbackDiagnostic.reason,'READBACK_INCOMPLETE');
 assert.equal(f.calls.filter(c=>c.method==='wall.getById').length,2);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);await assert.rejects(f.v.readExisting(),/READ_ALREADY_USED/);
});

test('expired read-only credentials do not issue an existing-post request',async()=>{
 const f=fixture({},true);await f.connect();f.advance(1_200_001);await assert.rejects(f.v.readExisting(),/NOT_READY/);assert.equal(f.calls.some(c=>c.method==='wall.getById'),false);
});

const matchingPost=()=>({id:51,owner_id:-242095689,text:MESSAGE,attachments:[{type:'photo',photo:{id:42,owner_id:815727447}}]});
const allReadbackChecks={postIdMatches:true,wallOwnerMatches:true,textMatches:true,photoCountMatches:true,photoIdentityMatches:true};
for(const [label,change,failed] of [
 ['post ID',p=>{p.id=52;},'postIdMatches'],
 ['wall owner',p=>{p.owner_id=-242095688;},'wallOwnerMatches'],
 ['text',p=>{p.text='PRIVATE_DIAGNOSTIC_TEXT';},'textMatches'],
 ['photo count',p=>{p.attachments=[];},'photoCountMatches'],
 ['photo ID',p=>{p.attachments[0].photo.id=43;},'photoIdentityMatches'],
 ['photo owner',p=>{p.attachments[0].photo.owner_id=777;},'photoIdentityMatches'],
 ['all match',()=>{},null],
])test(`closed readback diagnostics isolate ${label} without altering acceptance`,async()=>{
 const post=matchingPost();change(post);const f=fixture({'wall.getById':()=>({response:{items:[post]}})});await f.connect();const permit=f.permit();const result=await f.v.publish(permit);
 assert.equal(result.status,failed==='photoIdentityMatches'?'POST_CREATED_MEDIA_UNVERIFIED':failed?'OUTCOME_UNCONFIRMED':'POST_CONFIRMED');
 const d=result.readbackDiagnostic;assert.ok(d);assert.equal(d.reason,failed?'READBACK_MISMATCH':'READBACK_MATCH');assert.equal(d.responseType,'OBJECT');assert.equal(d.itemsCount,1);
 for(const [name,value]of Object.entries(allReadbackChecks))assert.equal(d[name],name===failed?false:failed==='photoCountMatches'&&name==='photoIdentityMatches'?null:value);
 assert.deepEqual(d.unavailable,failed==='photoCountMatches'?{photoIdentityMatches:'PHOTO_COUNT_NOT_ONE'}:{});
 assert.equal(JSON.stringify(d).includes('PRIVATE_DIAGNOSTIC_TEXT'),false);assert.equal(JSON.stringify(d).includes(MESSAGE),false);
 assert.equal(result.postUrl,'https://vk.com/wall-242095689_51');await assert.rejects(f.v.publish(permit),/ATTEMPTED/);
 assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);assert.equal(f.calls.filter(c=>c.method==='wall.getById').length,1);
});

test('canonical group photo replacement never becomes exact-content confirmation',async()=>{
 const post=matchingPost();post.attachments[0].photo={id:99,owner_id:-242095689};
 const f=fixture({'wall.getById':()=>({response:{items:[post]}})});await f.connect();const permit=f.permit();const result=await f.v.publish(permit);
 assert.equal(result.status,'POST_CREATED_MEDIA_UNVERIFIED');assert.equal(result.reason,'PHOTO_IDENTITY_CHANGED');assert.equal(result.readbackDiagnostic.photoIdentityMatches,false);
 assert.deepEqual(result.readbackDiagnostic.photoIdentityDetails,{ownerMatches:false,idMatches:false,expectedOwnerIsWall:false,actualOwnerIsWall:true});
 assert.notEqual(result.status,'POST_CONFIRMED');assert.equal(result.postUrl,'https://vk.com/wall-242095689_51');await assert.rejects(f.v.publish(permit),/ATTEMPTED/);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);
});

for(const [label,response,reason]of [
 ['array envelope',[matchingPost()],'READBACK_INVALID_SHAPE'],
 ['missing items',{},'READBACK_INVALID_SHAPE'],
 ['non-array items',{items:'PRIVATE_SIGNED_URL'},'READBACK_INVALID_SHAPE'],
 ['empty items',{items:[]},'READBACK_ITEM_MISSING'],
 ['null post',{items:[null]},'READBACK_INVALID_SHAPE'],
 ['multiple posts',{items:[matchingPost(),matchingPost()]},'READBACK_INVALID_SHAPE'],
])test(`readback ${label} has explicit reason and unavailable comparisons`,async()=>{
 const f=fixture({'wall.getById':()=>({response})});await f.connect();const result=await f.v.publish(f.permit());assert.equal(result.status,'OUTCOME_UNCONFIRMED');assert.equal(result.reason,reason);
 const d=result.readbackDiagnostic;assert.equal(d.reason,reason);for(const name of Object.keys(allReadbackChecks)){assert.equal(d[name],null);assert.equal(d.unavailable[name],'POST_UNAVAILABLE');}
 assert.equal(JSON.stringify(d).includes('PRIVATE'),false);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);
});

test('missing post fields leave independent comparisons evaluated and explain unavailable checks',async()=>{
 const post=matchingPost();delete post.id;delete post.attachments;
 const f=fixture({'wall.getById':()=>({response:{items:[post]}})});await f.connect();const r=await f.v.publish(f.permit());const d=r.readbackDiagnostic;
 assert.equal(r.reason,'READBACK_INVALID_SHAPE');assert.equal(d.postIdMatches,null);assert.equal(d.wallOwnerMatches,true);assert.equal(d.textMatches,true);assert.equal(d.photoCountMatches,null);assert.equal(d.photoIdentityMatches,null);
 assert.deepEqual(d.unavailable,{postIdMatches:'FIELD_MISSING',photoCountMatches:'FIELD_MISSING',photoIdentityMatches:'FIELD_MISSING'});
});

for(const [label,reply,errorType]of [
 ['VK API',()=>({error:{error_code:15,error_msg:'PRIVATE_TOKEN access_key=PRIVATE_KEY'}}),'VK_API'],
 ['untyped VK API',()=>({error:{error_msg:'PRIVATE_TOKEN'}}),'VK_API'],
 ['transport',()=>{throw new Error('PRIVATE_TOKEN https://signed.example/?secret=PRIVATE_KEY');},'TRANSPORT'],
 ['HTTP',()=>Response.json({response:{items:[]}},{status:503}),'HTTP'],
])test(`readback ${label} failure preserves receipt and exposes only closed error type`,async()=>{
 const f=fixture({'wall.getById':reply});await f.connect();const permit=f.permit();const r=await f.v.publish(permit);
 assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.reason,'READBACK_API_ERROR');assert.equal(r.readbackDiagnostic.errorType,errorType);
 for(const name of Object.keys(allReadbackChecks)){assert.equal(r.readbackDiagnostic[name],null);assert.equal(r.readbackDiagnostic.unavailable[name],'READBACK_ERROR');}
 assert.equal(r.postUrl,'https://vk.com/wall-242095689_51');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);await assert.rejects(f.v.publish(permit),/ATTEMPTED/);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);
});

for(const [label,reply]of [
 ['missing response',()=>({unexpected:'PRIVATE_TOKEN'})],
 ['invalid JSON',()=>new Response('PRIVATE_TOKEN not JSON')],
 ['non-object HTTP200 envelope',()=>Response.json([])],
])test(`readback ${label} is invalid shape, without guessing content comparisons`,async()=>{
 const f=fixture({'wall.getById':reply});await f.connect();const r=await f.v.publish(f.permit());
 assert.equal(r.reason,'READBACK_INVALID_SHAPE');assert.equal(r.readbackDiagnostic.errorType,'RESPONSE_SHAPE');
 for(const name of Object.keys(allReadbackChecks)){assert.equal(r.readbackDiagnostic[name],null);assert.equal(r.readbackDiagnostic.unavailable[name],'READBACK_ERROR');}
 assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(f.calls.filter(c=>c.method==='wall.post').length,1);
});

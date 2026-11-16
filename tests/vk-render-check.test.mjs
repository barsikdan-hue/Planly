import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createVerifier,OPERATION,MESSAGE} from '../experiments/vk-render-check/core.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
function fixture(overrides={}) {
 let clock=1_800_000_000_000;
 const calls=[];
 const fetchImpl=async(url,init={})=>{
  const body=init.body instanceof URLSearchParams?Object.fromEntries(init.body):{};
  const method=new URL(url).pathname.split('/').at(-1);
  calls.push({url,body,init,method});
  if(overrides[method])return Response.json(await overrides[method](body));
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
 const v=createVerifier({origin:'https://vk-check.example',serviceToken:'PRIVATE_SERVICE',permitPublicKey:publicKey.export({type:'spki',format:'pem'}),fetchImpl,now:()=>clock,image:new Uint8Array([137,80,78,71,13,10,26,10,1])});
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
test('restart cannot use an old signed permit and does not recover token',async()=>{const a=fixture();await a.connect();const p=a.permit();const b=fixture();await b.connect();await assert.rejects(b.v.publish(p),/PERMIT/);assert.equal(b.calls.length,4);});
test('expired in-memory credential cannot upload',async()=>{const f=fixture();await f.connect();const p=f.permit();f.advance(1_200_001);await assert.rejects(f.v.publish(p),/NOT_READY/);assert.equal(f.calls.length,4);});
test('mismatched wall text/photo is unconfirmed even with wall.post receipt',async()=>{const f=fixture({'wall.getById':()=>({response:{items:[{id:51,owner_id:-242095689,text:'wrong',attachments:[]}]}})});await f.connect();const r=await f.v.publish(f.permit());assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.reason,'READBACK_MISMATCH');assert.equal(r.postUrl,'https://vk.com/wall-242095689_51');});

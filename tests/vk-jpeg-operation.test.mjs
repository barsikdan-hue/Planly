import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,verify,createHash} from 'node:crypto';
import {createVerifier,OPERATION,MESSAGE} from '../experiments/vk-render-check/core.mjs';
import {createPrivateConfig,configureOrigin,publishOnce} from '../experiments/vk-render-check/controller.mjs';

const jpegOperation='vk-render-jpeg-20261116-02';
const image=readFileSync(new URL('../experiments/vk-render-check/fixture.jpg',import.meta.url));
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
test('JPG fixture is real baseline JPEG with fixed dimensions and end marker',()=>{assert.equal(image.length,37492);assert.equal(createHash('sha256').update(image).digest('hex'),'ef1719b302758a7235fe532244754e74a623168104ed0ca38994bf104c71e97e');assert.equal(image.readUInt16BE(0),0xffd8);assert.equal(image.readUInt16BE(image.length-2),0xffd9);let p=2,found=false;while(p<image.length){assert.equal(image[p++],255);while(image[p]===255)p++;const marker=image[p++];if(marker===0xda)break;const length=image.readUInt16BE(p);assert.ok(length>=2&&p+length<=image.length);if([0xc0,0xc1,0xc2].includes(marker)){assert.equal(image[p+2],8);assert.equal(image.readUInt16BE(p+3),600);assert.equal(image.readUInt16BE(p+5),1000);assert.equal(image[p+7],3);found=true;}p+=length;}assert.ok(found);});
test('new JPEG operation sends actual JPEG part and preserves unchanged multipart/receipt guards',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{
  const method=new URL(url).pathname.split('/').at(-1);calls.push(method);
  const p=init.body instanceof URLSearchParams?Object.fromEntries(init.body):{};
  if(method==='auth')return Response.json({state:p.state,access_token:'jpeg-private-access',expires_in:3600,scope:'wall photos'});
  if(method==='users.get')return Response.json({response:[{id:815727447}]});
  if(method==='groups.getById')return Response.json({response:{groups:[{id:242095689,type:'group',is_admin:1,admin_level:3}]}});
  if(method==='photos.getWallUploadServer')return Response.json({response:{album_id:-14,user_id:815727447,group_id:242095689,upload_url:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1'}});
  if(method==='upload.php'){
   const file=init.body.get('photo');assert.equal(file.type,'image/jpeg');assert.equal(file.name,'photo.jpg');assert.deepEqual(Buffer.from(await file.arrayBuffer()),image);assert.equal(init.redirect,'error');assert.equal(init.headers,undefined);assert.equal(init.body.get('access_token'),null);
   return Response.json({server:0,photo:'[]',hash:'private-receipt'});
  }
  assert.fail('save/post must never follow invalid upload receipt');
 };
 const v=createVerifier({origin:'https://jpeg.example',serviceToken:'private-service',permitPublicKey:publicKey.export({type:'spki',format:'pem'}),fetchImpl,image,operation:jpegOperation});
 assert.equal(v.status().operation,jpegOperation);const u=new URL(v.start('jpeg-owner-session'));
 await v.callback('jpeg-owner-session',new URLSearchParams({state:u.searchParams.get('state'),code:'private-code',device_id:'private-device'}));assert.equal(v.status().status,'PERMISSIONS_VERIFIED');
 const state=v.status();const payload=Buffer.from(JSON.stringify({operation:jpegOperation,bootId:state.bootId,grantId:state.grantId,expiresAt:Date.now()+30000})).toString('base64url');const permit={payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64url')};
 const oldPayload=Buffer.from(JSON.stringify({operation:OPERATION,bootId:state.bootId,grantId:state.grantId,expiresAt:Date.now()+30000})).toString('base64url');await assert.rejects(v.publish({payload:oldPayload,signature:sign(null,Buffer.from(oldPayload),privateKey).toString('base64url')}),/PERMIT/);assert.equal(v.status().attempted,false);
 const r=await v.publish(permit);assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(r.uploadResponse.server,'ZERO');assert.equal(r.attempted,true);assert.equal(calls.filter(m=>m==='upload.php').length,1);await assert.rejects(v.publish(permit),/ATTEMPTED/);
});
test('JPEG experiment cannot silently send a PNG or accept unknown operation',()=>{
 const common={origin:'https://jpeg.example',serviceToken:'s',permitPublicKey:publicKey.export({type:'spki',format:'pem'})};
 assert.throws(()=>createVerifier({...common,operation:jpegOperation,image:readFileSync(new URL('../experiments/vk-render-check/fixture.png',import.meta.url))}),/IMAGE_CONFIG/);
 assert.throws(()=>createVerifier({...common,operation:'unapproved-op',image}),/OPERATION_CONFIG/);
 assert.ok(MESSAGE.length>0);assert.notEqual(OPERATION,jpegOperation);
});
test('JPEG controller uses separate durable markers and verifies server operation before claiming',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vk-jpeg-'));const dir=join(root,'private');try{
  createPrivateConfig(dir);configureOrigin(dir,'https://jpeg-check.onrender.com');
  writeFileSync(join(dir,'ATTEMPTED.json'),'old-png-attempt');writeFileSync(join(dir,'result.json'),'old-png-result');
  const c=JSON.parse(readFileSync(join(dir,'config.json'),'utf8'));let posts=0;
  const fetchImpl=async(url,init)=>{
   if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation:jpegOperation,bootId:'boot',grantId:'grant',expiresAt:Date.now()+60000,attempted:false});
   posts++;assert.ok(existsSync(join(dir,'JPEG_ATTEMPTED.json')));const p=JSON.parse(init.body);assert.equal(JSON.parse(Buffer.from(p.payload,'base64url').toString()).operation,jpegOperation);assert.ok(verify(null,Buffer.from(p.payload),c.publicKey,Buffer.from(p.signature,'base64url')));return Response.json({status:'OUTCOME_UNCONFIRMED',operation:jpegOperation});
  };
  await publishOnce(dir,{fetchImpl,operation:jpegOperation});assert.equal(posts,1);assert.ok(existsSync(join(dir,'jpeg-result.json')));assert.equal(readFileSync(join(dir,'ATTEMPTED.json'),'utf8'),'old-png-attempt');assert.equal(readFileSync(join(dir,'result.json'),'utf8'),'old-png-result');await assert.rejects(publishOnce(dir,{fetchImpl,operation:jpegOperation}),/ALREADY_ATTEMPTED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('mismatched server operation fails before JPEG claim/send',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vk-jpeg-mismatch-'));const dir=join(root,'private');try{createPrivateConfig(dir);configureOrigin(dir,'https://jpeg-check.onrender.com');let calls=0;
  const fetchImpl=async()=>{calls++;return Response.json({status:'PERMISSIONS_VERIFIED',operation:OPERATION,bootId:'b',grantId:'g',expiresAt:Date.now()+60000});};
  await assert.rejects(publishOnce(dir,{fetchImpl,operation:jpegOperation}),/NOT_READY/);assert.equal(calls,1);assert.equal(existsSync(join(dir,'JPEG_ATTEMPTED.json')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
for(const selectedOperation of [jpegOperation,'vk-render-jpeg-20261116-03','vk-render-png-20261116-04','vk-render-diagnostic-20261118-05']) test(`Image ${selectedOperation} valid save with optional access_key and exact readback once`,async()=>{
 const isPng=selectedOperation.endsWith('-04')||selectedOperation.endsWith('-05');const selectedImage=isPng?readFileSync(new URL('../experiments/vk-render-check/fixture.png',import.meta.url)):image;
 let uploads=0,posts=0;
 const fetchImpl=async(url,init)=>{const m=new URL(url).pathname.split('/').at(-1),p=init.body instanceof URLSearchParams?Object.fromEntries(init.body):{};
  if(m==='auth')return Response.json({state:p.state,access_token:'jpeg-token',expires_in:3600,scope:'wall photos'});
  if(m==='users.get')return Response.json({response:[{id:815727447}]});
  if(m==='groups.getById')return Response.json({response:{groups:[{id:242095689,type:'group'}]}});
  if(m==='groups.get'){assert.equal(p.filter,'editor');assert.equal(p.user_id,undefined);return Response.json({response:{count:1,items:[242095689]}});}
  if(m==='photos.getWallUploadServer')return Response.json({response:{album_id:-14,user_id:815727447,group_id:242095689,upload_url:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1'}});
  if(m==='upload.php'){uploads++;assert.equal(init.body.get('photo').type,isPng?'image/png':'image/jpeg');assert.deepEqual(Buffer.from(await init.body.get('photo').arrayBuffer()),selectedImage);return Response.json({server:12,photo:'opaque-jpeg',hash:'private-hash'});}
  if(m==='photos.saveWallPhoto')return Response.json({response:[{id:43,owner_id:815727447,access_key:'private-photo-key'}]});
  if(m==='wall.post'){posts++;assert.equal(p.guid,selectedOperation);assert.equal(p.message,MESSAGE);assert.equal(p.attachments,'photo815727447_43');return Response.json({response:{post_id:53}});}
  if(m==='wall.getById')return Response.json({response:{items:[{id:53,owner_id:-242095689,text:MESSAGE,attachments:[{type:'photo',photo:{id:43,owner_id:815727447}}]}]}});
  assert.fail('unexpected provider method');
 };
 const v=createVerifier({origin:'https://jpeg.example',serviceToken:'s',permitPublicKey:publicKey.export({type:'spki',format:'pem'}),fetchImpl,image:selectedImage,operation:selectedOperation});
 const u=new URL(v.start('jpeg-owner-session'));await v.callback('jpeg-owner-session',new URLSearchParams({state:u.searchParams.get('state'),code:'c',device_id:'d'}));assert.equal(v.status().managementProof,'EDITOR_FILTER');
 const s=v.status();const payload=Buffer.from(JSON.stringify({operation:selectedOperation,bootId:s.bootId,grantId:s.grantId,expiresAt:Date.now()+30000})).toString('base64url');const permit={payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64url')};
 if(selectedOperation!==jpegOperation){const old=Buffer.from(JSON.stringify({operation:jpegOperation,bootId:s.bootId,grantId:s.grantId,expiresAt:Date.now()+30000})).toString('base64url');await assert.rejects(v.publish({payload:old,signature:sign(null,Buffer.from(old),privateKey).toString('base64url')}),/PERMIT/);assert.equal(uploads,0);assert.equal(v.status().attempted,false);}
 assert.equal((await v.publish(permit)).status,'POST_CONFIRMED');assert.equal(uploads,1);assert.equal(posts,1);await assert.rejects(v.publish(permit),/ATTEMPTED/);
});

test('JPEG03 uses separate durable claim while preserving consumed PNG01/JPEG02',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vk-jpeg03-'));const dir=join(root,'private');
 try{createPrivateConfig(dir);configureOrigin(dir,'https://vk-check.onrender.com');
 for(const name of ['ATTEMPTED.json','JPEG_ATTEMPTED.json','result.json','jpeg-result.json'])writeFileSync(join(dir,name),'consumed');
 let posts=0;const operation='vk-render-jpeg-20261116-03';
 const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation,bootId:'b',grantId:'g',expiresAt:Date.now()+60000});posts++;assert.ok(existsSync(join(dir,'JPEG03_ATTEMPTED.json')));return Response.json({status:'POST_CONFIRMED',operation});};
 assert.equal((await publishOnce(dir,{operation,fetchImpl})).status,'POST_CONFIRMED');
 await assert.rejects(publishOnce(dir,{operation,fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(posts,1);
 for(const name of ['ATTEMPTED.json','JPEG_ATTEMPTED.json','result.json','jpeg-result.json'])assert.equal(readFileSync(join(dir,name),'utf8'),'consumed');
 assert.ok(existsSync(join(dir,'jpeg03-result.json')));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('PNG04 is a distinct fixed PNG operation, not a replay of consumed PNG01',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vk-png04-'));const dir=join(root,'private');
 try{createPrivateConfig(dir);configureOrigin(dir,'https://vk-check.onrender.com');
 const old=['ATTEMPTED.json','result.json','JPEG_ATTEMPTED.json','jpeg-result.json','JPEG03_ATTEMPTED.json','jpeg03-result.json'];
 for(const name of old)writeFileSync(join(dir,name),'consumed');
 let posts=0;const operation='vk-render-png-20261116-04';
 const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation,bootId:'b',grantId:'g',expiresAt:Date.now()+60000});posts++;assert.ok(existsSync(join(dir,'PNG04_ATTEMPTED.json')));return Response.json({status:'POST_CONFIRMED',operation});};
 assert.equal((await publishOnce(dir,{operation,fetchImpl})).status,'POST_CONFIRMED');await assert.rejects(publishOnce(dir,{operation,fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(posts,1);
 for(const name of old)assert.equal(readFileSync(join(dir,name),'utf8'),'consumed');assert.ok(existsSync(join(dir,'png04-result.json')));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('DIAG05 retains its own one-shot claim and per-predicate result without replaying01–04',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vk-diag05-'));const dir=join(root,'private');
 try{
  createPrivateConfig(dir);configureOrigin(dir,'https://vk-check.onrender.com');
  const old=['ATTEMPTED.json','result.json','JPEG_ATTEMPTED.json','jpeg-result.json','JPEG03_ATTEMPTED.json','jpeg03-result.json','PNG04_ATTEMPTED.json','png04-result.json'];for(const name of old)writeFileSync(join(dir,name),'consumed');
  const operation='vk-render-diagnostic-20261118-05';let calls=0;
  const fetchImpl=async(url,init)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation,bootId:'b',grantId:'g',expiresAt:Date.now()+60000});
   calls++;assert.ok(existsSync(join(dir,'DIAG05_ATTEMPTED.json')));const permit=JSON.parse(Buffer.from(JSON.parse(init.body).payload,'base64url'));assert.equal(permit.operation,operation);
   return Response.json({status:'OUTCOME_UNCONFIRMED',operation,readbackDiagnostic:{reason:'READBACK_MISMATCH',responseType:'OBJECT',itemsCount:1,postIdMatches:true,wallOwnerMatches:true,textMatches:true,photoCountMatches:true,photoIdentityMatches:false,unavailable:{}}});};
  const result=await publishOnce(dir,{operation,fetchImpl});assert.equal(result.readbackDiagnostic.photoIdentityMatches,false);assert.equal(result.readbackDiagnostic.textMatches,true);
  await assert.rejects(publishOnce(dir,{operation,fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(calls,1);assert.deepEqual(JSON.parse(readFileSync(join(dir,'diag05-result.json'),'utf8')),result);
  for(const name of old)assert.equal(readFileSync(join(dir,name),'utf8'),'consumed');
 }finally{rmSync(root,{recursive:true,force:true});}
});

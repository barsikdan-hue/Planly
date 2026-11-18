import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OPERATION} from '../experiments/vk-render-check/core.mjs';
import {createPrivateConfig,configureOrigin,publishOnce,publicEnvironment,readStatus,readExistingPosts} from '../experiments/vk-render-check/controller.mjs';
async function fixture(fn){const root=mkdtempSync(join(tmpdir(),'vk-local-test-'));const dir=join(root,'private');try{createPrivateConfig(dir);configureOrigin(dir,'https://planly-vk-check.onrender.com');await fn(dir);}finally{rmSync(root,{recursive:true,force:true});}}
test('private key generation is exclusive, export contains only necessary env, never signing private key',()=>fixture(async dir=>{assert.throws(()=>createPrivateConfig(dir));const config=JSON.parse(readFileSync(join(dir,'config.json'),'utf8'));const env=publicEnvironment(dir);assert.equal(env.length,3);assert.equal(JSON.stringify(env).includes(config.privateKey),false);assert.ok(env.some(e=>e.key==='VK_CHECK_OWNER_KEY'));assert.ok(env.some(e=>e.key==='VK_CHECK_PERMIT_PUBLIC_KEY'));}));
test('local claim is durable before the only POST and prevents every retry',()=>fixture(async dir=>{
 let posts=0;const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation:OPERATION,bootId:'boot',grantId:'grant',expiresAt:Date.now()+600000,attempted:false});
  posts++;assert.ok(existsSync(join(dir,'ATTEMPTED.json')));return Response.json({status:'POST_CONFIRMED',postUrl:'https://vk.com/wall-242095689_51'});};
 const result=await publishOnce(dir,{fetchImpl});assert.equal(result.status,'POST_CONFIRMED');assert.equal(posts,1);await assert.rejects(publishOnce(dir,{fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(posts,1);
}));
test('network ambiguity after claim cannot authorize another POST',()=>fixture(async dir=>{let posts=0;const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation:OPERATION,bootId:'b',grantId:'g',expiresAt:Date.now()+60000,attempted:false});posts++;throw new Error('SECRET_RAW_URL');};const r=await publishOnce(dir,{fetchImpl});assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(JSON.stringify(r).includes('SECRET'),false);await assert.rejects(publishOnce(dir,{fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(posts,1);}));
test('unready server never consumes the local claim or sends a mutation',()=>fixture(async dir=>{const fetchImpl=async()=>Response.json({status:'SERVICE_TOKEN_REQUIRED'});await assert.rejects(publishOnce(dir,{fetchImpl}),/NOT_READY/);assert.equal(existsSync(join(dir,'ATTEMPTED.json')),false);}));
test('concurrent local controllers can sign/send only one operation',()=>fixture(async dir=>{let posts=0;const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',operation:OPERATION,bootId:'b',grantId:'g',expiresAt:Date.now()+60000,attempted:false});posts++;return Response.json({status:'OUTCOME_UNCONFIRMED'});};const r=await Promise.allSettled([publishOnce(dir,{fetchImpl}),publishOnce(dir,{fetchImpl})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(posts,1);}));

test('controller retains closed readback diagnostics in result file and discards all raw fields',()=>fixture(async dir=>{
 const diagnostic={reason:'READBACK_MISMATCH',responseType:'OBJECT',itemsCount:1,postIdMatches:true,wallOwnerMatches:true,textMatches:false,photoCountMatches:true,photoIdentityMatches:true,unavailable:{},access_key:'PRIVATE_KEY',text:'PRIVATE_TEXT',url:'https://signed.example/?token=PRIVATE_TOKEN',payload:{secret:'PRIVATE_RAW'}};
 const fetchImpl=async url=>Response.json(url.endsWith('/api/status')?{status:'PERMISSIONS_VERIFIED',operation:OPERATION,bootId:'b',grantId:'g',expiresAt:Date.now()+60000}:{status:'OUTCOME_UNCONFIRMED',readbackDiagnostic:diagnostic});
 const result=await publishOnce(dir,{fetchImpl});assert.equal(result.readbackDiagnostic.textMatches,false);assert.equal(result.readbackDiagnostic.postIdMatches,true);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);const persisted=readFileSync(join(dir,'result.json'),'utf8');assert.equal(persisted.includes('PRIVATE'),false);assert.deepEqual(JSON.parse(persisted),result);
 const unsafe=await readStatus(dir,{fetchImpl:async()=>Response.json({status:'OUTCOME_UNCONFIRMED',readbackDiagnostic:{...diagnostic,textMatches:{secret:'PRIVATE'}}})});assert.equal(unsafe.readbackDiagnostic,undefined);
}));

test('existing-post controller uses only the fixed read endpoint, strips unknown post/secret data and never claims a send',()=>fixture(async dir=>{
 const diagnostic={reason:'READBACK_INCOMPLETE',responseType:'OBJECT',itemsCount:1,postIdMatches:true,wallOwnerMatches:true,textMatches:true,photoCountMatches:true,photoIdentityMatches:null,unavailable:{photoIdentityMatches:'EXPECTED_IDENTITY_NOT_RETAINED'},access_key:'PRIVATE'};
 let calls=0;const result=await readExistingPosts(dir,{fetchImpl:async(url,init)=>{calls++;assert.ok(url.endsWith('/api/readback-existing'));assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{});return Response.json({status:'READBACK_OBSERVED',observations:[{postNumber:5,readbackDiagnostic:diagnostic,raw:'PRIVATE'},{postNumber:999,readbackDiagnostic:diagnostic}]});}});
 assert.equal(calls,1);assert.equal(result.status,'READBACK_OBSERVED');assert.deepEqual(result.observations.map(x=>x.postNumber),[5]);assert.equal(result.observations[0].readbackDiagnostic.photoIdentityMatches,null);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 assert.equal(existsSync(join(dir,'ATTEMPTED.json')),false);
}));

test('created post with unverified media remains a distinct non-success controller status',()=>fixture(async dir=>{
 const result=await readStatus(dir,{fetchImpl:async()=>Response.json({status:'POST_CREATED_MEDIA_UNVERIFIED',reason:'PHOTO_IDENTITY_CHANGED',raw:'PRIVATE'})});
 assert.equal(result.status,'POST_CREATED_MEDIA_UNVERIFIED');assert.notEqual(result.status,'POST_CONFIRMED');assert.equal(result.reason,'PHOTO_IDENTITY_CHANGED');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
}));

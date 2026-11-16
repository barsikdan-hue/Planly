import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateConfig,configureOrigin,publishOnce,publicEnvironment} from '../experiments/vk-render-check/controller.mjs';
async function fixture(fn){const root=mkdtempSync(join(tmpdir(),'vk-local-test-'));const dir=join(root,'private');try{createPrivateConfig(dir);configureOrigin(dir,'https://planly-vk-check.onrender.com');await fn(dir);}finally{rmSync(root,{recursive:true,force:true});}}
test('private key generation is exclusive, export contains only necessary env, never signing private key',()=>fixture(async dir=>{assert.throws(()=>createPrivateConfig(dir));const config=JSON.parse(readFileSync(join(dir,'config.json'),'utf8'));const env=publicEnvironment(dir);assert.equal(env.length,3);assert.equal(JSON.stringify(env).includes(config.privateKey),false);assert.ok(env.some(e=>e.key==='VK_CHECK_OWNER_KEY'));assert.ok(env.some(e=>e.key==='VK_CHECK_PERMIT_PUBLIC_KEY'));}));
test('local claim is durable before the only POST and prevents every retry',()=>fixture(async dir=>{
 let posts=0;const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',bootId:'boot',grantId:'grant',expiresAt:Date.now()+600000,attempted:false});
  posts++;assert.ok(existsSync(join(dir,'ATTEMPTED.json')));return Response.json({status:'POST_CONFIRMED',postUrl:'https://vk.com/wall-242095689_51'});};
 const result=await publishOnce(dir,{fetchImpl});assert.equal(result.status,'POST_CONFIRMED');assert.equal(posts,1);await assert.rejects(publishOnce(dir,{fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(posts,1);
}));
test('network ambiguity after claim cannot authorize another POST',()=>fixture(async dir=>{let posts=0;const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',bootId:'b',grantId:'g',expiresAt:Date.now()+60000,attempted:false});posts++;throw new Error('SECRET_RAW_URL');};const r=await publishOnce(dir,{fetchImpl});assert.equal(r.status,'OUTCOME_UNCONFIRMED');assert.equal(JSON.stringify(r).includes('SECRET'),false);await assert.rejects(publishOnce(dir,{fetchImpl}),/ALREADY_ATTEMPTED/);assert.equal(posts,1);}));
test('unready server never consumes the local claim or sends a mutation',()=>fixture(async dir=>{const fetchImpl=async()=>Response.json({status:'SERVICE_TOKEN_REQUIRED'});await assert.rejects(publishOnce(dir,{fetchImpl}),/NOT_READY/);assert.equal(existsSync(join(dir,'ATTEMPTED.json')),false);}));
test('concurrent local controllers can sign/send only one operation',()=>fixture(async dir=>{let posts=0;const fetchImpl=async(url)=>{if(url.endsWith('/api/status'))return Response.json({status:'PERMISSIONS_VERIFIED',bootId:'b',grantId:'g',expiresAt:Date.now()+60000,attempted:false});posts++;return Response.json({status:'OUTCOME_UNCONFIRMED'});};const r=await Promise.allSettled([publishOnce(dir,{fetchImpl}),publishOnce(dir,{fetchImpl})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(posts,1);}));

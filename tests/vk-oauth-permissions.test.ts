import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { requestVkGrant, startVkOAuth } from '../lib/server/vk/oauth.ts';
import { getVkAccessToken } from '../lib/server/vk/credentials.ts';
import { getVkConfig, VkOAuthError } from '../lib/server/vk/config.ts';
import { sealVkPayload } from '../lib/server/vk/crypto.ts';

const originalFetch=globalThis.fetch, originalEnv={...process.env};
const globals=globalThis as typeof globalThis & {__planlyPool?:unknown};
const originalPool=globals.__planlyPool;
afterEach(()=>{globalThis.fetch=originalFetch;process.env={...originalEnv};globals.__planlyPool=originalPool;});

function fixture(){
  Object.assign(process.env,{VK_CLIENT_ID:'123456',VK_SERVICE_TOKEN:randomBytes(24).toString('hex'),VK_REDIRECT_URI:'https://lentaro.example.test/api/social-accounts/vk/callback',VK_CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64'),VK_CREDENTIAL_KEY_VERSION:'1'});
  const config=getVkConfig(),accountId='permission-account';
  const payload={accessToken:randomBytes(24).toString('hex'),refreshToken:randomBytes(24).toString('hex'),deviceId:'synthetic-device',scopes:['wall','photos']};
  const envelope=sealVkPayload(payload,{accountId,provider:'VK',purpose:'CREDENTIALS'},config);
  const row={ciphertext:envelope.ciphertext,iv:envelope.iv,tag:envelope.tag,key_version:envelope.keyVersion,expires_at:new Date(0),refresh_state:'READY'};
  let replacements=0;
  const client={release(){},async query(sql:string,values:unknown[]=[]){
    if(sql.startsWith('SELECT id,email'))return {rows:[{id:'permission-agent',email:'permission-agent@example.test',auth_initialized:true,access_state:'ACTIVE',session_version:0,role:'USER',access_expires_at:null}]};
    if(sql.startsWith('SELECT id,user_id'))return {rows:[{id:accountId,user_id:'permission-agent',provider:'VK',enabled:true,connection_status:'CONNECTED',connection_generation:0,binding_revision:0}]};
    if(sql.startsWith('SELECT ciphertext'))return {rows:[{...row}]};
    if(sql.startsWith('UPDATE vk_credentials SET refresh_state'))row.refresh_state='UNCERTAIN';
    if(sql.startsWith('UPDATE vk_credentials SET ciphertext')){replacements++;Object.assign(row,{ciphertext:values[1],iv:values[2],tag:values[3],key_version:values[4],expires_at:values[5],refresh_state:'READY'});}
    return {rows:[],rowCount:1};
  }};
  globals.__planlyPool={connect:async()=>client};
  return {config,accountId,row,payload,get replacements(){return replacements;}};
}
const grant=()=>({access_token:randomBytes(24).toString('hex'),refresh_token:randomBytes(24).toString('hex'),expires_in:3600,scope:'wall photos'});
function safeAuth(error:unknown,stage:string,reason:string){
  assert.ok(error instanceof VkOAuthError);assert.equal(error.code,'AUTH');assert.deepEqual(error.diagnostic,{stage,reason});
  assert.equal('cause' in error,false);return true;
}

test('explicit VK OAuth start requests consent for the current configured client and only wall/photos',async()=>{
  const f=fixture();globalThis.fetch=async()=>{throw new Error('OAuth start must not call the provider');};
  const {authorizationUrl}=await startVkOAuth('permission-agent',f.accountId,'123');
  const url=new URL(authorizationUrl);
  assert.equal(url.searchParams.get('prompt'),'consent');assert.equal(url.searchParams.get('client_id'),'123456');assert.equal(url.searchParams.get('scope'),'wall photos');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.origin,'https://id.vk.ru');
});

test('refresh response without fresh scope cannot inherit historically granted wall/photos or replace the encrypted pair',async()=>{
  const f=fixture(),before={...f.row};let calls=0;
  globalThis.fetch=async(_url,init)=>{calls++;const body=new URLSearchParams(String(init?.body));assert.equal(body.get('refresh_token'),f.payload.refreshToken);const response=grant();delete (response as Partial<typeof response>).scope;return Response.json({...response,state:body.get('state')});};
  await assert.rejects(()=>getVkAccessToken(f.accountId),error=>safeAuth(error,'GRANT_VALIDATION','INVALID_RESPONSE'));
  assert.equal(f.row.refresh_state,'UNCERTAIN');assert.equal(f.replacements,0);assert.equal(f.row.ciphertext,before.ciphertext);
  await assert.rejects(()=>getVkAccessToken(f.accountId),{name:'VkOAuthError'});assert.equal(calls,1);
});

for(const grantType of ['authorization_code','refresh_token'])for(const state of ['absent','mismatched','null','empty'] as const)test(`${grantType} rejects ${state} returned state without exposing exchange values`,async()=>{
  const f=fixture(),requestedState=randomBytes(24).toString('hex'),secret=randomBytes(24).toString('hex');
  const returnedState=state==='absent'?{}:{state:state==='mismatched'?secret:state==='null'?null:''};
  globalThis.fetch=async()=>Response.json({...grant(),...returnedState,extra:secret});
  await assert.rejects(()=>requestVkGrant({grant_type:grantType,state:requestedState},f.config),error=>{
    safeAuth(error,'TOKEN_EXCHANGE','STATE_MISMATCH');assert.equal(JSON.stringify(error).includes(secret),false);assert.equal(JSON.stringify(error).includes(requestedState),false);return true;
  });
});

for(const grantType of ['authorization_code','refresh_token'])test(`${grantType} accepts an exact state echo and explicit complete fresh scopes`,async()=>{
  const f=fixture(),state=randomBytes(24).toString('hex'),response=grant();
  globalThis.fetch=async(_url,init)=>{assert.equal(new URLSearchParams(String(init?.body)).get('state'),state);return Response.json({...response,state});};
  const result=await requestVkGrant({grant_type:grantType,state},f.config);assert.equal(result.accessToken,response.access_token);assert.deepEqual(result.scopes,['wall','photos']);
});

test('an exchange with neither requested nor returned state cannot admit a grant through undefined equality',async()=>{
  const f=fixture();globalThis.fetch=async()=>Response.json(grant());
  await assert.rejects(()=>requestVkGrant({grant_type:'authorization_code'},f.config),error=>safeAuth(error,'TOKEN_EXCHANGE','STATE_MISMATCH'));
});

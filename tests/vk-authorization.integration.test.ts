import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, getDb, getPool } from '../db/index.ts';
import { publications, socialAccounts, users, vkCredentials } from '../db/schema.ts';
import { startVkOAuth, completeVkOAuth, disconnectVkAccount } from '../lib/server/vk/oauth.ts';
import { createPost } from '../lib/server/posts.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { observePublicationAuthorization } from '../lib/server/social-connections/publication-authorization.ts';
import { revokeUserSessions } from '../lib/server/auth/access.ts';
import { openVkPayload } from '../lib/server/vk/crypto.ts';
import { getVkConfig } from '../lib/server/vk/config.ts';
import { setSocialAccountEnabled } from '../lib/server/social-accounts.ts';

const ids=['vk-auth-agent-a','vk-auth-agent-b'];
const originalFetch=globalThis.fetch,originalEnv={...process.env};
let grantToken='',refreshToken='',refreshes=0;
const sends:{token:string;destination:string}[]=[];
let beforeControl:(()=>Promise<void>)|undefined;
let controlError:number|undefined;

beforeEach(async()=>{
  await getDb().delete(users).where(inArray(users.id,ids));
  await getDb().insert(users).values(ids.map(id=>({id,email:`${id}@example.test`,displayName:id,authInitialized:true,accessState:'ACTIVE' as const,role:'USER' as const})));
  await getDb().insert(socialAccounts).values(ids.map((id,i)=>({id:`${id}-vk`,userId:id,provider:'VK' as const,displayName:`VK ${i}`,enabled:false,connectionStatus:'DISCONNECTED' as const})));
  Object.assign(process.env,{VK_CLIENT_ID:'123456',VK_SERVICE_TOKEN:randomBytes(24).toString('hex'),VK_REDIRECT_URI:'https://lentaro.example.test/api/social-accounts/vk/callback',VK_CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64'),VK_CREDENTIAL_KEY_VERSION:'1'});
  sends.length=0;refreshes=0;beforeControl=undefined;controlError=undefined;
  globalThis.fetch=async(url,init)=>{
    const target=new URL(String(url)),body=new URLSearchParams(String(init?.body));
    if(target.hostname==='id.vk.ru'){
      if(body.get('grant_type')==='refresh_token'){refreshes++;assert.equal(body.get('refresh_token'),refreshToken);}
      return Response.json({access_token:grantToken,refresh_token:refreshToken,expires_in:3600,scope:'wall photos',state:body.get('state')});
    }
    if(target.hostname==='api.vk.com' && target.pathname.endsWith('groups.getById')){
      if(controlError)return Response.json({error:{error_code:controlError,error_msg:'secret-provider-echo'}});
      const community=Number(body.get('group_ids'));const hook=beforeControl;beforeControl=undefined;if(hook)await hook();
      return Response.json({response:{groups:[{id:community,type:'page',is_admin:1,admin_level:2,name:'Fixture community'}]}});
    }
    if(target.hostname==='api.vk.com' && target.pathname.endsWith('wall.post')){
      sends.push({token:body.get('access_token')!,destination:body.get('owner_id')!});
      return Response.json({response:{post_id:40+sends.length}});
    }
    throw new Error('Unapproved fixture transport');
  };
});
after(async()=>{globalThis.fetch=originalFetch;process.env={...originalEnv};await getDb().delete(users).where(inArray(users.id,ids));await closeDb();});

async function connect(index=0,community=String(123+index)){
  grantToken=randomBytes(24).toString('hex');refreshToken=randomBytes(24).toString('hex');const token=grantToken;
  const id=ids[index],accountId=`${id}-vk`,started=await startVkOAuth(id,accountId,community);
  await completeVkOAuth(id,{state:new URL(started.authorizationUrl).searchParams.get('state')!,code:'synthetic-code',deviceId:'synthetic-device'},async()=>({destinationId:`-${community}`,displayName:'Fixture community'}));
  return {id,accountId,token};
}
async function work(userId:string){
  const post=await createPost(userId,{title:null,baseText:'VK isolated authorization fixture',status:'READY',mediaIds:[],targets:[{provider:'vk',textOverride:null,scheduledAt:new Date(Date.now()+3600_000).toISOString()}]},{mirrorQueue:async()=>{}});
  const [publication]=await getDb().select().from(publications).where(eq(publications.postId,post.id));return publication;
}

test('VK real registered USER OAuth binding freezes publication pointer and isolates two credentials/destinations',async()=>{
  const a=await connect(0),b=await connect(1),pa=await work(a.id),pb=await work(b.id);
  assert.equal(pa.socialBindingRevision,1);assert.equal(pa.socialBindingDestinationId,'-123');assert.equal(pb.socialBindingDestinationId,'-124');
  assert.equal((await processPublication(pa.id)).status,'PUBLISHED');assert.equal((await processPublication(pb.id)).status,'PUBLISHED');
  assert.deepEqual(sends,[{token:a.token,destination:'-123'},{token:b.token,destination:'-124'}]);
  assert.equal((await processPublication(pa.id)).skipped,true);assert.equal(sends.length,2);
  assert.equal(await observePublicationAuthorization(b.id,a.accountId,pa),null);
});

test('VK durable refresh preserves encrypted publication binding and hands off only the replacement token',async()=>{
  const a=await connect(),p=await work(a.id);
  const [before]=await getDb().select().from(vkCredentials).where(eq(vkCredentials.accountId,a.accountId));
  const context={accountId:a.accountId,provider:'VK',purpose:'CREDENTIALS'},config=getVkConfig();
  const prior=openVkPayload(before,context,config) as {publicationGrant:unknown};
  await getDb().update(vkCredentials).set({expiresAt:new Date(0)}).where(eq(vkCredentials.accountId,a.accountId));
  grantToken=randomBytes(24).toString('hex');
  assert.equal((await processPublication(p.id)).status,'PUBLISHED');assert.equal(refreshes,1);assert.deepEqual(sends,[{token:grantToken,destination:'-123'}]);
  const [after]=await getDb().select().from(vkCredentials).where(eq(vkCredentials.accountId,a.accountId));
  assert.deepEqual((openVkPayload(after,context,config) as {publicationGrant:unknown}).publicationGrant,prior.publicationGrant);
});

for(const fault of ['revoke','epoch','destination','reconnect'] as const)test(`VK actual USER ${fault} invalidates an already frozen publication before provider handoff`,async()=>{
  const a=await connect(),p=await work(a.id);
  if(fault==='revoke')await disconnectVkAccount(a.id,a.accountId);
  if(fault==='epoch')await revokeUserSessions(a.id);
  if(fault==='destination')await getDb().update(socialAccounts).set({providerAccountId:'-999'}).where(eq(socialAccounts.id,a.accountId));
  if(fault==='reconnect')await connect();
  assert.equal((await processPublication(p.id)).status,'REQUIRES_RECONNECT');assert.equal(sends.length,0);
});

test('VK actual disconnect during final read-only control check prevents start and credential reuse',async()=>{
  const a=await connect(),p=await work(a.id);beforeControl=()=>disconnectVkAccount(a.id,a.accountId);
  assert.equal((await processPublication(p.id)).status,'REQUIRES_RECONNECT');assert.equal(sends.length,0);
  assert.equal((await getPool().query('SELECT count(*)::int AS count FROM vk_credentials WHERE account_id=$1',[a.accountId])).rows[0].count,0);
});

for(const [code,label] of [[1051,'VK_METHOD_PROFILE_DENIED'],[15,'VK_API_ACCESS_NOT_GRANTED'],[27,'VK_GROUP_TOKEN_METHOD_DENIED']] as const)test(`VK actual read-only preflight ${code} persists a distinct safe diagnosis without publication`,async()=>{
  const a=await connect(),p=await work(a.id);controlError=code;
  assert.equal((await processPublication(p.id)).status,'FAILED');assert.equal(sends.length,0);
  const [stored]=await getDb().select().from(publications).where(eq(publications.id,p.id));
  assert.equal(stored.providerErrorCode,label);assert.ok(stored.providerErrorMessage?.includes('"stage":"COMMUNITY_VALIDATION"'));
  assert.ok(stored.providerErrorMessage?.includes(`"vkErrorCode":${code}`));assert.equal(stored.providerErrorMessage?.includes('secret-provider-echo'),false);
});

test('VK stale generic disable cannot delete credentials issued after a session epoch change',async()=>{
  const a=await connect();await revokeUserSessions(a.id);const renewed=await connect();
  const [before]=await getDb().select().from(vkCredentials).where(eq(vkCredentials.accountId,a.accountId));
  await assert.rejects(()=>setSocialAccountEnabled(a.id,a.accountId,false,0));
  const [after]=await getDb().select().from(vkCredentials).where(eq(vkCredentials.accountId,a.accountId));assert.deepEqual(after,before);
  const [account]=await getDb().select().from(socialAccounts).where(eq(socialAccounts.id,a.accountId));assert.equal(account.enabled,true);
  const p=await work(a.id);assert.equal((await processPublication(p.id)).status,'PUBLISHED');assert.deepEqual(sends,[{token:renewed.token,destination:'-123'}]);
});

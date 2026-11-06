import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { closePublicationQueue, getPublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import { startPublicationWorker } from '../lib/server/scheduler/worker.ts';
import type { PublishResult } from '../lib/server/connectors/types.ts';

const id=`vk-race-${randomUUID()}`, accountId=`${id}-account`, pubId=`${id}-pub`;
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
async function read(){const [row]=await getDb().select().from(publications).where(eq(publications.id,pubId));return row;}
beforeEach(async()=>{
  await getDb().delete(users).where(eq(users.id,id));
  await getDb().insert(users).values({id,email:`${id}@example.test`,displayName:'Isolated VK race'});
  await getDb().insert(socialAccounts).values({id:accountId,userId:id,provider:'VK',enabled:true,connectionStatus:'CONNECTED',providerAccountId:'-123',displayName:'Fixture VK'});
  await getDb().insert(posts).values({id:`${id}-post`,userId:id,baseText:'Fixture',status:'READY'});
  await getDb().insert(postTargets).values({id:`${id}-target`,postId:`${id}-post`,socialAccountId:accountId,active:true,scheduledAt:new Date(Date.now()-1000)});
  await getDb().insert(publications).values({id:pubId,userId:id,postId:`${id}-post`,postTargetId:`${id}-target`,provider:'VK',status:'SCHEDULED',scheduledAt:new Date(Date.now()-1000),idempotencyKey:`publication:${pubId}`});
});
after(async()=>{await getDb().delete(users).where(eq(users.id,id));await closePublicationQueue();await closeRedisConnection();await closeDb();});

for(const mode of ['failure','auth','throw','success'] as const) test(`PG late ${mode} cannot replace durable PUBLISHED receipt`,async()=>{
  let sends=0;
  const result=await processPublication(pubId,()=>({provider:'VK',async publish():Promise<PublishResult>{
    sends++;
    await getDb().update(publications).set({status:'PUBLISHED',providerRemoteId:'-123_77',providerUrl:'https://vk.com/wall-123_77',publishedAt:new Date()}).where(eq(publications.id,pubId));
    if(mode==='throw')throw new Error('secret transport fixture');
    return mode==='success'?{ok:true,remoteId:'-123_88'}:{ok:false,errorType:mode==='auth'?'AUTH':'TEMPORARY',code:'STALE',message:'late failure'};
  }}));
  assert.deepEqual(result,{status:'PUBLISHED',skipped:true});
  const row=await read();assert.equal(row.status,'PUBLISHED');assert.equal(row.providerRemoteId,'-123_77');assert.equal(row.providerErrorCode,null);assert.equal(row.attemptCount,1);assert.equal(sends,1);
  const [account]=await getDb().select().from(socialAccounts).where(eq(socialAccounts.id,accountId));assert.equal(account.connectionStatus,'CONNECTED');
});

test('PG prior attempt cannot acknowledge the current publishing attempt',async()=>{
  const result=await processPublication(pubId,()=>({provider:'VK',async publish(){
    await getDb().update(publications).set({attemptCount:2}).where(eq(publications.id,pubId));
    return {ok:true,remoteId:'-123_88'};
  }}));
  assert.deepEqual(result,{status:'PUBLISHING',skipped:true});const row=await read();assert.equal(row.attemptCount,2);assert.equal(row.providerRemoteId,null);
});

test('PG process-loss PUBLISHING is ambiguous and never resent',async()=>{
  await getDb().update(publications).set({status:'PUBLISHING',attemptCount:1}).where(eq(publications.id,pubId));let sends=0;
  const resolver=()=>({provider:'VK' as const,async publish(){sends++;return {ok:true as const,remoteId:'unexpected'};}});
  assert.equal((await processPublication(pubId,resolver)).status,'FAILED');
  assert.equal((await read()).providerErrorCode,'AMBIGUOUS_DELIVERY');
  assert.equal((await processPublication(pubId,resolver)).skipped,true);assert.equal(sends,0);
});

test('PG session lease prevents a concurrent active duplicate from invalidating its sender',async()=>{
  const entry=deferred(),release=deferred();let sends=0;
  const resolver=()=>({provider:'VK' as const,async publish(){sends++;entry.resolve();await release.promise;return {ok:true as const,remoteId:'-123_99'};}});
  const first=processPublication(pubId,resolver);
  try{
    await entry.promise;
    assert.deepEqual(await processPublication(pubId,resolver),{status:'PUBLISHING',skipped:true});
    assert.equal((await read()).status,'PUBLISHING');release.resolve();
    assert.equal((await first).status,'PUBLISHED');assert.equal((await read()).providerRemoteId,'-123_99');assert.equal(sends,1);
  }finally{release.resolve();await first;}
});

test('real Redis duplicate jobs through two BullMQ workers produce one durable receipt',async()=>{
  const entry=deferred(),release=deferred();let sends=0;
  const resolver=()=>({provider:'VK' as const,async publish(input:{publicationId:string}){
    if(input.publicationId!==pubId)return {ok:false as const,errorType:'PERMANENT' as const,code:'FIXTURE_SCOPE',message:'Other suite fixture'};
    sends++;entry.resolve();await release.promise;return {ok:true as const,remoteId:'-123_101'};
  }});
  const first=await startPublicationWorker(resolver,{reconcileIntervalMs:0});
  let second:Awaited<ReturnType<typeof startPublicationWorker>>|undefined;
  try{
    await entry.promise;second=await startPublicationWorker(resolver,{reconcileIntervalMs:0});
    const duplicate=await getPublicationQueue().add('publish',{publicationId:pubId},{jobId:`${id}-duplicate`});
    const deadline=Date.now()+4000;
    while(await duplicate.getState()!=='completed'){assert.ok(Date.now()<deadline,'duplicate job did not complete');await new Promise(r=>setTimeout(r,20));}
    assert.equal((await read()).status,'PUBLISHING');assert.equal(sends,1);release.resolve();
    const publishedDeadline=Date.now()+4000;
    while((await read()).status!=='PUBLISHED'){assert.ok(Date.now()<publishedDeadline,'original receipt not persisted');await new Promise(r=>setTimeout(r,20));}
    assert.equal((await read()).providerRemoteId,'-123_101');assert.equal((await read()).attemptCount,1);assert.equal(sends,1);
  }finally{release.resolve();await second?.close();await first.close();}
});

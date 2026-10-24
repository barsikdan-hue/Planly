import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, socialAccounts, posts, libraryItems } from '../db/schema.ts';
import { createPost } from '../lib/server/posts.ts';
import { createLibraryItem, archiveLibraryItem, updateLibraryItem, deleteLibraryItem, listLibraryItems } from '../lib/server/library-items.ts';
import type { SavePostInput } from '../lib/contracts/planner.ts';

const owner='feedback-owner', other='feedback-other';
const input: SavePostInput={ title:'Private title',baseText:'Private body',status:'READY',mediaIds:[],targets:[{provider:'telegram',scheduledAt:'2035-01-01T07:00:00Z',textOverride:null}] };
const mirrorQueue=async()=>{};
async function source(){ return createLibraryItem(owner,{title:input.title,text:input.baseText,mediaIds:[]}); }
async function summary(id=owner){const mod=await import('../lib/server/swipe-feedback.ts').catch(()=>null); assert.ok(mod,'private feedback snapshot helper exists');return mod.readSwipeFeedback(id);}
beforeEach(async()=>{await getDb().delete(users); await getDb().insert(users).values([owner,other].map(id=>({id,email:`${id}@example.test`,displayName:id})));await getDb().insert(socialAccounts).values({id:'feedback-tg',userId:owner,provider:'TELEGRAM',displayName:'TG',enabled:true,connectionStatus:'CONNECTED'});});
after(async()=>{await getDb().delete(users);await closeDb();});
function like(item:Awaited<ReturnType<typeof source>>,key=randomUUID()){return {creationKey:key,sourceLibraryItemId:item.id,sourceLibraryUpdatedAt:item.updatedAt,requireFreeSlot:true,swipeReview:{inputMethod:'button' as const},mirrorQueue};}
const dislike=()=>({operationId:randomUUID(),inputMethod:'gesture' as const});

test('LIKE commits a Post and one current vote/receipt; replay preserves snapshot and hash',async(t)=>{
 const item=await source(),options=like(item),post=await createPost(owner,input,options);
 const first=await summary();assert.deepEqual(first.aggregate,{likes:1,dislikes:0,total:1,likeRatio:1});assert.equal(first.receipts.length,1);
 await getDb().update(socialAccounts).set({enabled:false}).where(eq(socialAccounts.id,'feedback-tg'));
 await updateLibraryItem(owner,item.id,{text:'Later edited source',title:'Later title',mediaIds:[],status:'READY'});
 t.mock.timers.enable({apis:['Date'],now:new Date('2036-01-01T00:00:00Z')});
 assert.equal((await createPost(owner,input,options)).id,post.id);assert.deepEqual(await summary(),first);
 await assert.rejects(()=>createPost(owner,{...input,baseText:'changed'},options),{name:'CreationConflictError'});
 assert.equal((await getDb().select().from(posts)).length,1);
 const encoded=JSON.stringify(first);assert.ok(!encoded.includes('Private'));assert.ok(!encoded.includes('bodyText'));assert.ok(!encoded.includes('title'));
});

test('LIKE can reuse a USED library item for a second free Moscow slot',async()=>{
 const item=await source();
 const first=await createPost(owner,input,like(item));
 const refreshed=(await listLibraryItems(owner)).find(value=>value.id===item.id);
 assert.ok(refreshed);
 assert.equal(refreshed.status,'USED');
 const second=await createPost(owner,{...input,targets:[{...input.targets[0],scheduledAt:'2035-01-02T07:00:00Z'}]},like(refreshed));
 assert.notEqual(second.id,first.id);
 assert.equal((await getDb().select().from(posts)).length,2);
 assert.equal((await listLibraryItems(owner)).find(value=>value.id===item.id)?.status,'USED');
});

test('DISLIKE restore LIKE replaces current vote; old DISLIKE replay cannot rearchive',async()=>{
 const item=await source(),opts=dislike();await archiveLibraryItem(owner,item.id,item.updatedAt,opts);
 assert.equal((await summary()).aggregate.dislikes,1);
 const restored=await updateLibraryItem(owner,item.id,{title:item.title,text:'new acknowledged text',mediaIds:[],status:'READY'});
 const before=(await summary()).receipts[0].contentFingerprint;
 await createPost(owner,{...input,baseText:restored.text},like(restored));
 const result=await archiveLibraryItem(owner,item.id,item.updatedAt,opts);assert.equal(result.status,'USED');
 const snapshot=await summary();assert.deepEqual(snapshot.aggregate,{likes:1,dislikes:0,total:1,likeRatio:1});assert.equal(snapshot.receipts.length,2);assert.notEqual(snapshot.current[0].contentFingerprint,before);
});
test('LIKE source deletion replays surviving Post; deleted actual result is terminal without resurrection',async()=>{
 const item=await source(),opts=like(item),post=await createPost(owner,input,opts);await deleteLibraryItem(owner,item.id);
 assert.equal((await createPost(owner,input,opts)).id,post.id);let snapshot=await summary();assert.equal(snapshot.current[0].sourceDeleted,true);assert.equal(snapshot.current[0].resultDeleted,false);
 await getDb().delete(posts).where(eq(posts.id,post.id));await assert.rejects(()=>createPost(owner,input,opts),{name:'DecisionResultDeletedError'});
 snapshot=await summary();assert.equal(snapshot.current[0].resultDeleted,true);assert.equal(snapshot.aggregate.total,1);assert.equal((await getDb().select().from(posts)).length,0);
 await assert.rejects(()=>createPost(owner,{...input,baseText:'changed'},opts),{name:'CreationConflictError'});
});
test('DISLIKE deleted result retains metadata and yields terminal replay; foreign snapshot empty',async()=>{
 const item=await source(),opts=dislike();await archiveLibraryItem(owner,item.id,item.updatedAt,opts);await deleteLibraryItem(owner,item.id);
 await assert.rejects(()=>archiveLibraryItem(owner,item.id,item.updatedAt,opts),{name:'DecisionResultDeletedError'});
 const snapshot=await summary();assert.equal(snapshot.current[0].sourceDeleted,true);assert.equal(snapshot.current[0].resultDeleted,true);
 assert.deepEqual((await summary(other)).aggregate,{likes:0,dislikes:0,total:0,likeRatio:null});
});
test('opposite concurrent decisions commit one vote and one receipt',async()=>{
 const item=await source();const results=await Promise.allSettled([createPost(owner,input,like(item)),archiveLibraryItem(owner,item.id,item.updatedAt,dislike())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const snapshot=await summary();assert.equal(snapshot.aggregate.total,1);assert.equal(snapshot.receipts.length,1);
});
test('legacy conversion and reusable fresh-key creation fabricate no feedback',async()=>{
 const item=await source(),opts=like(item);const post=await createPost(owner,input,{...opts,swipeReview:undefined});assert.equal((await summary()).aggregate.total,0);
 const [currentItem]=await listLibraryItems(owner);const second=await createPost(owner,input,{...like(currentItem),requireFreeSlot:false,swipeReview:undefined});assert.notEqual(second.id,post.id);assert.equal((await summary()).aggregate.total,0);
 // Simulate Task2's marked Post before receipts existed, without inventing history.
 const {creationInputHash}=await import('../lib/server/post-idempotency.ts');
 await getDb().update(posts).set({creationInputHash:creationInputHash(input,item.id,opts)}).where(eq(posts.id,post.id));
 assert.equal((await createPost(owner,input,opts)).id,post.id);assert.equal((await summary()).aggregate.total,0);
});
for(const decision of ['LIKE','DISLIKE'] as const)test(`${decision} feedback failure rolls back result and source`,async()=>{
 let mirrors=0;
 const item=await source();await getDb().execute(sql.raw("CREATE OR REPLACE FUNCTION fail_swipe_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional feedback failure'; END $$"));
 await getDb().execute(sql.raw('CREATE TRIGGER fail_swipe_test BEFORE INSERT ON swipe_current_feedback FOR EACH ROW EXECUTE FUNCTION fail_swipe_test()'));
 try {await assert.rejects(()=>decision==='LIKE'?createPost(owner,input,{...like(item),mirrorQueue:async()=>{mirrors++;}}):archiveLibraryItem(owner,item.id,item.updatedAt,dislike()),/intentional feedback failure|Failed query/);}
 finally{await getDb().execute(sql.raw('DROP TRIGGER fail_swipe_test ON swipe_current_feedback'));await getDb().execute(sql.raw('DROP FUNCTION fail_swipe_test()'));}
 assert.equal((await getDb().select().from(libraryItems))[0].status,'READY');assert.equal((await getDb().select().from(posts)).length,0);assert.equal((await summary()).receipts.length,0);
 assert.equal(mirrors,0);
});

test('operation UUID is shared across decision kinds and replay never mirrors again',async()=>{
 const item=await source(),opts=like(item);let mirrors=0;opts.mirrorQueue=async()=>{mirrors++;};
 await createPost(owner,input,opts);await createPost(owner,input,opts);assert.equal(mirrors,1);
 await assert.rejects(()=>archiveLibraryItem(owner,item.id,item.updatedAt,{operationId:opts.creationKey,inputMethod:'button'}),{name:'CreationConflictError'});
 assert.equal((await summary()).receipts.length,1);
});

test('result deletion waiting on Post lock resolves replay as typed410, never generic404',async()=>{
 const {Client}=await import('pg');const item=await source(),opts=like(item),post=await createPost(owner,input,opts);
 const gate=new Client({connectionString:process.env.DATABASE_URL});await gate.connect();await gate.query('BEGIN');
 try{
  await gate.query('DELETE FROM posts WHERE id=$1',[post.id]);
  // Prime the activity snapshot before replay starts, exercising a previously
  // timing-dependent stale observer rather than relying on a lucky first poll.
  await gate.query('SELECT query FROM pg_stat_activity');
  const replay=createPost(owner,input,opts);const rejected=assert.rejects(replay,{name:'DecisionResultDeletedError'});
  const deadline=Date.now()+5000;let waiting=false;
  while(Date.now()<deadline){await gate.query('SELECT pg_stat_clear_snapshot()');const r=await gate.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%from \"posts\"%' AND pid<>pg_backend_pid()");if(r.rows.length){waiting=true;break;}await new Promise(r=>setTimeout(r,15));}
  assert.equal(waiting,true,'replay must wait on actual Post row');await gate.query('COMMIT');await rejected;assert.equal((await summary()).receipts.length,1);
 }finally{await gate.query('ROLLBACK');await gate.end();}
});

test('export lifecycle and current aggregate share one repeatable-read snapshot during deletion',async()=>{
 const {Client}=await import('pg');const item=await source();await archiveLibraryItem(owner,item.id,item.updatedAt,dislike());
 const gate=new Client({connectionString:process.env.DATABASE_URL});await gate.connect();await gate.query('BEGIN');
 try{
  await gate.query('LOCK TABLE swipe_decision_receipts IN ACCESS EXCLUSIVE MODE');
  const pending=summary();const deadline=Date.now()+5000;let waiting=false;
  while(Date.now()<deadline){await gate.query('SELECT pg_stat_clear_snapshot()');const r=await gate.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%from \"swipe_decision_receipts\"%' AND pid<>pg_backend_pid()");if(r.rows.length){waiting=true;break;}await new Promise(r=>setTimeout(r,15));}
  assert.equal(waiting,true,'snapshot receipts query waits after current-row read');
  await deleteLibraryItem(owner,item.id);await gate.query('COMMIT');const snapshot=await pending;
  assert.equal(snapshot.current[0].sourceDeleted,false);assert.equal(snapshot.receipts[0].sourceDeleted,false);assert.equal(snapshot.aggregate.total,1);
  assert.equal((await summary()).current[0].sourceDeleted,true);
 }finally{await gate.query('ROLLBACK');await gate.end();}
});

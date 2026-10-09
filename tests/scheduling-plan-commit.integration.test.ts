import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {eq,sql} from 'drizzle-orm';
import {closeDb,getDb} from '../db/index.ts';
import {posts,postTargets,postMedia,mediaAssets,socialAccounts,publications,users} from '../db/schema.ts';
import {previewSchedulingPlan} from '../lib/server/scheduling-plan-preview.ts';
import type {SchedulingPlanCommitInput} from '../lib/contracts/scheduling-plan.ts';
import {owner,other,settings,now,noMirror,fakeSigningStorage,seedSchedulingFixture,schedulingCounts,cleanupSchedulingFixture,attachSchedulingMedia,addSchedulingDraft} from './helpers/scheduling-plan-db.ts';
const service=await import('../lib/server/scheduling-plan-commit.ts').catch(()=>null);
beforeEach(seedSchedulingFixture);
after(async()=>{await cleanupSchedulingFixture();await closeDb();});
async function intent(postIds=['a','b'],who=owner):Promise<SchedulingPlanCommitInput>{const preview=await previewSchedulingPlan(who,{postIds,settings},{now:()=>now,storage:fakeSigningStorage});assert.equal(preview.complete,true);return {operationId:randomUUID(),settings,rows:preview.rows.map(row=>({postId:row.post.id,fingerprint:row.fingerprint!,scheduledAt:row.scheduledAt!,reviewed:true}))};}
async function receipts(who=owner){return (await getDb().execute(sql`SELECT * FROM scheduling_plan_operations WHERE user_id=${who}`)).rows;}
test('one transaction preserves content/media/target identity and schedules all active destinations',async()=>{
  assert.ok(service);await attachSchedulingMedia('a');
  await getDb().insert(postTargets).values({id:'a-MAX',postId:'a',socialAccountId:`${owner}-MAX`,textOverride:'MAX copy'});
  await getDb().insert(postTargets).values({id:'a-VK',postId:'a',socialAccountId:`${owner}-VK`,active:false});
  const input=await intent();const before=await getDb().select().from(posts);const targets=await getDb().select().from(postTargets);const media=await getDb().select().from(postMedia);
  const result=await service.commitSchedulingPlan(owner,input,noMirror);
  assert.equal(result.replayed,false);assert.equal(result.receipt.rows.length,2);assert.equal((await receipts()).length,1);
  const after=await getDb().select().from(posts);for(const old of before){const current=after.find(p=>p.id===old.id)!;assert.equal(current.baseText,old.baseText);assert.equal(current.title,old.title);assert.equal(current.status,old.userId===owner?'READY':'DRAFT');}
  assert.deepEqual(await getDb().select().from(postMedia),media);
  const updated=await getDb().select().from(postTargets);for(const old of targets){const row=updated.find(t=>t.id===old.id)!;assert.equal(row.textOverride,old.textOverride);assert.equal(row.socialAccountId,old.socialAccountId);assert.equal(row.active,old.active);if(old.id==='a-VK')assert.equal(row.scheduledAt,null);}
  assert.equal((await getDb().select().from(publications)).length,3);
  assert.deepEqual(result.receipt.rows[0].targetIds,['a-MAX','a-TELEGRAM']);
});
test('equivalent-offset replay returns the immutable receipt without new SQL work or queue mirroring',async()=>{
  assert.ok(service);const input=await intent();let mirrors=0;const options={...noMirror,mirrorQueue:async()=>{mirrors++;}};
  const first=await service.commitSchedulingPlan(owner,input,options);const before=await schedulingCounts(owner);
  const replay=await service.commitSchedulingPlan(owner,{...input,rows:input.rows.map(row=>({...row,scheduledAt:row.scheduledAt.replace('07:00:00.000Z','10:00:00+03:00').replace('15:00:00.000Z','18:00:00+03:00')}))},options);
  assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,first.receipt);assert.deepEqual(await schedulingCounts(owner),before);assert.equal(mirrors,1);assert.equal((await receipts()).length,1);
  await assert.rejects(()=>service.commitSchedulingPlan(owner,{...input,rows:[...input.rows].reverse()},options),{code:'PLAN_OPERATION_CONFLICT'});
});
test('replay after deletion, edits, disconnect and time passage never resurrects or reschedules',async()=>{
  assert.ok(service);const input=await intent();const first=await service.commitSchedulingPlan(owner,input,noMirror);
  await getDb().delete(posts).where(eq(posts.id,'a'));await getDb().update(posts).set({baseText:'Edited after acknowledgement'}).where(eq(posts.id,'b'));
  await getDb().update(socialAccounts).set({enabled:false,connectionStatus:'DISCONNECTED'}).where(eq(socialAccounts.id,`${owner}-MAX`));
  const before=await schedulingCounts(owner);const replay=await service.commitSchedulingPlan(owner,input,{...noMirror,now:()=>new Date('2031-01-01')});assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,first.receipt);assert.deepEqual(await schedulingCounts(owner),before);
  assert.equal((await getDb().select().from(posts).where(eq(posts.id,'b')))[0].baseText,'Edited after acknowledgement');
});
test('edited or missing selected Post and changed media reject the entire batch without a receipt',async()=>{
  assert.ok(service);for(const mutate of [async()=>{await getDb().update(posts).set({baseText:'New text'}).where(eq(posts.id,'b'));},async()=>{await getDb().delete(posts).where(eq(posts.id,'b'));},async()=>{await getDb().update(mediaAssets).set({width:200}).where(eq(mediaAssets.id,'m1'));}]) {
    await seedSchedulingFixture();await attachSchedulingMedia('b',['m1']);const input=await intent();await mutate();await assert.rejects(()=>service.commitSchedulingPlan(owner,input,noMirror));
    assert.equal((await getDb().select().from(posts).where(eq(posts.id,'a')))[0].status,'DRAFT');assert.equal((await receipts()).length,0);assert.equal((await schedulingCounts(owner)).publications,0);
  }
});
test('disconnect, past minute, occupied minute, non-slot time and duplicate minute fail closed',async()=>{
  assert.ok(service);for(const kind of ['account','past','occupied','seconds','duplicate']) {
    await seedSchedulingFixture();const input=await intent();let options=noMirror;
    if(kind==='account')await getDb().update(socialAccounts).set({enabled:false}).where(eq(socialAccounts.id,`${owner}-MAX`));
    if(kind==='past')options={...noMirror,now:()=>new Date('2030-01-01T07:00:00Z')};
    if(kind==='occupied'){await addSchedulingDraft('occupant');await getDb().update(postTargets).set({scheduledAt:new Date(input.rows[0].scheduledAt)}).where(eq(postTargets.id,'occupant-TELEGRAM'));}
    if(kind==='seconds')input.rows[0].scheduledAt='2030-01-01T07:00:01Z';
    if(kind==='duplicate')input.rows[1].scheduledAt=input.rows[0].scheduledAt;
    await assert.rejects(()=>service.commitSchedulingPlan(owner,input,options));assert.equal((await receipts()).length,0);assert.equal((await schedulingCounts(owner)).publications,0);
  }
});
test('failure while reconciling the second Post rolls back first Post/publications and receipt',async()=>{
  assert.ok(service);const input=await intent();
  await getDb().execute(sql.raw("CREATE FUNCTION phase9_reject_b() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.post_id='b' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$"));
  await getDb().execute(sql.raw('CREATE TRIGGER phase9_test_failure BEFORE INSERT ON publications FOR EACH ROW EXECUTE FUNCTION phase9_reject_b()'));
  try{await assert.rejects(()=>service.commitSchedulingPlan(owner,input,noMirror));assert.equal((await getDb().select().from(posts).where(eq(posts.userId,owner))).every(p=>p.status==='DRAFT'),true);assert.equal((await receipts()).length,0);assert.equal((await schedulingCounts(owner)).publications,0);}finally{await getDb().execute(sql.raw('DROP TRIGGER phase9_test_failure ON publications'));await getDb().execute(sql.raw('DROP FUNCTION phase9_reject_b()'));}
});
async function waitForOwnerLocks(count:number){const end=Date.now()+5000;while(Date.now()<end){const rows=(await getDb().execute(sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"users"%'`)).rows;if(Number(rows[0].n)>=count)return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Expected requests waiting on real owner row lock');}
test('native concurrent same-key commits yield one receipt and one set of scheduled work',async()=>{
  assert.ok(service);const input=await intent();const blocker=new Client({connectionString:process.env.DATABASE_URL});await blocker.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner]);
  const calls=[service.commitSchedulingPlan(owner,input,noMirror),service.commitSchedulingPlan(owner,input,noMirror)];
  try{await waitForOwnerLocks(2);await blocker.query('COMMIT');const results=await Promise.all(calls);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);assert.deepEqual(results[0].receipt,results[1].receipt);assert.equal((await receipts()).length,1);assert.equal((await schedulingCounts(owner)).publications,2);}finally{await blocker.query('ROLLBACK');await blocker.end();await Promise.allSettled(calls);}
});
test('native competing batches claiming one minute yield one success and no partial loser',async()=>{
  assert.ok(service);await getDb().update(postTargets).set({socialAccountId:`${owner}-TELEGRAM`}).where(eq(postTargets.id,'b-MAX'));const first=await intent(['a']);const second=await intent(['b']);const blocker=new Client({connectionString:process.env.DATABASE_URL});await blocker.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner]);
  const calls=[service.commitSchedulingPlan(owner,first,noMirror),service.commitSchedulingPlan(owner,second,noMirror)];
  try{await waitForOwnerLocks(2);await blocker.query('COMMIT');const results=await Promise.allSettled(calls);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal((await receipts()).length,1);assert.equal((await schedulingCounts(owner)).publications,1);}finally{await blocker.query('ROLLBACK');await blocker.end();await Promise.allSettled(calls);}
});
test('owner keys are isolated and receipts cascade only on owner deletion',async()=>{
  assert.ok(service);const input=await intent(['a']);await service.commitSchedulingPlan(owner,input,noMirror);const otherInput=await intent(['foreign'],other);otherInput.operationId=input.operationId;
  await service.commitSchedulingPlan(other,otherInput,noMirror);assert.equal((await receipts()).length,1);assert.equal((await receipts(other)).length,1);
  await getDb().delete(users).where(eq(users.id,owner));assert.equal((await receipts()).length,0);assert.equal((await receipts(other)).length,1);
});
test('queue-mirror failure after commit is a saved result and retry does not mirror or duplicate work',async()=>{
  assert.ok(service);const input=await intent();let mirrors=0;const mirrorQueue=async()=>{mirrors++;throw new Error('synthetic unavailable queue');};
  const result=await service.commitSchedulingPlan(owner,input,{...noMirror,mirrorQueue});assert.equal(result.replayed,false);assert.equal((await schedulingCounts(owner)).publications,2);
  assert.equal((await service.commitSchedulingPlan(owner,input,{...noMirror,mirrorQueue})).replayed,true);assert.equal(mirrors,1);
});

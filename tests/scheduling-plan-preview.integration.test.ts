import test, {beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {closeDb,getDb} from '../db/index.ts';
import {posts,postTargets,publications,socialAccounts,mediaAssets} from '../db/schema.ts';
import {owner,settings,now,fakeSigningStorage,seedSchedulingFixture,schedulingCounts,cleanupSchedulingFixture,attachSchedulingMedia,addSchedulingDraft,addSchedulingHistory} from './helpers/scheduling-plan-db.ts';
const service=await import('../lib/server/scheduling-plan-preview.ts').catch(()=>null);
const snapshots=await import('../lib/server/scheduling-plan-snapshot.ts').catch(()=>null);
const input={postIds:['b','a'],settings};
const options={now:()=>now,storage:fakeSigningStorage};
beforeEach(seedSchedulingFixture);
after(async()=>{await cleanupSchedulingFixture();await closeDb();});
test('preview preserves selection, full owned content/media and database state',async()=>{
  assert.ok(service,'read-only preview service exists'); await attachSchedulingMedia('a');
  const before=await schedulingCounts(owner); const original=await getDb().select().from(posts);
  const result=await service.previewSchedulingPlan(owner,input,options);
  assert.equal(result.complete,true); assert.deepEqual(result.rows.map(r=>r.post.id),['b','a']);
  assert.deepEqual(result.rows.map(r=>r.scheduledAt),['2030-01-01T07:00:00.000Z','2030-01-01T15:00:00.000Z']);
  assert.deepEqual(result.rows[1].post.mediaIds,['m2','m1']); assert.deepEqual(result.media.map(m=>m.id),['m2','m1']);
  assert.equal(result.rows[0].post.targets[0].textOverride,'Override b MAX'); assert.equal(result.rows[0].accounts[0].providerAccountId,`destination-${owner}-MAX`);
  assert.deepEqual(await schedulingCounts(owner),before);assert.deepEqual(await getDb().select().from(posts),original);
});
test('not found and foreign selection return the same safe error',async()=>{
  assert.ok(service);for(const id of ['missing','foreign'])await assert.rejects(()=>service.previewSchedulingPlan(owner,{...input,postIds:[id]},options),{message:'Post not found'});
});
test('no targets, active unsupported targets and scheduled drafts are excluded without omission',async()=>{
  assert.ok(service); await addSchedulingDraft('empty',[]);await addSchedulingDraft('vk',['TELEGRAM','VK']);await addSchedulingDraft('timed');
  await getDb().update(postTargets).set({scheduledAt:new Date('2030-01-01T07:00Z')}).where(eq(postTargets.postId,'timed'));
  for(const id of ['empty','vk','timed']) {const result=await service.previewSchedulingPlan(owner,{...input,postIds:['b',id]},options);assert.equal(result.complete,false);assert.equal(result.rows[1].issue,'POST_INELIGIBLE');assert.ok(result.rows.every(r=>r.scheduledAt===null));}
  await getDb().update(postTargets).set({active:false}).where(eq(postTargets.id,'vk-VK'));
  assert.equal((await service.previewSchedulingPlan(owner,{...input,postIds:['vk']},options)).complete,true);
});
test('every publication history outcome including CANCELLED excludes a draft',async()=>{
  assert.ok(service);await addSchedulingHistory('a');
  for(const status of ['SCHEDULED','QUEUED','PUBLISHING','PUBLISHED','FAILED','CANCELLED','REQUIRES_RECONNECT'] as const) {await getDb().update(publications).set({status});assert.equal((await service.previewSchedulingPlan(owner,input,options)).rows[1].issue,'POST_INELIGIBLE');}
});
test('account and effective content validation are authoritative',async()=>{
  assert.ok(service);for(const state of [{enabled:false,connectionStatus:'CONNECTED' as const},{enabled:true,connectionStatus:'DISCONNECTED' as const}]) {await getDb().update(socialAccounts).set(state).where(eq(socialAccounts.id,`${owner}-TELEGRAM`));assert.equal((await service.previewSchedulingPlan(owner,input,options)).rows[1].issue,'ACCOUNT_UNAVAILABLE');}
  await getDb().update(socialAccounts).set({enabled:true,connectionStatus:'CONNECTED'}).where(eq(socialAccounts.id,`${owner}-TELEGRAM`));
  await getDb().update(postTargets).set({textOverride:'x'.repeat(5000)}).where(eq(postTargets.id,'a-TELEGRAM'));
  assert.equal((await service.previewSchedulingPlan(owner,input,options)).rows[1].issue,'CONTENT_INVALID');
  await getDb().update(postTargets).set({textOverride:null}).where(eq(postTargets.id,'a-TELEGRAM'));await attachSchedulingMedia('a',['m1']);
  await getDb().update(mediaAssets).set({mimeType:'application/pdf'}).where(eq(mediaAssets.id,'m1'));
  assert.equal((await service.previewSchedulingPlan(owner,input,options)).rows[1].issue,'CONTENT_INVALID');
});
test('union occupancy and latest cancellation apply, and incomplete ranges retain unassigned rows',async()=>{
  assert.ok(service);await addSchedulingDraft('occupied',['MAX']);await getDb().update(postTargets).set({scheduledAt:new Date('2030-01-01T07:00:30Z')}).where(eq(postTargets.postId,'occupied'));await addSchedulingHistory('occupied');
  let result=await service.previewSchedulingPlan(owner,{...input,postIds:['a','b']},options);
  assert.equal(result.complete,false);assert.deepEqual(result.rows.map(r=>r.scheduledAt),['2030-01-01T15:00:00.000Z',null]);assert.equal(result.rows[1].issue,'NO_SLOT');
  await getDb().update(publications).set({status:'CANCELLED'}).where(eq(publications.id,'history-occupied'));
  result=await service.previewSchedulingPlan(owner,input,options);assert.equal(result.complete,true);
});
test('fingerprints bind content, accounts, target overrides and ordered media, not expiring URLs',async()=>{
  assert.ok(service);assert.ok(snapshots);await attachSchedulingMedia('a');
  const first=(await service.previewSchedulingPlan(owner,{...input,postIds:['a']},options)).rows[0].fingerprint;
  const next=(await service.previewSchedulingPlan(owner,{...input,postIds:['a']},{...options,storage:{signedGetUrl:async()=> 'https://private.example.test/refreshed'}})).rows[0].fingerprint;assert.equal(first,next);
  await getDb().update(socialAccounts).set({providerAccountId:'changed'}).where(eq(socialAccounts.id,`${owner}-TELEGRAM`));
  assert.notEqual(first,(await service.previewSchedulingPlan(owner,{...input,postIds:['a']},options)).rows[0].fingerprint);
});

import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../db/index.ts';
import {posts,publications,socialAccounts,publicationMetrics} from '../db/schema.ts';
import {analyticsFixture,analyticsPublication} from './helpers/analytics-fixture.ts';
import {listAnalytics,saveObservation,saveCollectionResult} from '../lib/server/analytics/repository.ts';

beforeEach(analyticsFixture);after(closeDb);
const now=new Date('2026-10-08T12:00:00Z');
const query={provider:'max' as const,period:7 as const,page:0};
async function save(id:string,value:number,options:{owner?:string;destination?:string;observedAt?:Date}={}) {
  return getDb().transaction(tx=>saveObservation(tx,{userId:options.owner??'a',publicationId:id,accountId:'a-MAX',destinationId:options.destination??'123',remoteMessageId:'mid_42',metric:'views',value,observedAt:options.observedAt??now,providerEventAt:null,updateId:null}));
}
test('owned reads include published cohort only and cannot fabricate zeros',async()=>{
  await analyticsPublication('published');await analyticsPublication('foreign',{owner:'b'});await analyticsPublication('queued',{status:'SCHEDULED'});await analyticsPublication('old',{publishedAt:new Date('2026-09-01')});
  const result=await listAnalytics('a',query,now);assert.equal(result.eligibleCount,1);assert.equal(result.observedCount,0);assert.equal(result.total,null);assert.equal(result.rows[0].metric.value,null);
  assert.equal(await save('published',0),true);const observed=await listAnalytics('a',query,now);assert.equal(observed.total,0);assert.equal(observed.observedCount,1);assert.equal(observed.rows[0].metric.coverage,'AVAILABLE');
  assert.equal(await save('foreign',999),false);assert.equal((await listAnalytics('b',query,now)).total,null);
});
test('ranking and coverage use all observations with stable ties and stale timestamp',async()=>{
  await analyticsPublication('x');await analyticsPublication('y');await analyticsPublication('z');
  await save('x',7);await save('y',7,{observedAt:new Date('2026-10-06T12:00:00Z')});
  const result=await listAnalytics('a',query,now);assert.deepEqual(result.rows.map(r=>r.publicationId),['x','y','z']);assert.equal(result.total,14);assert.equal(result.observedCount,2);assert.equal(result.eligibleCount,3);assert.equal(result.rows[1].metric.stale,true);
});
test('receipt identity rejects mismatch, disabled or reconnected accounts',async()=>{
  await analyticsPublication('x');assert.equal(await save('x',42,{destination:'999'}),false);
  await getDb().update(socialAccounts).set({enabled:false}).where(eq(socialAccounts.id,'a-MAX'));assert.equal(await save('x',42),false);
  await getDb().update(socialAccounts).set({enabled:true,providerAccountId:'999'}).where(eq(socialAccounts.id,'a-MAX'));assert.equal(await save('x',42),false);
  assert.equal((await getDb().select().from(publicationMetrics)).length,0);
});
test('collection error preserves observed zero and deleting post cascades observations',async()=>{
  await analyticsPublication('x');await save('x',0);
  await saveCollectionResult({userId:'a',publicationId:'x',accountId:'a-MAX',destinationId:'123',remoteMessageId:'mid_42',metric:'views',coverage:'NO_DATA',value:null,error:'RATE_LIMITED'},new Date('2026-10-08T13:00:00Z'));
  const [row]=(await listAnalytics('a',query,now)).rows;assert.equal(row.metric.value,0);assert.equal(row.metric.observedAt,now.toISOString());assert.equal(row.metric.collectionError,'RATE_LIMITED');
  await getDb().delete(posts).where(eq(posts.id,'x'));assert.equal((await getDb().select().from(publicationMetrics)).length,0);assert.equal(await save('x',5),false);
});
test('historical Telegram public username cannot prove delivery destination',async()=>{
  await analyticsPublication('x',{provider:'TELEGRAM',destination:null,remoteId:'31,32'});
  const q={provider:'telegram' as const,period:7 as const,page:0};assert.equal((await listAnalytics('a',q,now)).rows[0].metric.coverage,'IDENTITY_UNPROVEN');
  await getDb().update(publications).set({providerUrl:'https://t.me/c/123456/31'}).where(eq(publications.id,'x'));
  assert.equal((await listAnalytics('a',q,now)).rows[0].metric.coverage,'NO_DATA');
});
test('summed views cannot silently lose integer precision',async()=>{
  await analyticsPublication('x');await analyticsPublication('y');await save('x',Number.MAX_SAFE_INTEGER);await save('y',1);
  const result=await listAnalytics('a',query,now);assert.equal(result.total,null);assert.equal(result.totalOverflow,true);
});

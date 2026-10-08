import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../db/index.ts';
import {socialAccounts,posts,publicationMetrics} from '../db/schema.ts';
import {analyticsFixture,analyticsPublication} from './helpers/analytics-fixture.ts';
import {ingestTelegramReaction} from '../lib/server/analytics/telegram.ts';
import {listAnalytics} from '../lib/server/analytics/repository.ts';
beforeEach(analyticsFixture);after(closeDb);
const now=new Date('2026-10-08T12:00:00Z');
const event={updateId:1,destinationId:'-100123456',messageId:'31',eventAt:now,total:7};
const query={provider:'telegram' as const,period:7 as const,page:0};
test('aggregate replacement, duplicates, older dates and equal-date IDs are atomic',async()=>{
  await analyticsPublication('x',{provider:'TELEGRAM'});
  assert.equal(await ingestTelegramReaction(event,now),'APPLIED');assert.equal(await ingestTelegramReaction(event,now),'IGNORED');
  assert.equal(await ingestTelegramReaction({...event,updateId:2,eventAt:new Date('2026-10-08T11:00:00Z'),total:99},now),'IGNORED');
  assert.equal(await ingestTelegramReaction({...event,updateId:2,total:0},now),'APPLIED');
  assert.equal((await listAnalytics('a',query,now)).rows[0].metric.value,0);
  await Promise.all([ingestTelegramReaction({...event,updateId:4,total:4},now),ingestTelegramReaction({...event,updateId:3,total:99},now)]);
  assert.equal((await listAnalytics('a',query,now)).rows[0].metric.value,4);assert.equal((await getDb().select().from(publicationMetrics)).length,1);
});
test('unknown, foreign-only and ambiguous cross-owner mapping are ignored',async()=>{
  assert.equal(await ingestTelegramReaction(event,now),'IGNORED');await analyticsPublication('foreign',{owner:'b',provider:'TELEGRAM'});assert.equal(await ingestTelegramReaction(event,now),'IGNORED');
  await analyticsPublication('owned',{provider:'TELEGRAM'});assert.equal(await ingestTelegramReaction(event,now),'IGNORED');assert.equal((await getDb().select().from(publicationMetrics)).length,0);
});
test('album non-primary, reconnected, disabled and deleted publication cannot gain reactions',async()=>{
  await analyticsPublication('x',{provider:'TELEGRAM',remoteId:'31,32'});assert.equal(await ingestTelegramReaction({...event,messageId:'32'},now),'IGNORED');
  await getDb().update(socialAccounts).set({providerAccountId:'-100999'}).where(eq(socialAccounts.id,'a-TELEGRAM'));assert.equal(await ingestTelegramReaction({...event,destinationId:'-100999'},now),'IGNORED');
  await getDb().update(socialAccounts).set({providerAccountId:'-100123456',enabled:false}).where(eq(socialAccounts.id,'a-TELEGRAM'));assert.equal(await ingestTelegramReaction(event,now),'IGNORED');
  await getDb().delete(posts).where(eq(posts.id,'x'));assert.equal(await ingestTelegramReaction(event,now),'IGNORED');assert.equal((await getDb().select().from(publicationMetrics)).length,0);
});

import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../db/index.ts';
import {socialAccounts,posts,publicationMetrics} from '../db/schema.ts';
import {analyticsFixture,analyticsPublication} from './helpers/analytics-fixture.ts';
import {ingestTelegramReaction} from '../lib/server/analytics/telegram.ts';
import {listAnalytics} from '../lib/server/analytics/repository.ts';
import {POST} from '../app/api/analytics/telegram/webhook/route.ts';
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

test('disconnected accounts and same-owner ambiguous identity cannot gain reactions',async()=>{
  await analyticsPublication('x',{provider:'TELEGRAM'});
  await getDb().update(socialAccounts).set({connectionStatus:'DISCONNECTED'}).where(eq(socialAccounts.id,'a-TELEGRAM'));
  assert.equal(await ingestTelegramReaction(event,now),'IGNORED');
  await getDb().update(socialAccounts).set({connectionStatus:'CONNECTED'}).where(eq(socialAccounts.id,'a-TELEGRAM'));
  await analyticsPublication('duplicate',{provider:'TELEGRAM'});
  assert.equal(await ingestTelegramReaction(event,now),'IGNORED');
  assert.equal((await getDb().select().from(publicationMetrics)).length,0);
});

test('pre-publication events are ignored while the receipt second is eligible',async()=>{
  await analyticsPublication('x',{provider:'TELEGRAM',publishedAt:new Date('2026-10-08T12:00:00.500Z')});
  assert.equal(await ingestTelegramReaction({...event,eventAt:new Date('2026-10-08T11:59:59Z')},now),'IGNORED');
  assert.equal((await getDb().select().from(publicationMetrics)).length,0);
  assert.equal(await ingestTelegramReaction(event,now),'APPLIED');
  assert.equal((await listAnalytics('a',query,new Date('2026-10-08T12:00:01Z'))).rows[0].metric.value,7);
});

test('ignored duplicate, older and lower-ID events preserve last-known value and time',async()=>{
  await analyticsPublication('x',{provider:'TELEGRAM'});
  assert.equal(await ingestTelegramReaction({...event,updateId:10},now),'APPLIED');
  const [before]=await getDb().select().from(publicationMetrics);
  for(const incoming of [
    {...event,updateId:10,total:99},
    {...event,updateId:9,total:99},
    {...event,updateId:11,eventAt:new Date('2026-10-08T11:59:59Z'),total:99},
  ]) assert.equal(await ingestTelegramReaction(incoming,new Date('2026-10-08T12:05:00Z')),'IGNORED');
  const [afterIgnored]=await getDb().select().from(publicationMetrics);
  assert.deepEqual(afterIgnored,before);
});

test('authenticated aggregate route persists once and safely accepts Telegram redelivery',async()=>{
  const previous=process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET;
  process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET='synthetic_analytics_secret';
  try {
    await analyticsPublication('x',{provider:'TELEGRAM'});
    const body={update_id:7,message_reaction_count:{chat:{id:-100123456,type:'channel'},message_id:31,date:Math.floor(now.getTime()/1000),reactions:[{type:{type:'emoji',emoji:'👍'},total_count:6}]}};
    const request=()=>new Request('https://planly.test/api/analytics/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'synthetic_analytics_secret'},body:JSON.stringify(body)});
    const first=await POST(request());
    assert.equal(first.status,200);assert.deepEqual(await first.json(),{ok:true});
    const [saved]=await getDb().select().from(publicationMetrics);
    assert.equal(saved.value,6);assert.equal(saved.lastUpdateId,7);
    const repeated=await POST(request());
    assert.equal(repeated.status,200);assert.deepEqual(await repeated.json(),{ok:true});
    assert.deepEqual(await getDb().select().from(publicationMetrics),[saved]);
    const dto=await listAnalytics('a',query,now);
    assert.equal(dto.observedCount,1);assert.equal(dto.total,6);assert.equal(dto.rows[0].metric.coverage,'AVAILABLE');
  } finally {
    if(previous===undefined)delete process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET;else process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET=previous;
  }
});

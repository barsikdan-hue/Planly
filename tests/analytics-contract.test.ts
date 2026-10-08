import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsQuerySchema } from '../lib/contracts/analytics.ts';
import { publicationWindow, parseTelegramPrimaryId, legacyTelegramDestination, summarizeObserved, parseMaxViews } from '../lib/analytics.ts';

test('publication cohort includes Moscow calendar days, not a rolling metric window', () => {
  assert.deepEqual(publicationWindow(7, new Date('2026-10-08T12:00:00Z')), {from:new Date('2026-10-01T21:00:00Z'),through:new Date('2026-10-08T12:00:00Z')});
  assert.equal(publicationWindow(30, new Date('2026-01-01T00:00:00Z')).from.toISOString(), '2025-12-02T21:00:00.000Z');
  assert.equal(publicationWindow(7, new Date('2026-10-07T21:00:00Z')).from.toISOString(), '2026-10-01T21:00:00.000Z');
});
test('only a complete album identity supplies a primary message', () => {
  assert.equal(parseTelegramPrimaryId('31,32'), '31');
  for(const id of ['31,,32','31,31','0','01',' 31','-1','1.2','9007199254740992']) assert.equal(parseTelegramPrimaryId(id), null);
});
test('historical identity requires an immutable numeric channel link', () => {
  assert.equal(legacyTelegramDestination('https://t.me/c/123456/31','31'), '-100123456');
  for(const url of ['https://t.me/channel_name/31','https://evil.test/c/123456/31','https://t.me/c/123456/32','https://x:t@t.me/c/123456/31','https://t.me/c/123456/31?a=b','https://t.me/c/123456/31#x','http://t.me/c/123456/31']) assert.equal(legacyTelegramDestination(url,'31'),null);
});
test('analytics queries cannot carry arbitrary provider IDs or URLs', () => {
  assert.equal(analyticsQuerySchema.safeParse({provider:'max',period:7,page:0}).success,true);
  for(const input of [{provider:'vk',period:7,page:0},{provider:'max',period:8,page:0},{provider:'max',period:7,page:-1},{provider:'max',period:7,page:10001},{provider:'max',period:7,page:0,url:'https://evil.test'}]) assert.equal(analyticsQuerySchema.safeParse(input).success,false);
});
test('totals distinguish observed zero, missing data and overflow', () => {
  assert.deepEqual(summarizeObserved([null,null]),{observedCount:0,total:null,totalOverflow:false});
  assert.deepEqual(summarizeObserved([null,0]),{observedCount:1,total:0,totalOverflow:false});
  assert.deepEqual(summarizeObserved([2,3,null]),{observedCount:2,total:5,totalOverflow:false});
  assert.deepEqual(summarizeObserved([Number.MAX_SAFE_INTEGER,1]),{observedCount:2,total:null,totalOverflow:true});
});
test('MAX views require the requested message and destination, absent is not zero', () => {
  const expected={destinationId:'-123',remoteId:'mid_42'};
  const message={body:{mid:'mid_42'},recipient:{chat_id:-123}};
  assert.deepEqual(parseMaxViews(message,expected),{coverage:'NO_DATA',value:null,error:null});
  assert.deepEqual(parseMaxViews({...message,stat:null},expected),{coverage:'NO_DATA',value:null,error:null});
  assert.deepEqual(parseMaxViews({...message,stat:{views:0}},expected),{coverage:'AVAILABLE',value:0,error:null});
  for(const views of [-1,1.2,Number.MAX_SAFE_INTEGER+1,'42',null]) assert.equal(parseMaxViews({...message,stat:{views}},expected).error,'INVALID_RESPONSE');
  assert.equal(parseMaxViews({...message,recipient:{chat_id:-999},stat:{views:42}},expected).error,'INVALID_RESPONSE');
  assert.equal(parseMaxViews({...message,body:{mid:'other'},stat:{views:42}},expected).error,'INVALID_RESPONSE');
});

test('MAX numeric destinations also accept positive canonical chat IDs', () => {
  assert.deepEqual(parseMaxViews({body:{mid:'mid_42'},recipient:{chat_id:123},stat:{views:5}},{destinationId:'123',remoteId:'mid_42'}),{coverage:'AVAILABLE',value:5,error:null});
});

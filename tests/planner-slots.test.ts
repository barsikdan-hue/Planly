import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { slotQuerySchema } from '../lib/contracts/swipe-planner.ts';
import { findNextSlot, slotMinuteKey, slotPresets } from '../lib/planner-slots.ts';
const query = { providers: ['telegram' as const], startDate: '2030-01-01', endDate: '2030-01-07', weekdays: [1,2,3,4,5,6,7], times: ['10:00'] };
test('Moscow daily preset becomes UTC and inputs stay unchanged', () => {
  const before = JSON.stringify(query);
  assert.equal(findNextSlot(query, new Set(), new Date('2030-01-01T06:59:59Z')), '2030-01-01T07:00:00.000Z');
  assert.equal(JSON.stringify(query), before);
  assert.deepEqual(slotPresets.daily10and18.times, ['10:00','18:00']);
  assert.deepEqual(slotPresets.weekdays10.weekdays, [1,2,3,4,5]);
});
test('elapsed and occupied minutes are excluded and last day is inclusive', () => {
  assert.equal(slotMinuteKey('2030-01-02T07:00:30Z'), '2030-01-02T07:00');
  const occupied = new Set([slotMinuteKey('2030-01-02T07:00:30Z')]);
  assert.equal(findNextSlot(query, occupied, new Date('2030-01-01T07:00:00Z')), '2030-01-03T07:00:00.000Z');
  assert.equal(findNextSlot({...query, endDate:'2030-01-01'}, new Set(), new Date('2030-01-01T07:00:00Z')), null);
  assert.equal(findNextSlot({...query, times:['18:00','10:00'], endDate:'2030-01-01'}, new Set(), new Date('2030-01-01T08:00:00Z')), '2030-01-01T15:00:00.000Z');
});
test('ISO weekday and year/month/leap boundaries', () => {
  const base = {...query, startDate:'2028-02-28',endDate:'2028-03-01',weekdays:[2]};
  assert.equal(findNextSlot(base,new Set(),new Date('2028-02-27T00:00Z')), '2028-02-29T07:00:00.000Z');
  assert.equal(findNextSlot({...query,startDate:'2029-12-31',endDate:'2030-01-01'},new Set(),new Date('2029-12-31T08:00Z')), '2030-01-01T07:00:00.000Z');
});
test('query bounds reject invalid dates, duplicate platforms/weekdays/times and empty settings', () => {
  for (const patch of [{providers:[]},{providers:['telegram','telegram']},{times:[]},{times:['10:00','10:00']},{times:['25:00']},{times:['01:00','02:00','03:00','04:00','05:00']},{weekdays:[]},{weekdays:[0]},{weekdays:[1,1]},{startDate:'2030-02-30'},{endDate:'2029-12-31'},{endDate:'2030-02-01'}]) assert.equal(slotQuerySchema.safeParse({...query,...patch}).success,false,JSON.stringify(patch));
  assert.equal(slotQuerySchema.safeParse({...query,endDate:'2030-01-31'}).success,true);
  assert.equal(slotQuerySchema.safeParse({...query,providers:['telegram','max']}).success,true);
});
test('last supported four-digit year remains a bounded no-slot search', () => {
  const moduleUrl = new URL('../lib/planner-slots.ts',import.meta.url).href;
  const lastDate = {...query,startDate:'9999-12-31',endDate:'9999-12-31'};
  const result = execFileSync(process.execPath,['--input-type=module','--experimental-strip-types','-e',`import {findNextSlot} from ${JSON.stringify(moduleUrl)}; console.log(findNextSlot(${JSON.stringify(lastDate)},new Set(),new Date('+010000-01-01T00:00:00Z')));`],{timeout:10000,encoding:'utf8'});
  assert.equal(result.trim(),'null');
});

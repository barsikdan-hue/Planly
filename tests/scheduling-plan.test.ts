import test from 'node:test';
import assert from 'node:assert/strict';
const contracts = await import('../lib/contracts/scheduling-plan.ts').catch(() => null);
const feature = await import('../lib/scheduling-plan.ts').catch(() => null);
const settings = { startDate: '2030-01-01', endDate: '2030-01-01', weekdays: [1,2,3,4,5,6,7], times: ['10:00','18:00'] };
const query = { ...settings, providers: ['telegram' as const] };
const input = { operationId: 'a96f4792-3dc2-4d72-b3fb-74bdbe6eff91', settings,
  rows: [{ postId: 'a', fingerprint: 'a'.repeat(64), scheduledAt: '2030-01-01T07:00:00Z', reviewed: true as const }] };

test('allocates the whole ordered batch, preserves input occupancy and retains unassigned rows', () => {
  assert.ok(feature, 'batch allocation module exists');
  const occupied = new Set<string>();
  const rows = feature.allocateDraftSlots(['a','b','c'], query, occupied, new Date('2029-12-31T00:00Z'));
  assert.deepEqual(rows, [{postId:'a',scheduledAt:'2030-01-01T07:00:00.000Z'}, {postId:'b',scheduledAt:'2030-01-01T15:00:00.000Z'}, {postId:'c',scheduledAt:null}]);
  assert.equal(occupied.size, 0);
  assert.deepEqual(feature.allocateDraftSlots(['b','a'], query, new Set(['2030-01-01T07:00']), new Date('2029-12-31')).map(r=>r.postId), ['b','a']);
});
test('slot membership enforces Moscow day/weekdays, exact minute, range and time', () => {
  assert.ok(feature);
  assert.equal(feature.isSchedulingPlanSlot(settings, '2030-01-01T07:00:00Z'), true);
  assert.equal(feature.isSchedulingPlanSlot(settings, '2030-01-01T10:00:00+03:00'), true);
  for (const iso of ['2030-01-01T07:00:30Z','2030-01-01T07:00:00.001Z','2030-01-02T07:00:00Z','2030-01-01T08:00:00Z','bad']) assert.equal(feature.isSchedulingPlanSlot(settings, iso), false, iso);
  assert.equal(feature.isSchedulingPlanSlot({...settings,weekdays:[1]}, '2030-01-01T07:00:00Z'), false);
});
test('canonical commit normalizes equivalent offsets and settings order, but preserves row order', () => {
  assert.ok(feature);
  const other = {...input,settings:{...settings,weekdays:[7,6,5,4,3,2,1],times:['18:00','10:00']}, rows:[{...input.rows[0],scheduledAt:'2030-01-01T10:00:00+03:00'}]};
  assert.deepEqual(feature.canonicalSchedulingPlanCommit(input), feature.canonicalSchedulingPlanCommit(other));
  const pair = {...input,rows:[input.rows[0],{...input.rows[0],postId:'b',scheduledAt:'2030-01-01T15:00:00Z'}]};
  assert.notDeepEqual(feature.canonicalSchedulingPlanCommit(pair), feature.canonicalSchedulingPlanCommit({...pair,rows:[...pair.rows].reverse()}));
});
test('strict commit contract requires UUID, distinct owned-selection IDs, fingerprints and individual review', () => {
  assert.ok(contracts);
  assert.equal(contracts.schedulingPlanCommitInputSchema.safeParse(input).success, true);
  for (const patch of [{operationId:'bad'},{extra:true},{rows:[]},{rows:Array.from({length:21},(_,i)=>({...input.rows[0],postId:String(i)}))},{rows:[input.rows[0],input.rows[0]]},
    {rows:[{...input.rows[0],reviewed:false}]},{rows:[{...input.rows[0],fingerprint:'A'.repeat(64)}]}, {rows:[{...input.rows[0],fingerprint:'a'}]}, {rows:[{...input.rows[0],extra:true}]}, {rows:[{...input.rows[0],scheduledAt:'bad'}]}]) {
    assert.equal(contracts.schedulingPlanCommitInputSchema.safeParse({...input,...patch}).success, false, JSON.stringify(patch));
  }
});
test('preview uses existing date/day/time bounds and excludes client provider metadata', () => {
  assert.ok(contracts);
  const base = {postIds:['a'],settings};
  assert.equal(contracts.schedulingPlanPreviewInputSchema.safeParse(base).success, true);
  for (const patch of [{providers:['telegram']},{times:[]},{times:['10:00','10:00']},{times:['01:00','02:00','03:00','04:00','05:00']},{weekdays:[0]}, {weekdays:[1,1]}, {startDate:'2030-02-30'},{endDate:'2030-02-01'},{endDate:'2029-12-31'}]) assert.equal(contracts.schedulingPlanPreviewInputSchema.safeParse({...base,settings:{...settings,...patch}}).success, false);
  for (const postIds of [[],['a','a'],Array.from({length:21},(_,i)=>String(i))]) assert.equal(contracts.schedulingPlanPreviewInputSchema.safeParse({...base,postIds}).success, false);
  assert.equal(contracts.schedulingPlanPreviewInputSchema.safeParse({...base,settings:{...settings,endDate:'2030-01-31'}}).success, true);
});
test('allocation handles future equality and leap-year/month boundaries', () => {
  assert.ok(feature);
  assert.equal(feature.allocateDraftSlots(['a'], query,new Set(),new Date('2030-01-01T07:00Z'))[0].scheduledAt,'2030-01-01T15:00:00.000Z');
  assert.equal(feature.allocateDraftSlots(['a'], {...query,startDate:'2028-02-28',endDate:'2028-03-01',weekdays:[2]},new Set(),new Date('2028-02-27'))[0].scheduledAt,'2028-02-29T07:00:00.000Z');
});
test('fractional non-slot instants are rejected before Date can truncate them',()=>{
  assert.ok(feature);assert.ok(contracts);
  for(const scheduledAt of ['2030-01-01T07:00:00.0001Z','2030-01-01T10:00:00.0009+03:00','2030-01-01T07:00:00.001Z']){
    assert.equal(feature.isSchedulingPlanSlot(settings,scheduledAt),false,scheduledAt);
    assert.throws(()=>feature.canonicalSchedulingPlanCommit({...input,rows:[{...input.rows[0],scheduledAt}]}));
  }
  assert.deepEqual(feature.canonicalSchedulingPlanCommit({...input,rows:[{...input.rows[0],scheduledAt:'2030-01-01T10:00:00.000000+03:00'}]}),feature.canonicalSchedulingPlanCommit(input));
});

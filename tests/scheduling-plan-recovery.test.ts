import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanlyApiError } from '../lib/client/planly-api.ts';
const feature=await import('../lib/client/scheduling-plan-recovery.ts').catch(()=>null);
const input={operationId:'a96f4792-3dc2-4d72-b3fb-74bdbe6eff91',settings:{startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[1],times:['10:00']},rows:[{postId:'a',fingerprint:'a'.repeat(64),scheduledAt:'2030-01-01T07:00:00Z',reviewed:true as const}]};
const pending={version:1 as const,ownerId:'owner',operationId:input.operationId,input};
const result={replayed:false,receipt:{operationId:input.operationId,appliedAt:'2029-12-31T00:00:00Z',rows:[{postId:'a',targetIds:['a-TG'],scheduledAt:'2030-01-01T07:00:00Z'}]}};
function storage() {const values=new Map<string,string>();return {get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};}
test('two lost-response tabs preserve every key through reload and independent acknowledgement',async()=>{
  assert.ok(feature);const cache=storage();const second={...pending,operationId:'03fbeb15-c101-4111-9d60-399ba4f623cb',input:{...input,operationId:'03fbeb15-c101-4111-9d60-399ba4f623cb'}};
  for(const entry of [pending,second])await assert.rejects(()=>feature.submitPendingSchedulingPlan(cache,entry,async()=>{throw new Error('lost response');}));
  assert.equal(feature.readPendingSchedulingPlans(cache,'owner').pending.length,2);
  let seen='';await feature.submitPendingSchedulingPlan(cache,pending,async body=>{seen=body.operationId;return {...result,replayed:true};});
  assert.equal(seen,input.operationId);assert.deepEqual(feature.readPendingSchedulingPlans(cache,'owner').pending.map(p=>p.operationId),[second.operationId]);
  assert.equal(feature.readPendingSchedulingPlans(cache,'other').pending.length,0);
});
test('storage failure prevents dispatch and existing operation payload is immutable',async()=>{
  assert.ok(feature);let calls=0;const cache=storage();cache.setItem=()=>{throw new Error('quota');};
  await assert.rejects(()=>feature.submitPendingSchedulingPlan(cache,pending,async()=>{calls++;return result;}));assert.equal(calls,0);
  const normal=storage();feature.persistPendingSchedulingPlan(normal,pending);
  assert.throws(()=>feature.persistPendingSchedulingPlan(normal,{...pending,input:{...input,rows:[{...input.rows[0],postId:'different'}]}}));
  assert.equal(feature.readPendingSchedulingPlans(normal,'owner').pending[0].input.rows[0].postId,'a');
});
test('only typed proven pre-commit rejection clears its own key',async()=>{
  assert.ok(feature);for(const error of [new PlanlyApiError('bad',500,{code:'PLAN_STALE',commitApplied:false}),new PlanlyApiError('bad',409,{code:'PLAN_OPERATION_CONFLICT',commitApplied:false}),new PlanlyApiError('bad',401),new PlanlyApiError('bad',409,{code:'PLAN_STALE'}),new PlanlyApiError('bad',409,{code:'PLAN_STALE',commitApplied:false})]) {
    const cache=storage();await assert.rejects(()=>feature.submitPendingSchedulingPlan(cache,pending,async()=>{throw error;}));
    assert.equal(feature.readPendingSchedulingPlans(cache,'owner').pending.length,error.status===409&&((error.body as {commitApplied?:boolean;code?:string})?.code==='PLAN_STALE')&&((error.body as {commitApplied?:boolean})?.commitApplied===false)?0:1);
  }
});
test('corrupt, oversized and unreadable current-owner storage blocks without replaying foreign data',()=>{
  assert.ok(feature);const cache=storage();cache.setItem(`planly:scheduling-plan:v1:owner:${input.operationId}`,'bad');
  assert.equal(feature.readPendingSchedulingPlans(cache,'owner').blocked,true);assert.equal(feature.readPendingSchedulingPlans(cache,'other').blocked,false);
  cache.setItem(`planly:scheduling-plan:v1:owner:${input.operationId}`,'x'.repeat(65537));assert.equal(feature.readPendingSchedulingPlans(cache,'owner').blocked,true);
  cache.getItem=()=>{throw new Error('denied');};assert.equal(feature.readPendingSchedulingPlans(cache,'owner').blocked,true);
});
test('malformed or mismatched receipt preserves original pending intent',async()=>{
  assert.ok(feature);for(const response of [{...result,receipt:{...result.receipt,operationId:'03fbeb15-c101-4111-9d60-399ba4f623cb'}},{...result,receipt:{...result.receipt,rows:[{...result.receipt.rows[0],postId:'other'}]}}]) {
    const cache=storage();await assert.rejects(()=>feature.submitPendingSchedulingPlan(cache,pending,async()=>response));assert.equal(feature.readPendingSchedulingPlans(cache,'owner').pending.length,1);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type {SchedulingPlanPreview} from '../lib/contracts/scheduling-plan.ts';
const feature=await import('../lib/client/scheduling-plan-state.ts').catch(()=>null);
const settings={startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[1],times:['10:00']};
const preview:SchedulingPlanPreview={complete:true,media:[],rows:['a','b'].map((id,i)=>({post:{id,title:null,baseText:`Text ${id}`,status:'DRAFT',targets:[],mediaIds:[],createdAt:'2026-01-01T00:00Z',updatedAt:'2026-01-01T00:00Z'},accounts:[],fingerprint:id.repeat(64),scheduledAt:`2030-01-01T${i?'15':'07'}:00:00Z`,issue:null}))};
function prepared() {assert.ok(feature);let s=feature.initialSchedulingPlanState();s=feature.reduceSchedulingPlan(s,{type:'SELECT',postIds:['a','b']});s=feature.reduceSchedulingPlan(s,{type:'SETTINGS',settings});s=feature.reduceSchedulingPlan(s,{type:'PREVIEW_START',revision:s.revision});return feature.reduceSchedulingPlan(s,{type:'PREVIEW_RECEIVED',revision:s.revision,preview});}
test('each row needs a separate check; incomplete or pending state cannot confirm',()=>{
  assert.ok(feature);let s=prepared();assert.equal(feature.canConfirmSchedulingPlan(s),false);
  s=feature.reduceSchedulingPlan(s,{type:'REVIEW',postId:'a',checked:true});assert.equal(feature.canConfirmSchedulingPlan(s),false);
  s=feature.reduceSchedulingPlan(s,{type:'REVIEW',postId:'b',checked:true});assert.equal(feature.canConfirmSchedulingPlan(s),true);
  assert.equal(feature.canConfirmSchedulingPlan({...s,recoveryBlocked:true}),false);assert.equal(feature.canConfirmSchedulingPlan({...s,preview:{...preview,complete:false}}),false);
});
test('selection/order/settings changes invalidate preview and checks, and old responses cannot apply',()=>{
  assert.ok(feature);for(const event of [{type:'SELECT' as const,postIds:['b','a']},{type:'SETTINGS' as const,settings:{...settings,times:['18:00']}}]) {const s=prepared();const changed=feature.reduceSchedulingPlan(s,event);assert.equal(changed.preview,null);assert.deepEqual(changed.reviewed,{});assert.equal(feature.reduceSchedulingPlan(changed,{type:'PREVIEW_RECEIVED',revision:s.revision,preview}).preview,null);}
});
test('new content fingerprints never inherit old approval; request generations differ',()=>{
  assert.ok(feature);let s=prepared();s=feature.reduceSchedulingPlan(s,{type:'REVIEW',postId:'a',checked:true});const old=s.revision;
  s=feature.reduceSchedulingPlan(s,{type:'PREVIEW_START',revision:old});assert.equal(s.revision,old+1);
  assert.equal(feature.reduceSchedulingPlan(s,{type:'PREVIEW_RECEIVED',revision:old,preview}).preview,null);
  s=feature.reduceSchedulingPlan(s,{type:'PREVIEW_RECEIVED',revision:s.revision,preview:{...preview,rows:preview.rows.map(r=>({...r,fingerprint:'c'.repeat(64)}))}});assert.deepEqual(s.reviewed,{});
});

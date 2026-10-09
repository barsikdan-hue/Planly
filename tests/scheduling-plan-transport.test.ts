import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../lib/client/planly-api.ts';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
test('scheduling transport sends exact json with custom header and no automatic retries',async()=>{
  assert.equal(typeof api.previewSchedulingPlanRequest,'function');assert.equal(typeof api.commitSchedulingPlanRequest,'function');
  const calls:{url:string;init:RequestInit|undefined}[]=[];
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({error:'stale',code:'PLAN_STALE',commitApplied:false},{status:409});};
  const settings={startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[2],times:['10:00']};
  const preview={postIds:['a'],settings};const commit={operationId:'11111111-1111-4111-8111-111111111111',settings,rows:[{postId:'a',fingerprint:'a'.repeat(64),scheduledAt:'2030-01-01T07:00:00Z',reviewed:true as const}]};
  await assert.rejects(api.previewSchedulingPlanRequest(preview),api.PlanlyApiError);
  await assert.rejects(api.commitSchedulingPlanRequest(commit),(e:unknown)=>e instanceof api.PlanlyApiError&&e.status===409&&(e.body as {commitApplied?:boolean})?.commitApplied===false);
  assert.equal(calls.length,2);for(const [i,c]of calls.entries()){assert.equal(c.url,`/api/scheduling-plans/${i?'commit':'preview'}`);assert.equal(c.init?.method,'POST');assert.equal(new Headers(c.init?.headers).get('X-Planly-Scheduling'),'1');assert.equal(new Headers(c.init?.headers).get('content-type'),'application/json');assert.deepEqual(JSON.parse(String(c.init?.body)),i?commit:preview);}
});

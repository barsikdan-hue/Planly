import test, {beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {closeDb,getDb} from '../db/index.ts';
import {posts,socialAccounts,schedulingPlanOperations} from '../db/schema.ts';
import {createOwnerSession,SESSION_COOKIE_NAME} from '../lib/server/auth/session.ts';
import {seedSchedulingFixture,cleanupSchedulingFixture,owner,settings,schedulingCounts} from './helpers/scheduling-plan-db.ts';
register('./helpers/scheduling-api-loader.mjs',import.meta.url);
const {schedulingPlanApiError}=await import('../lib/server/scheduling-plan-http.ts');
const {SchedulingPlanConflictError}=await import('../lib/server/scheduling-plan-commit.ts');
const previewRoute=await import('../app/api/scheduling-plans/preview/route.ts').catch(()=>null);
const commitRoute=await import('../app/api/scheduling-plans/commit/route.ts').catch(()=>null);
let cookie='';
beforeEach(async()=>{await seedSchedulingFixture();cookie=`${SESSION_COOKIE_NAME}=${await createOwnerSession(owner)}`;});
after(async()=>{await cleanupSchedulingFixture();await closeDb();});
function req(body:unknown,headers:Record<string,string>={}){return new Request('http://localhost/api/scheduling-plans',{method:'POST',headers:{cookie,'content-type':'application/json','X-Planly-Scheduling':'1',...headers},body:JSON.stringify(body)});}
async function preview(ids=['a','b']){assert.ok(previewRoute,'preview endpoint exists');const r=await previewRoute.POST(req({postIds:ids,settings}));assert.equal(r.status,200);return r.json();}
async function input(){const p=await preview();return {operationId:randomUUID(),settings,rows:p.rows.map((r:{post:{id:string};fingerprint:string;scheduledAt:string})=>({postId:r.post.id,fingerprint:r.fingerprint,scheduledAt:r.scheduledAt,reviewed:true}))};}
test('auth precedes validation and csrf fails closed independently of forwarded host',async()=>{
  assert.ok(previewRoute);assert.ok(commitRoute);
  for(const route of [previewRoute,commitRoute]){
    assert.equal((await route.POST(req({}, {cookie:''}))).status,401);
    const invalidHeaders:Record<string,string>[]=[{'X-Planly-Scheduling':''},{'X-Planly-Scheduling':'2'},{'content-type':'text/plain'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}];
    for(const headers of invalidHeaders){
      const r=await route.POST(req({}, {...headers,host:'public.example','x-forwarded-host':'public.example'}));assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store');
    }
  }
});
test('strict input, malformed json and foreign sources use safe precommit categories',async()=>{
  assert.ok(previewRoute);assert.ok(commitRoute);
  for(const route of [previewRoute,commitRoute]){
    let r=await route.POST(req({unknown:true}));assert.equal(r.status,422);assert.deepEqual(await r.json(),{error:'Invalid scheduling input',code:'PLAN_INVALID_INPUT',commitApplied:false});
    r=await route.POST(new Request('http://localhost/api/scheduling-plans',{method:'POST',headers:{cookie,'content-type':'application/json','X-Planly-Scheduling':'1'},body:'{'}));assert.equal(r.status,400);assert.equal((await r.json()).code,'PLAN_BAD_JSON');
  }
  const bodies=[];for(const id of ['foreign','missing']){const r:Response=await previewRoute.POST(req({postIds:[id],settings}));assert.equal(r.status,404);bodies.push(await r.json());}assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[0].commitApplied,false);
});
test('preview is readonly, commit schedules once and replay returns the original receipt',async()=>{
  assert.ok(commitRoute);const before=await schedulingCounts(owner);const body=await input();assert.deepEqual(await schedulingCounts(owner),before);
  const first=await commitRoute.POST(req(body,{'sec-fetch-site':'same-origin','content-type':'application/json; charset=utf-8'}));assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');const saved=await first.json();assert.equal(saved.replayed,false);assert.equal(saved.receipt.rows.length,2);
  const replay=await commitRoute.POST(req(body));assert.equal(replay.status,200);assert.deepEqual(await replay.json(),{...saved,replayed:true});assert.equal((await schedulingCounts(owner)).publications,2);
  const conflict=await commitRoute.POST(req({...body,rows:[...body.rows].reverse()}));assert.equal(conflict.status,409);const error=await conflict.json();assert.equal(error.code,'PLAN_OPERATION_CONFLICT');assert.equal('commitApplied' in error,false);
});
test('stale, unavailable, ineligible and slot conflicts never commit another row',async()=>{
  assert.ok(commitRoute);
  for(const kind of ['stale','account','ineligible','slot']){
    await seedSchedulingFixture();cookie=`${SESSION_COOKIE_NAME}=${await createOwnerSession(owner)}`;const body=await input();
    if(kind==='stale')await getDb().update(posts).set({baseText:'changed'}).where(eq(posts.id,'b'));
    if(kind==='account')await getDb().update(socialAccounts).set({enabled:false}).where(eq(socialAccounts.id,`${owner}-MAX`));
    if(kind==='ineligible')await getDb().update(posts).set({status:'READY'}).where(eq(posts.id,'b'));
    if(kind==='slot')body.rows[1].scheduledAt=body.rows[0].scheduledAt;
    const r=await commitRoute.POST(req(body));assert.equal(r.status,409);const error=await r.json();assert.equal(error.code,{stale:'PLAN_STALE',account:'PLAN_ACCOUNT_UNAVAILABLE',ineligible:'PLAN_INELIGIBLE',slot:'PLAN_SLOT_CONFLICT'}[kind]);assert.equal(error.commitApplied,false);assert.equal((await schedulingCounts(owner)).publications,0);
  }
});
test('incomplete is a clearable conflict while unexpected failures remain pending',async()=>{
  const incomplete=schedulingPlanApiError(new SchedulingPlanConflictError('PLAN_INCOMPLETE'));assert.equal(incomplete.status,409);assert.equal((await incomplete.json()).commitApplied,false);
  const unknown=schedulingPlanApiError(new Error('private database diagnostic'));assert.equal(unknown.status,500);assert.deepEqual(await unknown.json(),{error:'Scheduling temporarily unavailable'});
});
test('a corrupted saved receipt cannot be misclassified as a proven precommit rejection',async()=>{
  assert.ok(commitRoute);const body=await input();assert.equal((await commitRoute.POST(req(body))).status,200);
  await getDb().update(schedulingPlanOperations).set({receipt:{} as never});
  const response=await commitRoute.POST(req(body));assert.equal(response.status,500);assert.equal('commitApplied' in await response.json(),false);assert.equal((await schedulingCounts(owner)).publications,2);
});
test('oversized authenticated json is rejected before preview work',async()=>{
  assert.ok(previewRoute);const r=await previewRoute.POST(new Request('http://localhost/api/scheduling-plans/preview',{method:'POST',headers:{cookie,'content-type':'application/json','X-Planly-Scheduling':'1'},body:JSON.stringify({postIds:['a'],settings})+' '.repeat(65536)}));assert.equal(r.status,422);assert.equal((await r.json()).commitApplied,false);
});

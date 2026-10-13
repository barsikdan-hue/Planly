import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildSwipeApproval, submitSwipeApproval, retrySwipeApproval } from '../lib/client/swipe-planner.ts';
import { readPendingCreation, writePendingCreation } from '../lib/client/pending-creation.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function storage() { const map = new Map<string,string>(); return {getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}}; }
const item = {id:'library',title:'Title',text:'Prepared',status:'READY' as const,mediaIds:['second','first'],sourcePostId:null,createdAt:'2026-10-04T09:00:00.000Z',updatedAt:'2026-10-04T09:00:00.000Z'};
const next = {mode:'next' as const,providers:['telegram' as const],scheduledAt:'2099-10-04T07:00:00.000Z'};
test('scheduled queue preserves title/source/ordered media', () => {
  const input = buildSwipeApproval(item,next);
  assert.equal(input.title,'Title'); assert.equal(input.sourceLibraryItemId,item.id);
  assert.equal(input.sourceLibraryUpdatedAt,item.updatedAt);
  assert.deepEqual(input.mediaIds,['second','first']); assert.equal(input.status,'READY');
  assert.equal(input.targets[0].scheduledAt,next.scheduledAt); assert.equal(input.requireFreeSlot,true);
  assert.throws(()=>buildSwipeApproval({...item,status:'ARCHIVED'},next));
  assert.throws(()=>buildSwipeApproval(item,{...next,providers:[]}));
});

test('late old-owner acknowledgement cannot replace newer same-owner pending after A B A',async()=>{
 const cache=storage();let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});let current=true;
 globalThis.fetch=async()=>{await gate;return Response.json({id:'old-ack'});};
 const old=submitSwipeApproval(cache,'owner',item,next,()=>current);
 const original=readPendingCreation(cache,'owner')!;
 const fresh={...original,key:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 writePendingCreation(cache,'owner',fresh);current=false;finish();await old;
 assert.deepEqual(readPendingCreation(cache,'owner'),fresh);
});

test('legacy unmarked version1 Swipe DRAFT recovery sends exact stored payload and UUID',async()=>{
 const cache=storage();globalThis.fetch=async()=>{throw Error('Lost');};
 await assert.rejects(submitSwipeApproval(cache,'owner',item,next));
 const pending=readPendingCreation(cache,'owner')!;
 const rest={...pending.input};delete rest.swipeReview;delete rest.requireFreeSlot;
 const legacy={...pending,intent:'draft' as const,input:{...rest,status:'DRAFT' as const,targets:[{...rest.targets[0],scheduledAt:null}]}};
 writePendingCreation(cache,'owner',legacy);
 globalThis.fetch=async(_url,init)=>{assert.equal(new Headers(init?.headers).get('idempotency-key'),legacy.key);assert.deepEqual(JSON.parse(String(init?.body)),legacy.input);return Response.json({id:'ack'});};
 await retrySwipeApproval(cache,'owner');
});
test('durable queue origin and slot guard survive lost response with byte-identical retry and no PATCH', async () => {
  const cache = storage(); const requests:{method:string|undefined,body:string,key:string|null}[]=[];
  globalThis.fetch = async (_url,init) => {
    const pending = readPendingCreation(cache,'owner');
    assert.equal(pending?.origin,'swipe-planner');
    assert.equal(pending?.input.requireFreeSlot,true);
    assert.equal(pending?.input.sourceLibraryUpdatedAt,item.updatedAt);
    requests.push({method:init?.method,body:String(init?.body),key:new Headers(init?.headers).get('idempotency-key')});
    if(requests.length===1) throw Error('Lost response');
    return Response.json({id:'ack'});
  };
  await assert.rejects(submitSwipeApproval(cache,'owner',item,next),/Lost response/);
  assert.equal(requests.length,1);
  await assert.rejects(submitSwipeApproval(cache,'owner',item,next),/предыдущее/i);
  const result = await retrySwipeApproval(cache,'owner');
  assert.equal(result.saved.id,'ack'); assert.deepEqual(requests[1],requests[0]); assert.equal(requests.length,2);
});
test('storage failure prevents queue request and hydration never submits', async () => {
  let calls=0; globalThis.fetch=async()=>{calls++;return Response.json({id:'ack'});};
  const cache={...storage(),setItem(){throw Error('Storage unavailable');}};
  assert.equal(readPendingCreation(cache,'owner'),null);
  await assert.rejects(submitSwipeApproval(cache,'owner',item,next),/Storage unavailable/);assert.equal(calls,0);
});
for (const code of ['PLANNER_SLOT_CONFLICT','LIBRARY_SOURCE_CONFLICT','LIBRARY_SOURCE_STALE']) test(`${code} releases pending only on proven precommit rejection`,async()=>{
  const cache=storage(); globalThis.fetch=async()=>Response.json({error:'Conflict',code},{status:409});
  await assert.rejects(submitSwipeApproval(cache,'owner',item,next)); assert.equal(readPendingCreation(cache,'owner'),null);
});
test('5xx retains the original request for explicit recovery',async()=>{
  const cache=storage(); globalThis.fetch=async()=>Response.json({error:'server'},{status:500});
  await assert.rejects(submitSwipeApproval(cache,'owner',item,next)); assert.ok(readPendingCreation(cache,'owner'));
});
for(const status of [400,404,422])test(`generic ${status} marked response is unknown and retains pending`,async()=>{
 const cache=storage();globalThis.fetch=async()=>Response.json({error:'Unclassified proxy response'},{status});
 await assert.rejects(submitSwipeApproval(cache,'owner',item,next));assert.ok(readPendingCreation(cache,'owner'));
});
test('typed account precommit rejection releases marked pending',async()=>{
 const cache=storage();globalThis.fetch=async()=>Response.json({error:'Disconnected',code:'PLANNER_ACCOUNT_UNAVAILABLE'},{status:422});
 await assert.rejects(submitSwipeApproval(cache,'owner',item,next));assert.equal(readPendingCreation(cache,'owner'),null);
});
test('arbitrary issues-only 422 remains pending; explicit Swipe validation precommit code releases it',async()=>{
 for(const code of [undefined,'SWIPE_APPROVAL_INVALID']){
  const cache=storage();globalThis.fetch=async()=>Response.json({error:'Validation failed',issues:[{code:'custom',message:'unknown'}],...(code?{code}:{})},{status:422});
  await assert.rejects(submitSwipeApproval(cache,'owner',item,next));assert.equal(!!readPendingCreation(cache,'owner'),code===undefined);
 }
});

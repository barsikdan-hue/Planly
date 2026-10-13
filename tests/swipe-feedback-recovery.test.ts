import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {submitSwipeApproval,retrySwipeApproval} from '../lib/client/swipe-planner.ts';
import {readPendingCreation} from '../lib/client/pending-creation.ts';
const originalFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=originalFetch;});
function storage(){const map=new Map<string,string>();return{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}};}
const item={id:'source',title:'Title',text:'Body',status:'READY' as const,mediaIds:[],sourcePostId:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
const approval={mode:'next' as const,providers:['telegram' as const],scheduledAt:'2099-01-01T07:00:00Z'};
test('LIKE reload terminal410 clears matching pending; unknown410 retains it; stale owner retains it',async()=>{
 for(const kind of ['terminal','unknown','stale']){
  const cache=storage();globalThis.fetch=async()=>{throw Error('lost');};await assert.rejects(submitSwipeApproval(cache,'A',item,approval));const first=readPendingCreation(cache,'A');
  globalThis.fetch=async()=>Response.json({error:'deleted',code:kind==='unknown'?'OTHER':'DECISION_RESULT_DELETED'},{status:410});
  await assert.rejects(retrySwipeApproval(cache,'A',()=>kind!=='stale'));
  assert.deepEqual(readPendingCreation(cache,'A'),kind==='terminal'?null:first);
 }
});
async function helpers(){const mod=await import('../lib/client/swipe-feedback.ts').catch(()=>null);assert.ok(mod,'durable dislike helper exists');return mod;}
test('DISLIKE lost response reload sends identical UUID/body; hydration sends zero; LIKE blocked',async()=>{
 const {submitSwipeDislike,retrySwipeDislike,readPendingDislike}=await helpers();const cache=storage();const calls:{url:string;init?:RequestInit}[]=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});throw Error('lost');};
 await assert.rejects(submitSwipeDislike(cache,'A',item,'gesture'));const first=readPendingDislike(cache,'A');assert.ok(first);assert.equal(calls.length,1);assert.ok(!JSON.stringify(first).includes('Body'));
 await assert.rejects(submitSwipeApproval(cache,'A',item,approval));assert.equal(calls.length,1);
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({...item,status:'ARCHIVED'});};
 const outcome=await retrySwipeDislike(cache,'A');assert.equal(outcome.status,'confirmed');assert.deepEqual(calls[1],calls[0]);assert.equal(readPendingDislike(cache,'A'),null);
});
test('DISLIKE stale success/410 and replacement UUID cannot clear pending; unknown remains',async()=>{
 const {submitSwipeDislike,retrySwipeDislike,readPendingDislike,writePendingDislike}=await helpers();
 for(const scenario of ['stale-success','stale-410','replacement','terminal','unknown']){
  const cache=storage();globalThis.fetch=async()=>{throw Error('lost');};await assert.rejects(submitSwipeDislike(cache,'A',item,'button'));const first=readPendingDislike(cache,'A')!;
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  globalThis.fetch=async()=>{await gate;return scenario==='stale-success'?Response.json(item):Response.json({code:scenario==='unknown'?'OTHER':'DECISION_RESULT_DELETED'},{status:410});};
  const pending=retrySwipeDislike(cache,'A',()=>!scenario.startsWith('stale')).catch(e=>e);
  const fresh={...first,key:crypto.randomUUID()};if(scenario==='replacement')writePendingDislike(cache,'A',fresh);release();const result=await pending;
  if(scenario==='terminal'){assert.equal(result.status,'terminal');assert.equal(readPendingDislike(cache,'A'),null);}else assert.deepEqual(readPendingDislike(cache,'A'),scenario==='replacement'?fresh:first);
 }
});
test('DISLIKE storage failure sends zero and existing LIKE prevents new request',async()=>{
 const {submitSwipeDislike}=await helpers();let calls=0;globalThis.fetch=async()=>{calls++;throw Error('lost');};
 await assert.rejects(submitSwipeDislike({...storage(),setItem:()=>{throw Error('full');}},'A',item,'button'));assert.equal(calls,0);
 const cache=storage();await assert.rejects(submitSwipeApproval(cache,'A',item,approval));await assert.rejects(submitSwipeDislike(cache,'A',item,'button'));assert.equal(calls,1);
});
test('manual export never downloads after owner changes during response JSON',async()=>{
 const {downloadSwipeFeedback}=await helpers();let current=true,downloads=0;
 globalThis.fetch=async()=>({ok:true,json:async()=>{current=false;return {version:1,aggregate:{likes:0,dislikes:0,total:0,likeRatio:null},current:[],receipts:[]};}} as Response);
 await downloadSwipeFeedback(()=>current,()=>{downloads++;});assert.equal(downloads,0);
});

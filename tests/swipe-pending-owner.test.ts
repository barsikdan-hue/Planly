import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {submitSwipeApproval,retrySwipeApproval} from '../lib/client/swipe-planner.ts';
import {readPendingCreation,writePendingCreation} from '../lib/client/pending-creation.ts';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function storage(){const map=new Map<string,string>();return{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}};}
const item={id:'library',title:'Title',text:'Body',status:'READY' as const,mediaIds:[],sourcePostId:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
const approval={mode:'draft' as const,providers:[],scheduledAt:null};
for(const result of ['success','rejection'] as const) test(`late ${result} after A B A preserves newer same-owner request`,async()=>{
 const cache=storage();let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});let current=true;
 globalThis.fetch=async()=>{await gate;return result==='success'?Response.json({id:'old-ack'}):Response.json({error:'stale',code:'LIBRARY_SOURCE_STALE'},{status:409});};
 const old=submitSwipeApproval(cache,'A',item,approval,()=>current);const outcome=old.catch(error=>error);
 const initial=readPendingCreation(cache,'A')!;
 const fresh={...initial,key:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 writePendingCreation(cache,'A',fresh);current=false;finish();await outcome;
 assert.deepEqual(readPendingCreation(cache,'A'),fresh);
});
test('matching UUID guard prevents acknowledgement replacing new envelope even without callback',async()=>{
 const cache=storage();let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
 globalThis.fetch=async()=>{await gate;return Response.json({id:'old-ack'});};
 const old=submitSwipeApproval(cache,'A',item,approval);const initial=readPendingCreation(cache,'A')!;
 const fresh={...initial,key:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};writePendingCreation(cache,'A',fresh);finish();await old;
 assert.deepEqual(readPendingCreation(cache,'A'),fresh);
});
test('generation invalidation preserves original pending success and typed rejection on explicit retry',async()=>{
 for(const result of ['success','rejection']){
  const cache=storage();globalThis.fetch=async()=>{throw Error('lost');};await assert.rejects(submitSwipeApproval(cache,'A',item,approval));
  const initial=readPendingCreation(cache,'A');globalThis.fetch=async()=>result==='success'?Response.json({id:'old-ack'}):Response.json({error:'stale',code:'LIBRARY_SOURCE_STALE'},{status:409});
  await retrySwipeApproval(cache,'A',()=>false).catch(()=>undefined);assert.deepEqual(readPendingCreation(cache,'A'),initial);
 }
});

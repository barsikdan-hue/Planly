import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const path=new URL('../lib/client/shared-feed-recovery.ts',import.meta.url);
const owner='user-a', other='user-b';
const input={operationId:'00000000-0000-4000-8000-000000000001',shareId:'00000000-0000-4000-8000-000000000002',sourceRevision:'2026-10-19T10:00:00.000Z',decision:'LIKE' as const,approval:{providers:['telegram' as const],scheduledAt:'2030-10-20T10:00:00.000Z',inputMethod:'button' as const}};
const receipt={operationId:input.operationId,shareId:input.shareId,sourceRevision:input.sourceRevision,decision:'LIKE',personalItemId:'private-a',postId:'post-a',scheduledAt:input.approval.scheduledAt};
class Storage {values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}
async function api(){assert.ok(existsSync(path),'shared-feed durable recovery implementation exists');return import(path.href);}

test('lost reply preserves exact intent; reload replays same key and confirms one receipt',async()=>{
 const m=await api(),s=new Storage();const sent:string[]=[];
 await assert.rejects(m.submitSharedDecision(s,owner,input,()=>true,async(body:unknown)=>{sent.push(JSON.stringify(body));assert.equal(m.readSharedJournal(s,owner).pending.length,1);throw Error('lost reply');}));
 const pending=m.readSharedJournal(s,owner).pending[0];assert.deepEqual(pending.input,input);assert.equal(m.readSharedJournal(s,other).pending.length,0);
 const result=await m.retrySharedDecision(s,owner,input.operationId,()=>true,async(body:unknown)=>{sent.push(JSON.stringify(body));return new Response(JSON.stringify({receipt,replayed:true}));});
 assert.equal(result.status,'confirmed');assert.deepEqual(sent,[JSON.stringify(input),JSON.stringify(input)]);assert.equal(m.readSharedJournal(s,owner).pending.length,0);assert.equal(m.readSharedJournal(s,owner).history.length,1);
});
test('pending blocks fresh choice; corrupt journal and unwritable storage fail before network',async()=>{
 const m=await api(),s=new Storage();let calls=0;const send=async()=>{calls++;throw Error('network');};
 await assert.rejects(m.submitSharedDecision(s,owner,input,()=>true,send));
 await assert.rejects(m.submitSharedDecision(s,owner,{...input,operationId:'00000000-0000-4000-8000-000000000003'},()=>true,send));assert.equal(calls,1);
 const broken=new Storage();broken.setItem([...s.values.keys()][0],'{broken');assert.throws(()=>m.readSharedJournal(broken,owner));
 const denied=new Storage();denied.setItem=()=>{throw Error('quota');};await assert.rejects(m.submitSharedDecision(denied,owner,input,()=>true,send));assert.equal(calls,1);
});
test('owner switch after request keeps pending and does not announce success',async()=>{
 const m=await api(),s=new Storage();let current=true;
 const result=await m.submitSharedDecision(s,owner,input,()=>current,async()=>{current=false;return new Response(JSON.stringify({receipt,replayed:false}));});
 assert.equal(result.status,'stale');assert.equal(m.readSharedJournal(s,owner).pending.length,1);assert.equal(m.readSharedJournal(s,other).pending.length,0);
});
test('terminal receipt remains history; unrelated future operation may proceed',async()=>{
 const m=await api(),s=new Storage();const result=await m.submitSharedDecision(s,owner,input,()=>true,async()=>new Response(JSON.stringify({code:'DECISION_RESULT_DELETED'}),{status:410}));
 assert.equal(result.status,'terminal');assert.equal(m.readSharedJournal(s,owner).history[0].state,'terminal');
 const dislike={...input,operationId:'00000000-0000-4000-8000-000000000003',shareId:'00000000-0000-4000-8000-000000000004',decision:'DISLIKE' as const};delete (dislike as {approval?:unknown}).approval;
 const saved=await m.submitSharedDecision(s,owner,dislike,()=>true,async()=>new Response(JSON.stringify({receipt:{...dislike,personalItemId:null,postId:null,scheduledAt:null},replayed:false})));
 assert.equal(saved.status,'confirmed');assert.equal(m.readSharedJournal(s,owner).history.length,2);
});
test('malformed or mismatching success cannot clear pending; definite stale rejection is retained',async()=>{
 const m=await api(),s=new Storage();await assert.rejects(m.submitSharedDecision(s,owner,input,()=>true,async()=>new Response(JSON.stringify({receipt:{...receipt,shareId:'00000000-0000-4000-8000-000000000005'},replayed:false}))));
 assert.equal(m.readSharedJournal(s,owner).pending.length,1);
 await assert.rejects(m.retrySharedDecision(s,owner,input.operationId,()=>true,async()=>new Response(JSON.stringify({code:'SHARED_FEED_SOURCE_STALE'}),{status:409})));
 assert.equal(m.readSharedJournal(s,owner).pending.length,0);assert.equal(m.readSharedJournal(s,owner).history[0].state,'refused');
});
test('access loss and unknown conflict keep exact intent recoverable',async()=>{
 const m=await api(),s=new Storage();
 await assert.rejects(m.submitSharedDecision(s,owner,input,()=>true,async()=>new Response('{}',{status:403})));
 assert.equal(m.readSharedJournal(s,owner).pending.length,1);
 await assert.rejects(m.retrySharedDecision(s,owner,input.operationId,()=>true,async()=>new Response(JSON.stringify({code:'UNEXPECTED_CONFLICT'}),{status:409})));
 assert.equal(m.readSharedJournal(s,owner).pending.length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {PlanlyApiError} from '../lib/client/planly-api.ts';
import {libraryBatchRequestHash} from '../lib/server/library-batch-hash.ts';
import type {LibraryBatchCommitResult,LibraryBatchIntent,LibraryBatchPreview} from '../lib/contracts/library-batch.ts';
const recovery=await import('../lib/library-batch-recovery.ts').catch(()=>({})) as typeof import('../lib/library-batch-recovery.ts');
const operationId='11111111-1111-4111-8111-111111111111',stamp='2030-01-01T00:00:00.000Z';
export function fixture(){
 const intent:LibraryBatchIntent={contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:{startDate:'2030-01-02',endDate:'2030-01-03',weekdays:[1,2,3,4,5,6,7],times:['10:00']},rows:[{sourceId:'source-a',sourceRevision:stamp,contentHash:'a'.repeat(64),targets:[{accountId:'tg',provider:'TELEGRAM',destinationId:'-123',scheduledAt:'2030-01-02T07:00:00.000Z'}]}]};
 const preview:LibraryBatchPreview={complete:true,descriptor:{intent,requestHash:libraryBatchRequestHash(intent),snapshotFingerprint:'b'.repeat(64),previewProof:'synthetic-proof'},rows:[{item:{id:'source-a',title:'Title',text:'Full private content',mediaIds:[],status:'READY',sourcePostId:null,createdAt:stamp,updatedAt:stamp},accounts:[{id:'tg',provider:'telegram',providerAccountId:'-123',displayName:'Private channel',enabled:true,connectionStatus:'CONNECTED',connection:{mode:'verified-user',ready:true,reason:null,state:'enabled',accountHint:'channel',bindingRevision:1,checkedAt:stamp,actions:[]}}],scheduledAt:intent.rows[0].targets[0].scheduledAt,issue:null}],media:[]};
 const result:LibraryBatchCommitResult={replayed:false,receipt:{contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',operationId,requestHash:preview.descriptor!.requestHash,acceptedSnapshotFingerprint:'b'.repeat(64),confirmedAt:stamp,rows:intent.rows.map(row=>({...row,postId:'post-a',targets:row.targets.map(t=>({...t,targetId:'target-a',publicationId:'publication-a'}))}))}};
 return {intent,preview,result,input:{sourceIds:['source-a'],accountIds:['tg'],settings:intent.settings}};
}
function storage(){const data=new Map<string,string>();return {data,get length(){return data.size;},key:(index:number)=>[...data.keys()][index]??null,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
test('complete preview binds exact ordered selection, account destination and time; malformed/incomplete cannot confirm',async()=>{
 assert.equal(typeof recovery.validateLibraryBatchPreview,'function');const {preview,input}=fixture();assert.equal((await recovery.validateLibraryBatchPreview(preview,input)).descriptor!.requestHash,preview.descriptor!.requestHash);
 for(const mutate of [(v:typeof preview)=>{Object.assign(v,{complete:false});},(v:typeof preview)=>{v.rows[0].scheduledAt='2030-01-02T08:00:00.000Z';},(v:typeof preview)=>{v.rows[0].accounts[0].providerAccountId='-999';},(v:typeof preview)=>{v.descriptor!.requestHash='c'.repeat(64);},(v:typeof preview)=>{v.rows[0].item.mediaIds=['missing'];}]){const changed=structuredClone(preview);mutate(changed);await assert.rejects(()=>recovery.validateLibraryBatchPreview(changed,input));}
 await assert.rejects(()=>recovery.validateLibraryBatchPreview(preview,{...input,sourceIds:['other']}));
});
test('persist exact frozen key/proof before send; lost reply and reload retain same original intent',async()=>{
 assert.equal(typeof recovery.submitLibraryBatch,'function');const s=storage(),{preview}=fixture();const p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);let calls=0;
 await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async input=>{calls++;assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending[0]?.input,input);throw new Error('response lost');},()=>true));
 assert.equal(calls,1);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,[p]);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-b').pending,[]);assert.equal(recovery.readPendingLibraryBatch(s,'owner-b').blocked,false);
 const loaded=recovery.readPendingLibraryBatch(s,'owner-a').pending[0]!;assert.equal(loaded.input.operationId,operationId);assert.equal(loaded.input.previewProof,'synthetic-proof');
});
test('strict matching receipt clears only its own pending; mismatched mapping, hash, operation and stale owner retain recovery',async()=>{
 assert.equal(typeof recovery.submitLibraryBatch,'function');const {preview,result}=fixture();for(const mutation of [(r:typeof result)=>{r.receipt.rows[0].sourceId='foreign';},(r:typeof result)=>{r.receipt.operationId='22222222-2222-4222-8222-222222222222';},(r:typeof result)=>{r.receipt.requestHash='f'.repeat(64);},(r:typeof result)=>{r.receipt.rows[0].targets[0].scheduledAt='2030-01-02T09:00:00.000Z';}]){const s=storage(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);const bad=structuredClone(result);mutation(bad);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>bad,()=>true));assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,true);}
 const s=storage(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);let active=true;await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{active=false;return result;},()=>active));assert.ok(recovery.readPendingLibraryBatch(s,'owner-a').pending.length);
 active=true;await recovery.submitLibraryBatch(s,p,async()=>result,()=>active);assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,false);
});
test('unknown version, malformed schema or conflicting pending fail closed without overwriting',async()=>{
 assert.equal(typeof recovery.makePendingLibraryBatch,'function');const s=storage(),{preview}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{throw new Error('loss');},()=>true));const key=[...s.data.keys()][0];s.setItem(key,'{"version":9}');assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a'),{pending:[],blocked:true});let sent=0;await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{sent++;return fixture().result;},()=>true));assert.equal(sent,0);assert.equal(s.getItem(key),'{"version":9}');
});
test('404/503 and conflict never prove rollback; terminal deletion prevents resurrection across reload',async()=>{
 const s=storage(),{preview}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{throw Error('loss');},()=>true));
 for(const [status,code] of [[404,'BATCH_RESULT_NOT_FOUND'],[503,'BATCH_RESULT_UNCERTAIN'],[409,'BATCH_OPERATION_CONFLICT']] as const){assert.equal(recovery.resolveLibraryBatchError(s,p,new PlanlyApiError('Unknown',status,{code,commitApplied:false}),()=>true),'uncertain');assert.ok(recovery.readPendingLibraryBatch(s,'owner-a').pending.length);}
 assert.equal(recovery.resolveLibraryBatchError(s,p,new PlanlyApiError('Deleted',410,{code:'BATCH_RESULT_DELETED',result:{operationId,postIds:['post-a']}}),()=>true),'deleted');
 const historical=recovery.readPendingLibraryBatch(s,'owner-a').pending[0]!;assert.deepEqual(historical.terminal,{operationId,postIds:['post-a']});let sends=0;await assert.rejects(()=>recovery.submitLibraryBatch(s,historical,async()=>{sends++;return fixture().result;},()=>true));assert.equal(sends,0);
});
test('only the exact dispatched rollback resolves its attempt; stale owner or mismatched status retain recovery',async()=>{
 const s=storage(),{preview}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!),error=new PlanlyApiError('Stale',409,{code:'BATCH_PREVIEW_STALE',commitApplied:false});let submission:unknown;
 try{await recovery.submitLibraryBatch(s,p,async()=>{throw error;},()=>true);}catch(cause){submission=cause;}
 assert.equal(recovery.resolveLibraryBatchError(s,p,submission,()=>false),'uncertain');assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').pending.length,1);
 assert.equal(recovery.resolveLibraryBatchError(s,p,error,()=>true),'uncertain');assert.equal(recovery.resolveLibraryBatchError(s,p,submission,()=>true),'no-commit');assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,false);
 try{await recovery.submitLibraryBatch(s,p,async()=>{throw new PlanlyApiError('Invalid status',404,{code:'BATCH_PREVIEW_STALE',commitApplied:false});},()=>true);}catch(cause){submission=cause;}
 assert.equal(recovery.resolveLibraryBatchError(s,p,submission,()=>true),'uncertain');assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').pending.length,1);
});
test('actual server preview account projection needs no optional bootstrap connection metadata',async()=>{
 const {preview,input}=fixture();delete preview.rows[0].accounts[0].connection;assert.equal((await recovery.validateLibraryBatchPreview(preview,input)).complete,true);
});
test('historical replay binds C and operation independently of fresh preview S; fresh result still binds S',async()=>{
 const {preview,result}=fixture();const changed=structuredClone(result);changed.receipt.acceptedSnapshotFingerprint='c'.repeat(64);
 const fresh=storage(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(fresh,p,async()=>changed,()=>true));assert.ok(recovery.readPendingLibraryBatch(fresh,'owner-a').pending.length);
 changed.replayed=true;await recovery.submitLibraryBatch(fresh,p,async()=>changed,()=>true);assert.equal(recovery.readPendingLibraryBatch(fresh,'owner-a').blocked,false);
});
test('known saved receipt survives cleanup failure; changed pending and stale owner remain fenced',async()=>{
 const base=storage(),s=Object.assign(base,{removeItem:()=>{throw Error('storage unavailable');}}), {preview,result}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);
 assert.deepEqual(await recovery.submitLibraryBatch(s,p,async()=>result,()=>true),result);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,[p]);
 const other={...p,input:{...p.input,previewProof:'changed-proof'}};
 await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{const key=[...base.data.keys()][0],entry=JSON.parse(base.getItem(key)!);base.setItem(key,JSON.stringify(entry.version===2?{...entry,pending:other}:other));return result;},()=>true));assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a'),{pending:[],blocked:true});assert.equal(s.length,2);assert.equal([...s.data.values()].some(raw=>JSON.parse(raw).pending?.input.previewProof==='changed-proof'),true);
 let active=true;const staleStorage=storage();await assert.rejects(()=>recovery.submitLibraryBatch(staleStorage,p,async()=>{active=false;return result;},()=>active));assert.deepEqual(recovery.readPendingLibraryBatch(staleStorage,'owner-a').pending,[p]);
});
test('two actual helper Workers retain both dispatched intents after get-before-set race and response loss',{timeout:15000},async()=>{
 const s=storage(),{preview,result}=fixture(),a=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!),b=recovery.makePendingLibraryBatch('owner-a','22222222-2222-4222-8222-222222222222',preview.descriptor!);
 const writes:{worker:Worker;buffer:SharedArrayBuffer;key:string;value:string}[]=[],dispatched:string[]=[],workers:Worker[]=[];let releasedSecond=false;
 function respond(buffer:SharedArrayBuffer,value:unknown){const signal=new Int32Array(buffer,0,2),bytes=new TextEncoder().encode(JSON.stringify({value:value??null}));new Uint8Array(buffer,8).set(bytes);Atomics.store(signal,1,bytes.length);Atomics.store(signal,0,1);Atomics.notify(signal,0);}
 function applyWrite(entry:typeof writes[number]){s.setItem(entry.key,entry.value);respond(entry.buffer,null);}
 try{await Promise.all([a,b].map(pending=>new Promise<void>((resolve,reject)=>{
  const buffer=new SharedArrayBuffer(131080),worker=new Worker(new URL('./helpers/library-batch-recovery-worker.mjs',import.meta.url),{workerData:{buffer,pending}});workers.push(worker);worker.on('error',reject);
  worker.on('message',message=>{
   if(message.type==='storage'){
    if(message.action==='set'){writes.push({worker,buffer,key:message.key,value:message.value});if(writes.length===2)applyWrite(writes[0]);return;}
    const value=message.action==='length'?s.length:message.action==='key'?s.key(message.key):message.action==='get'?s.getItem(message.key):null;if(message.action==='remove')s.removeItem(message.key);respond(buffer,value);
   }
   if(message.type==='dispatched'){dispatched.push(message.operationId);if(!releasedSecond){releasedSecond=true;applyWrite(writes[1]);}}
   if(message.type==='done'){if(message.unexpectedSuccess)reject(Error('response loss should reject'));else resolve();}
  });
 })));assert.equal(dispatched.length,2);assert.equal(writes.length,2);
 assert.equal([...s.data.values()].map(raw=>JSON.parse(raw)).filter(entry=>[a.input.operationId,b.input.operationId].includes((entry.pending??entry).input.operationId)).length,2,'Both dispatched original operation records must remain durable');
 const reloaded=recovery.readPendingLibraryBatch(s,'owner-a');assert.equal(reloaded.pending.length,2,'Both original keys must survive a fresh reload');assert.deepEqual(reloaded.pending.map(p=>p.input.operationId).sort(),[a.input.operationId,b.input.operationId].sort());
 await recovery.acceptLibraryBatchResult(s,a,result,()=>true);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,[b]);
 const resultB=structuredClone(result);resultB.receipt.operationId=b.input.operationId;await recovery.acceptLibraryBatchResult(s,b,resultB,()=>true);assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,false);
 }finally{await Promise.all(workers.map(worker=>worker.terminate()));}
});
test('legacy owner record stays recoverable alongside operation records; exact acknowledgement preserves other owners',async()=>{
 const s=storage(),{preview,result}=fixture(),a=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!),b=recovery.makePendingLibraryBatch('owner-a','22222222-2222-4222-8222-222222222222',preview.descriptor!);
 const legacy=recovery.libraryBatchRecoveryKey('owner-a'),keyB=recovery.libraryBatchRecoveryKey('owner-a',b.input.operationId),foreign=recovery.libraryBatchRecoveryKey('owner-b','33333333-3333-4333-8333-333333333333');s.setItem(legacy,JSON.stringify(a));s.setItem(keyB,JSON.stringify(b));s.setItem(foreign,'corrupt foreign record');assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,[a,b]);
 await recovery.acceptLibraryBatchResult(s,a,result,()=>true);assert.equal(s.getItem(legacy),null);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,[b]);assert.equal(s.getItem(foreign),'corrupt foreign record');
 assert.equal(recovery.resolveLibraryBatchError(s,b,new PlanlyApiError('Deleted',410,{code:'BATCH_RESULT_DELETED',result:{operationId:b.input.operationId,postIds:['post-a']}}),()=>true),'deleted');assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').pending[0].terminal?.operationId,b.input.operationId);assert.equal(s.getItem(foreign),'corrupt foreign record');
});
test('unknown or corrupt operation keys block fresh work without hiding valid owned recovery or erasing legacy records',async()=>{
 const s=storage(),{preview,result}=fixture(),a=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!),b=recovery.makePendingLibraryBatch('owner-a','22222222-2222-4222-8222-222222222222',preview.descriptor!);const keyA=recovery.libraryBatchRecoveryKey('owner-a',operationId),legacy=recovery.libraryBatchRecoveryKey('owner-a'),unknown=legacy+':unknown-version';s.setItem(keyA,JSON.stringify(a));s.setItem(legacy,'malformed legacy');s.setItem(unknown,'{"version":9}');assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a'),{pending:[a],blocked:true});let sends=0;await assert.rejects(()=>recovery.submitLibraryBatch(s,b,async()=>{sends++;return result;},()=>true));assert.equal(sends,0);
 await recovery.acceptLibraryBatchResult(s,a,result,()=>true);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a'),{pending:[],blocked:true});assert.equal(s.getItem(legacy),'malformed legacy');assert.equal(s.getItem(unknown),'{"version":9}');
});
test('same operation duplicated in a legacy key is acknowledged exactly; conflicting duplicate remains blocked',async()=>{
 const s=storage(),{preview,result}=fixture(),a=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!),legacy=recovery.libraryBatchRecoveryKey('owner-a'),key=recovery.libraryBatchRecoveryKey('owner-a',operationId);s.setItem(legacy,JSON.stringify(a));s.setItem(key,JSON.stringify(a));assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,[a]);await recovery.acceptLibraryBatchResult(s,a,result,()=>true);assert.equal(s.length,0);
 s.setItem(legacy,JSON.stringify(a));s.setItem(key,JSON.stringify({...a,input:{...a.input,previewProof:'conflicting-proof'}}));assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a'),{pending:[],blocked:true});await assert.rejects(()=>recovery.acceptLibraryBatchResult(s,a,result,()=>true));assert.equal(s.length,2);
});

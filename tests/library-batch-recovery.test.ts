import test from 'node:test';
import assert from 'node:assert/strict';
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
function storage(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
test('complete preview binds exact ordered selection, account destination and time; malformed/incomplete cannot confirm',async()=>{
 assert.equal(typeof recovery.validateLibraryBatchPreview,'function');const {preview,input}=fixture();assert.equal((await recovery.validateLibraryBatchPreview(preview,input)).descriptor!.requestHash,preview.descriptor!.requestHash);
 for(const mutate of [(v:typeof preview)=>{Object.assign(v,{complete:false});},(v:typeof preview)=>{v.rows[0].scheduledAt='2030-01-02T08:00:00.000Z';},(v:typeof preview)=>{v.rows[0].accounts[0].providerAccountId='-999';},(v:typeof preview)=>{v.descriptor!.requestHash='c'.repeat(64);},(v:typeof preview)=>{v.rows[0].item.mediaIds=['missing'];}]){const changed=structuredClone(preview);mutate(changed);await assert.rejects(()=>recovery.validateLibraryBatchPreview(changed,input));}
 await assert.rejects(()=>recovery.validateLibraryBatchPreview(preview,{...input,sourceIds:['other']}));
});
test('persist exact frozen key/proof before send; lost reply and reload retain same original intent',async()=>{
 assert.equal(typeof recovery.submitLibraryBatch,'function');const s=storage(),{preview}=fixture();const p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);let calls=0;
 await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async input=>{calls++;assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending?.input,input);throw new Error('response lost');},()=>true));
 assert.equal(calls,1);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,p);assert.equal(recovery.readPendingLibraryBatch(s,'owner-b').pending,null);assert.equal(recovery.readPendingLibraryBatch(s,'owner-b').blocked,false);
 const loaded=recovery.readPendingLibraryBatch(s,'owner-a').pending!;assert.equal(loaded.input.operationId,operationId);assert.equal(loaded.input.previewProof,'synthetic-proof');
});
test('strict matching receipt clears only its own pending; mismatched mapping, hash, operation and stale owner retain recovery',async()=>{
 assert.equal(typeof recovery.submitLibraryBatch,'function');const {preview,result}=fixture();for(const mutation of [(r:typeof result)=>{r.receipt.rows[0].sourceId='foreign';},(r:typeof result)=>{r.receipt.operationId='22222222-2222-4222-8222-222222222222';},(r:typeof result)=>{r.receipt.requestHash='f'.repeat(64);},(r:typeof result)=>{r.receipt.rows[0].targets[0].scheduledAt='2030-01-02T09:00:00.000Z';}]){const s=storage(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);const bad=structuredClone(result);mutation(bad);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>bad,()=>true));assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,true);}
 const s=storage(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);let active=true;await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{active=false;return result;},()=>active));assert.ok(recovery.readPendingLibraryBatch(s,'owner-a').pending);
 active=true;await recovery.submitLibraryBatch(s,p,async()=>result,()=>active);assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,false);
});
test('unknown version, malformed schema or conflicting pending fail closed without overwriting',async()=>{
 assert.equal(typeof recovery.makePendingLibraryBatch,'function');const s=storage(),{preview}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{throw new Error('loss');},()=>true));const key=[...s.data.keys()][0];s.setItem(key,'{"version":9}');assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a'),{pending:null,blocked:true});let sent=0;await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{sent++;return fixture().result;},()=>true));assert.equal(sent,0);assert.equal(s.getItem(key),'{"version":9}');
});
test('404/503 and conflict never prove rollback; terminal deletion prevents resurrection across reload',async()=>{
 const s=storage(),{preview}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{throw Error('loss');},()=>true));
 for(const [status,code] of [[404,'BATCH_RESULT_NOT_FOUND'],[503,'BATCH_RESULT_UNCERTAIN'],[409,'BATCH_OPERATION_CONFLICT']] as const){assert.equal(recovery.resolveLibraryBatchError(s,p,status,{code,commitApplied:false},()=>true,false),'uncertain');assert.ok(recovery.readPendingLibraryBatch(s,'owner-a').pending);}
 assert.equal(recovery.resolveLibraryBatchError(s,p,410,{code:'BATCH_RESULT_DELETED',result:{operationId,postIds:['post-a']}},()=>true,false),'deleted');
 const historical=recovery.readPendingLibraryBatch(s,'owner-a').pending!;assert.deepEqual(historical.terminal,{operationId,postIds:['post-a']});let sends=0;await assert.rejects(()=>recovery.submitLibraryBatch(s,historical,async()=>{sends++;return fixture().result;},()=>true));assert.equal(sends,0);
});
test('only typed known no-commit from commit response clears recovery; late owner callback cannot clear',async()=>{
 const s=storage(),{preview}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{throw Error('loss');},()=>true));
 const error={code:'BATCH_PREVIEW_STALE',commitApplied:false};assert.equal(recovery.resolveLibraryBatchError(s,p,409,error,()=>false,true),'uncertain');assert.ok(recovery.readPendingLibraryBatch(s,'owner-a').pending);
 assert.equal(recovery.resolveLibraryBatchError(s,p,404,error,()=>true,true),'uncertain');
 assert.equal(recovery.resolveLibraryBatchError(s,p,409,error,()=>true,false),'uncertain');assert.equal(recovery.resolveLibraryBatchError(s,p,409,error,()=>true,true),'no-commit');assert.equal(recovery.readPendingLibraryBatch(s,'owner-a').blocked,false);
});
test('actual server preview account projection needs no optional bootstrap connection metadata',async()=>{
 const {preview,input}=fixture();delete preview.rows[0].accounts[0].connection;assert.equal((await recovery.validateLibraryBatchPreview(preview,input)).complete,true);
});
test('historical replay binds C and operation independently of fresh preview S; fresh result still binds S',async()=>{
 const {preview,result}=fixture();const changed=structuredClone(result);changed.receipt.acceptedSnapshotFingerprint='c'.repeat(64);
 const fresh=storage(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);await assert.rejects(()=>recovery.submitLibraryBatch(fresh,p,async()=>changed,()=>true));assert.ok(recovery.readPendingLibraryBatch(fresh,'owner-a').pending);
 changed.replayed=true;await recovery.submitLibraryBatch(fresh,p,async()=>changed,()=>true);assert.equal(recovery.readPendingLibraryBatch(fresh,'owner-a').blocked,false);
});
test('known saved receipt survives cleanup failure; changed pending and stale owner remain fenced',async()=>{
 const base=storage(),s={...base,removeItem:()=>{throw Error('storage unavailable');}}, {preview,result}=fixture(),p=recovery.makePendingLibraryBatch('owner-a',operationId,preview.descriptor!);
 assert.deepEqual(await recovery.submitLibraryBatch(s,p,async()=>result,()=>true),result);assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,p);
 const other={...p,input:{...p.input,operationId:'22222222-2222-4222-8222-222222222222'}};
 await assert.rejects(()=>recovery.submitLibraryBatch(s,p,async()=>{base.setItem(recovery.libraryBatchRecoveryKey('owner-a'),JSON.stringify(other));return result;},()=>true));assert.deepEqual(recovery.readPendingLibraryBatch(s,'owner-a').pending,other);
 let active=true;const staleStorage=storage();await assert.rejects(()=>recovery.submitLibraryBatch(staleStorage,p,async()=>{active=false;return result;},()=>active));assert.deepEqual(recovery.readPendingLibraryBatch(staleStorage,'owner-a').pending,p);
});

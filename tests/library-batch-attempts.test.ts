import test from 'node:test';
import assert from 'node:assert/strict';
import {LibraryBatchSubmissionError,makePendingLibraryBatch,submitLibraryBatch,resolveLibraryBatchError,readPendingLibraryBatch,acceptLibraryBatchResult,libraryBatchRecoveryKey} from '../lib/library-batch-recovery.ts';
import {PlanlyApiError} from '../lib/client/planly-api.ts';
import {libraryBatchRequestHash} from '../lib/server/library-batch-hash.ts';
import type {LibraryBatchIntent,LibraryBatchCommitResult} from '../lib/contracts/library-batch.ts';
const operationId='11111111-1111-4111-8111-111111111111',stamp='2030-01-01T00:00:00.000Z';
function fixture(){
 const intent:LibraryBatchIntent={contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:{startDate:'2030-01-02',endDate:'2030-01-03',weekdays:[1,2,3,4,5,6,7],times:['10:00']},rows:[{sourceId:'source-a',sourceRevision:stamp,contentHash:'a'.repeat(64),targets:[{accountId:'tg',provider:'TELEGRAM',destinationId:'-123',scheduledAt:'2030-01-02T07:00:00.000Z'}]}]};
 const pending=makePendingLibraryBatch('owner-a',operationId,{intent,requestHash:libraryBatchRequestHash(intent),snapshotFingerprint:'b'.repeat(64),previewProof:'original-proof'});
 const result:LibraryBatchCommitResult={replayed:false,receipt:{contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',operationId,requestHash:pending.requestHash,acceptedSnapshotFingerprint:pending.input.snapshotFingerprint,confirmedAt:stamp,rows:intent.rows.map(row=>({...row,postId:'post-a',targets:row.targets.map(t=>({...t,targetId:'target-a',publicationId:'publication-a'}))}))}};return {pending,result};
}
function storage(){const data=new Map<string,string>();return {data,get length(){return data.size;},key:(index:number)=>[...data.keys()][index]??null,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
const rollback=()=>new PlanlyApiError('Slot conflict',409,{code:'BATCH_SLOT_CONFLICT',commitApplied:false});
const capture=async(action:Promise<unknown>)=>{try{await action;}catch(error){return error;}assert.fail('Expected failed/lost response');};
const resolveFailure=(s:ReturnType<typeof storage>,pending:ReturnType<typeof fixture>['pending'],error:unknown)=>resolveLibraryBatchError(s,pending,error,()=>true);
for(const order of ['rollback-first','loss-first'])test(`same operation delayed rollback cannot erase later committed lost attempt: ${order}`,async()=>{
 const s=storage(),{pending,result}=fixture(),aSent=deferred(),bSent=deferred(),deliverA=deferred(),deliverB=deferred();const inputs:unknown[]=[];
 const a=capture(submitLibraryBatch(s,pending,async input=>{assert.equal(s.length,1);inputs.push(input);aSent.resolve();await deliverA.promise;throw rollback();},()=>true));await aSent.promise;
 const b=capture(submitLibraryBatch(s,pending,async input=>{assert.equal(s.length,2);const attempts=[...s.data.values()].map(raw=>JSON.parse(raw));assert.ok(attempts.every(record=>record.version===2));assert.equal(new Set(attempts.map(record=>record.attemptId)).size,2);inputs.push(input);bSent.resolve();await deliverB.promise;throw Error('COMMIT succeeded; response lost');},()=>true));await bSent.promise;
 if(order==='loss-first'){deliverB.resolve();await b;}deliverA.resolve();const aError=await a;resolveFailure(s,pending,aError);if(order==='rollback-first'){deliverB.resolve();await b;}
 assert.equal(readPendingLibraryBatch(s,'owner-a').pending.length,1,'A rollback must preserve B original operation after reload');assert.deepEqual(inputs,[pending.input,pending.input]);
 await acceptLibraryBatchResult(s,pending,{...result,replayed:true},()=>true);assert.equal(readPendingLibraryBatch(s,'owner-a').blocked,false);
});
test('both independent known rollbacks resolve their own attempts; one failure cannot dispose an uncertain legacy attempt',async()=>{
 const s=storage(),{pending}=fixture(),hold=deferred(),sent=deferred();const a=capture(submitLibraryBatch(s,pending,async()=>{sent.resolve();await hold.promise;throw rollback();},()=>true));await sent.promise;
 const bError=await capture(submitLibraryBatch(s,pending,async()=>{throw rollback();},()=>true));resolveFailure(s,pending,bError);assert.equal(readPendingLibraryBatch(s,'owner-a').pending.length,1);hold.resolve();resolveFailure(s,pending,await a);assert.equal(readPendingLibraryBatch(s,'owner-a').blocked,false);
 s.setItem(libraryBatchRecoveryKey('owner-a',operationId),JSON.stringify(pending));const legacyError=await capture(submitLibraryBatch(s,pending,async()=>{throw rollback();},()=>true));resolveFailure(s,pending,legacyError);assert.equal(readPendingLibraryBatch(s,'owner-a').pending.length,1,'Legacy unknown provenance cannot be cleared by a later rollback');
});
test('one strict receipt acknowledges identical operation attempts while later stale rollback cannot erase other work',async()=>{
 const s=storage(),{pending,result}=fixture(),hold=deferred(),sent=deferred();const a=capture(submitLibraryBatch(s,pending,async()=>{sent.resolve();await hold.promise;throw rollback();},()=>true));await sent.promise;
 await submitLibraryBatch(s,pending,async()=>result,()=>true);assert.equal(readPendingLibraryBatch(s,'owner-a').blocked,false);
 const other={...pending,input:{...pending.input,operationId:'22222222-2222-4222-8222-222222222222'}};await capture(submitLibraryBatch(s,other,async()=>{throw Error('Unknown other operation');},()=>true));hold.resolve();resolveFailure(s,pending,await a);assert.deepEqual(readPendingLibraryBatch(s,'owner-a').pending,[other]);
});
test('failed attempt persistence never dispatches or manufactures a submission error',async()=>{
 const {pending}=fixture();let sends=0;for(const s of [Object.assign(storage(),{setItem:()=>{throw Error('Storage write failed');}}),Object.assign(storage(),{getItem:()=>null})]){const error=await capture(submitLibraryBatch(s,pending,async()=>{sends++;return {};},()=>true));assert.equal(error instanceof LibraryBatchSubmissionError,false);}assert.equal(sends,0);
});
test('auth, timeout, 5xx and lookup404 retain attempts; changed C cannot reuse the server operation',async()=>{
 const s=storage(),{pending}=fixture();for(const error of [new PlanlyApiError('Expired',401,{code:'BATCH_UNAUTHORIZED'}),new PlanlyApiError('Unavailable',503,{code:'BATCH_RESULT_UNCERTAIN',commitApplied:false}),Error('Timeout')]){const failure=await capture(submitLibraryBatch(s,pending,async()=>{throw error;},()=>true));assert.equal(resolveLibraryBatchError(s,pending,failure,()=>true),'uncertain');}assert.equal(s.length,3);
 assert.equal(resolveLibraryBatchError(s,pending,new PlanlyApiError('Not found',404,{code:'BATCH_RESULT_NOT_FOUND',commitApplied:false}),()=>true),'uncertain');
 const changed=structuredClone(pending);changed.input.intent.rows[0].contentHash='c'.repeat(64);changed.requestHash=libraryBatchRequestHash(changed.input.intent);let sends=0;await assert.rejects(()=>submitLibraryBatch(s,changed,async()=>{sends++;return {};},()=>true));assert.equal(sends,0);assert.equal(s.length,3);
 const rejection=await capture(submitLibraryBatch(s,pending,async()=>{throw rollback();},()=>true));assert.equal(resolveLibraryBatchError(s,pending,rejection,()=>false),'uncertain');assert.equal(s.length,4);assert.equal(resolveLibraryBatchError(s,pending,rejection,()=>true),'uncertain');assert.equal(s.length,3);
});
test('terminal deletion survives late attempt rollbacks and blocks subsequent submission',async()=>{
 const s=storage(),{pending,result}=fixture(),a=await capture(submitLibraryBatch(s,pending,async()=>{throw rollback();},()=>true)),b=await capture(submitLibraryBatch(s,pending,async()=>{throw rollback();},()=>true));assert.equal(s.length,2);
 assert.equal(resolveLibraryBatchError(s,pending,new PlanlyApiError('Deleted',410,{code:'BATCH_RESULT_DELETED',result:{operationId,postIds:['post-a']}}),()=>true),'deleted');assert.equal(resolveLibraryBatchError(s,pending,a,()=>true),'uncertain');assert.equal(resolveLibraryBatchError(s,pending,b,()=>true),'uncertain');assert.equal(readPendingLibraryBatch(s,'owner-a').pending[0].terminal?.operationId,operationId);let sends=0;await assert.rejects(()=>submitLibraryBatch(s,pending,async()=>{sends++;return result;},()=>true));assert.equal(sends,0);assert.equal(s.length,2);
});
test('INVALID422 is not historical rollback proof even with a false projection',async()=>{
 const s=storage(),{pending}=fixture(),error=await capture(submitLibraryBatch(s,pending,async()=>{throw new PlanlyApiError('Invalid',422,{code:'BATCH_INVALID',commitApplied:false});},()=>true));assert.equal(resolveLibraryBatchError(s,pending,error,()=>true),'uncertain');assert.equal(s.length,1);assert.equal(readPendingLibraryBatch(s,'owner-a').pending.length,1);
});

test('known terminal deletion permits an unrelated intent after reload while retaining its tombstone',async()=>{
 const s=storage(),{pending,result}=fixture();
 await capture(submitLibraryBatch(s,pending,async()=>{throw Error('Accepted reply lost');},()=>true));
 assert.equal(resolveLibraryBatchError(s,pending,new PlanlyApiError('Deleted',410,{code:'BATCH_RESULT_DELETED',result:{operationId,postIds:['post-a']}}),()=>true),'deleted');
 const terminalBytes=[...s.data.entries()];
 const foreignKey=libraryBatchRecoveryKey('owner-b','33333333-3333-4333-8333-333333333333');
 s.setItem(foreignKey,'preserve private owner-b recovery');
 const loaded=readPendingLibraryBatch(s,'owner-a');
 assert.equal(loaded.blocked,false,'A resolved terminal result must not block unrelated new work');
 assert.deepEqual(loaded.pending[0].terminal,{operationId,postIds:['post-a']});
 let oldSends=0;
 for(const old of [pending,loaded.pending[0]])await assert.rejects(()=>submitLibraryBatch(s,old,async()=>{oldSends++;return result;},()=>true));
 assert.equal(oldSends,0,'Neither a stale caller nor a reloaded terminal intent may resend');
 const next=structuredClone(pending);
 next.input.operationId='22222222-2222-4222-8222-222222222222';
 next.input.intent.rows[0].sourceId='source-unrelated-ready';
 next.requestHash=libraryBatchRequestHash(next.input.intent);
 const saved=structuredClone(result);
 saved.receipt.operationId=next.input.operationId;saved.receipt.requestHash=next.requestHash;
 saved.receipt.rows[0].sourceId='source-unrelated-ready';saved.receipt.rows[0].postId='post-b';
 saved.receipt.rows[0].targets[0].targetId='target-b';saved.receipt.rows[0].targets[0].publicationId='publication-b';
 let newSends=0;
 await submitLibraryBatch(s,next,async input=>{newSends++;assert.equal(input.intent.rows[0].sourceId,'source-unrelated-ready');return saved;},()=>true);
 assert.equal(newSends,1);
 assert.equal(readPendingLibraryBatch(s,'owner-a').blocked,false);
 assert.equal(readPendingLibraryBatch(s,'owner-a').pending.length,1);
 for(const [key,value] of terminalBytes)assert.equal(s.getItem(key),value,'Terminal history is never blindly removed');
 assert.equal(s.getItem(foreignKey),'preserve private owner-b recovery');
});

for(const kind of ['uncertain','corrupt','conflicting'] as const)test(`terminal history does not bypass ${kind} recovery protection`,async()=>{
 const s=storage(),{pending,result}=fixture();
 await capture(submitLibraryBatch(s,pending,async()=>{throw Error('Accepted reply lost');},()=>true));
 resolveLibraryBatchError(s,pending,new PlanlyApiError('Deleted',410,{code:'BATCH_RESULT_DELETED',result:{operationId,postIds:['post-a']}}),()=>true);
 const next=structuredClone(pending);next.input.operationId='22222222-2222-4222-8222-222222222222';
 next.input.intent.rows[0].sourceId='source-unrelated-ready';next.requestHash=libraryBatchRequestHash(next.input.intent);
 if(kind==='uncertain')s.setItem(libraryBatchRecoveryKey('owner-a',next.input.operationId),JSON.stringify(next));
 if(kind==='corrupt')s.setItem(libraryBatchRecoveryKey('owner-a')+':broken','{"version":9}');
 if(kind==='conflicting'){
  const terminal=readPendingLibraryBatch(s,'owner-a').pending[0];
  s.setItem(libraryBatchRecoveryKey('owner-a',operationId),JSON.stringify({...terminal,terminal:{operationId,postIds:['conflicting-result']}}));
 }
 const before=[...s.data.entries()];assert.equal(readPendingLibraryBatch(s,'owner-a').blocked,true);
 const fresh=structuredClone(next);fresh.input.operationId='44444444-4444-4444-8444-444444444444';
 let sends=0;await assert.rejects(()=>submitLibraryBatch(s,fresh,async()=>{sends++;return result;},()=>true));
 assert.equal(sends,0);assert.deepEqual([...s.data.entries()],before);
});

for(const kind of ['wrong-count','duplicate-results','wrong-hash'] as const)test(`semantically corrupt terminal ${kind} never permits a fresh dispatch`,async()=>{
 const s=storage(),{pending,result}=fixture();
 await capture(submitLibraryBatch(s,pending,async()=>{throw Error('Accepted reply lost');},()=>true));
 resolveLibraryBatchError(s,pending,new PlanlyApiError('Deleted',410,{code:'BATCH_RESULT_DELETED',result:{operationId,postIds:['post-a']}}),()=>true);
 const [key,raw]=[...s.data.entries()][0],record=JSON.parse(raw);
 if(kind==='wrong-count')record.pending.terminal.postIds=['post-a','extra-result'];
 if(kind==='duplicate-results'){
  record.pending.input.intent.rows.push({...structuredClone(record.pending.input.intent.rows[0]),sourceId:'source-b'});
  record.pending.requestHash=libraryBatchRequestHash(record.pending.input.intent);
  record.pending.terminal.postIds=['post-a','post-a'];
 }
 if(kind==='wrong-hash')record.pending.requestHash='f'.repeat(64);
 s.setItem(key,JSON.stringify(record));
 const before=[...s.data.entries()],fresh=structuredClone(pending);
 fresh.input.operationId='22222222-2222-4222-8222-222222222222';
 fresh.input.intent.rows[0].sourceId='source-unrelated-ready';fresh.requestHash=libraryBatchRequestHash(fresh.input.intent);
 let sends=0;await assert.rejects(()=>submitLibraryBatch(s,fresh,async()=>{sends++;return {...result,receipt:{...result.receipt,operationId:fresh.input.operationId,requestHash:fresh.requestHash,rows:result.receipt.rows.map(row=>({...row,sourceId:'source-unrelated-ready'}))}};},()=>true));
 assert.equal(sends,0,'Corrupt terminal history must be rejected before dispatch');
 assert.deepEqual([...s.data.entries()],before,'Corrupt history and unrelated data must be retained');
});

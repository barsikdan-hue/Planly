import {z} from 'zod';
import {libraryBatchCommitInputSchema,libraryBatchHashSchema,libraryBatchReceiptSchema,libraryBatchOperationIdSchema,type LibraryBatchDescriptor,type LibraryBatchPreview,type LibraryBatchPreviewInput,type LibraryBatchCommitResult} from './contracts/library-batch.ts';
import {canonicalLibraryBatchIntent} from './library-batch.ts';
import {PlanlyApiError} from './client/planly-api.ts';

type Storage=Pick<globalThis.Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
const pendingSchema=z.object({version:z.literal(1),ownerId:z.string().min(1),requestHash:libraryBatchHashSchema,input:libraryBatchCommitInputSchema,
 terminal:z.object({operationId:z.string().uuid(),postIds:z.array(z.string().min(1)).min(1).max(20)}).strict().optional()}).strict();
export type PendingLibraryBatch=z.infer<typeof pendingSchema>;
const attemptSchema=z.object({version:z.literal(2),attemptId:libraryBatchOperationIdSchema,pending:pendingSchema}).strict();
export type LibraryBatchAttempt=z.infer<typeof attemptSchema>;
export class LibraryBatchSubmissionError extends Error {
 readonly attempt:LibraryBatchAttempt;readonly originalError:unknown;
 constructor(attempt:LibraryBatchAttempt,error:unknown){super(error instanceof Error?error.message:'Не удалось подтвердить сохранение.');this.name='LibraryBatchSubmissionError';this.attempt=attempt;this.originalError=error;}
}
export type LibraryBatchRecovery={pending:PendingLibraryBatch[];blocked:boolean};
// The owner-only key is retained solely for conservative legacy read/ack compatibility.
export const libraryBatchRecoveryKey=(ownerId:string,operationId?:string,attemptId?:string)=>`planly.library-batch.v1:${encodeURIComponent(ownerId)}${operationId?`:${operationId}`:''}${attemptId?`:attempt:${attemptId}`:''}`;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const stale=()=>new Error('Результат нужно проверить в исходном аккаунте.');
export async function browserLibraryBatchRequestHash(intent:LibraryBatchDescriptor['intent']):Promise<string>{
 const bytes=new TextEncoder().encode('planly.library-batch.intent.v1\n'+JSON.stringify(canonicalLibraryBatchIntent(intent)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
}
export function makePendingLibraryBatch(ownerId:string,operationId:string,descriptor:LibraryBatchDescriptor):PendingLibraryBatch{
 return pendingSchema.parse({version:1,ownerId,requestHash:descriptor.requestHash,input:{operationId,intent:canonicalLibraryBatchIntent(descriptor.intent),snapshotFingerprint:descriptor.snapshotFingerprint,previewProof:descriptor.previewProof}});
}
type Entry={key:string;pending:PendingLibraryBatch;attemptId?:string};
const samePending=(a:PendingLibraryBatch,b:PendingLibraryBatch)=>same({...a,terminal:undefined},{...b,terminal:undefined});
function decodeEntry(key:string,raw:string,ownerId:string):Entry{
 const json=JSON.parse(raw),attempt=json?.version===2?attemptSchema.parse(json):null,pending=attempt?.pending??pendingSchema.parse(json);
 const expected=libraryBatchRecoveryKey(ownerId,pending.input.operationId,attempt?.attemptId),legacy=libraryBatchRecoveryKey(ownerId);
 if(pending.ownerId!==ownerId||(attempt?key!==expected:key!==legacy&&key!==expected)||pending.terminal&&pending.terminal.operationId!==pending.input.operationId)throw Error('Invalid recovery');
  if(pending.terminal&&(pending.terminal.postIds.length!==pending.input.intent.rows.length||new Set(pending.terminal.postIds).size!==pending.terminal.postIds.length))throw Error('Invalid terminal recovery');
 return {key,pending,...(attempt?{attemptId:attempt.attemptId}:{})};
}
function encodedEntry(entry:Entry,pending=entry.pending){return JSON.stringify(entry.attemptId?{version:2,attemptId:entry.attemptId,pending}:pending);}
function readEntries(storage:Storage,ownerId:string){
 const entries:Entry[]=[],legacy=libraryBatchRecoveryKey(ownerId),prefix=legacy+':';let blocked=false;
 try{
  const keys=new Set<string>();if(storage.getItem(legacy)!==null)keys.add(legacy);
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))keys.add(key);}
  for(const key of [...keys].sort()){try{const raw=storage.getItem(key);if(raw!==null)entries.push(decodeEntry(key,raw,ownerId));}catch{blocked=true;}}
 }catch{blocked=true;}
 return {entries,blocked};
}
export function readPendingLibraryBatch(storage:Storage,ownerId:string):LibraryBatchRecovery{
 const {entries,blocked}=readEntries(storage,ownerId),byOperation=new Map<string,PendingLibraryBatch>(),conflicts=new Set<string>();
 for(const {pending} of entries){const id=pending.input.operationId,existing=byOperation.get(id);if(existing&&(!samePending(existing,pending)||existing.terminal&&pending.terminal&&!same(existing.terminal,pending.terminal)))conflicts.add(id);else if(!existing?.terminal)byOperation.set(id,pending);}
 for(const id of conflicts)byOperation.delete(id);
  return {pending:[...byOperation.values()],blocked:blocked||conflicts.size>0||entries.some(entry=>!entry.pending.terminal)};
}
async function validatePending(pending:PendingLibraryBatch){const parsed=pendingSchema.parse(pending);if(await browserLibraryBatchRequestHash(parsed.input.intent)!==parsed.requestHash)throw new Error('Данные восстановления повреждены.');return parsed;}
function matchedEntries(storage:Storage,pending:PendingLibraryBatch,terminal=false){
 const matching=readEntries(storage,pending.ownerId).entries.filter(entry=>entry.pending.input.operationId===pending.input.operationId);
 if(matching.some(entry=>terminal?!samePending(entry.pending,pending):!same(entry.pending,pending)))throw new Error('Данные восстановления изменились.');return matching;
}
function removeExact(storage:Storage,pending:PendingLibraryBatch,isCurrent:()=>boolean){
 if(!isCurrent())throw stale();const entries=matchedEntries(storage,pending);
 for(const entry of entries){if(!isCurrent())throw stale();const raw=storage.getItem(entry.key);if(raw===null)continue;if(!same(decodeEntry(entry.key,raw,pending.ownerId).pending,pending))throw new Error('Данные восстановления изменились.');try{storage.removeItem(entry.key);}catch{/* A matching durable receipt remains known saved; retain recovery on cleanup failure. */}}
}
export async function acceptLibraryBatchResult(storage:Storage,pending:PendingLibraryBatch,raw:unknown,isCurrent:()=>boolean):Promise<LibraryBatchCommitResult>{
 await validatePending(pending);if(!isCurrent())throw stale();
 const result=z.object({receipt:libraryBatchReceiptSchema,replayed:z.boolean()}).strict().parse(raw),receipt=result.receipt;
 const intent=canonicalLibraryBatchIntent({contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:pending.input.intent.settings,rows:receipt.rows.map(row=>({sourceId:row.sourceId,sourceRevision:row.sourceRevision,contentHash:row.contentHash,targets:row.targets.map(t=>({accountId:t.accountId,provider:t.provider,destinationId:t.destinationId,scheduledAt:t.scheduledAt}))}))});
 if(receipt.operationId!==pending.input.operationId||receipt.requestHash!==pending.requestHash||(!result.replayed&&receipt.acceptedSnapshotFingerprint!==pending.input.snapshotFingerprint)||!same(intent,canonicalLibraryBatchIntent(pending.input.intent)))throw new Error('Сервер не подтвердил исходный набор. Проверь сохранение по прежнему ключу.');
 removeExact(storage,pending,isCurrent);return result;
}
export async function submitLibraryBatch(storage:Storage,pending:PendingLibraryBatch,send:(input:PendingLibraryBatch['input'])=>Promise<unknown>,isCurrent:()=>boolean):Promise<LibraryBatchCommitResult>{
 const parsed=await validatePending(pending);if(!isCurrent())throw stale();if(parsed.terminal)throw new Error('Результат удалён; повторное создание запрещено.');
  const terminals=readEntries(storage,pending.ownerId).entries.filter(entry=>entry.pending.terminal).map(entry=>entry.pending);
  for(const terminal of terminals)await validatePending(terminal);
  if(!isCurrent())throw stale();
 const found=readPendingLibraryBatch(storage,pending.ownerId),existing=found.pending.find(value=>value.input.operationId===pending.input.operationId);if(found.blocked&&!same(existing,parsed))throw new Error('Сначала проверь исходное сохранение.');
  if(found.pending.some(value=>value.terminal&&!terminals.some(terminal=>same(terminal,value))))throw new Error('Данные восстановления изменились.');
 if(existing)matchedEntries(storage,parsed);
 // A distinct immutable local record for this POST, even when replaying the same server operation.
 const attempt=attemptSchema.parse({version:2,attemptId:crypto.randomUUID(),pending:parsed}),key=libraryBatchRecoveryKey(parsed.ownerId,parsed.input.operationId,attempt.attemptId),raw=JSON.stringify(attempt);
 storage.setItem(key,raw);const persisted=storage.getItem(key);if(persisted===null||!same(attemptSchema.parse(JSON.parse(persisted)),attempt))throw new Error('Браузер не сохранил данные восстановления.');
 if(!isCurrent())throw stale();let response:unknown;try{response=await send(parsed.input);}catch(error){throw new LibraryBatchSubmissionError(attempt,error);}
 if(!isCurrent())throw stale();return acceptLibraryBatchResult(storage,parsed,response,isCurrent);
}
// A rollback proves only its exact dispatched local attempt. Lookup/auth/5xx/loss and
// old records without attempt provenance never prove that the operation rolled back.
export function resolveLibraryBatchError(storage:Storage,pending:PendingLibraryBatch,error:unknown,isCurrent:()=>boolean):'deleted'|'no-commit'|'uncertain'{
 if(!isCurrent())return 'uncertain';const failure=error instanceof LibraryBatchSubmissionError?error.originalError:error;if(!(failure instanceof PlanlyApiError))return 'uncertain';const status=failure.status,body=failure.body as {code?:unknown;commitApplied?:unknown;result?:unknown}|null;
 if(status===410&&body?.code==='BATCH_RESULT_DELETED'){
  const result=z.object({operationId:z.literal(pending.input.operationId),postIds:z.array(z.string().min(1)).length(pending.input.intent.rows.length)}).strict().safeParse(body.result);
  if(result.success&&new Set(result.data.postIds).size===result.data.postIds.length){
   const entries=matchedEntries(storage,pending,true);if(!entries.length)return 'uncertain';for(const entry of entries){if(!isCurrent())return 'uncertain';const raw=storage.getItem(entry.key);if(raw===null)continue;const current=decodeEntry(entry.key,raw,pending.ownerId);if(!samePending(current.pending,pending)||current.pending.terminal&&!same(current.pending.terminal,result.data))throw new Error('Данные восстановления изменились.');storage.setItem(entry.key,encodedEntry(current,{...pending,terminal:result.data}));}return 'deleted';
  }
 }
 const rollbackCodes:Record<string,number>={BATCH_FORBIDDEN:403,BATCH_UNAVAILABLE:404,BATCH_PREVIEW_STALE:409,BATCH_ACCOUNT_UNAVAILABLE:409,BATCH_CONTENT_INVALID:409,BATCH_SLOT_CONFLICT:409};
 if(error instanceof LibraryBatchSubmissionError&&body?.commitApplied===false&&typeof body.code==='string'&&Object.hasOwn(rollbackCodes,body.code)&&rollbackCodes[body.code]===status){
  const attempt=attemptSchema.parse(error.attempt);if(!same(attempt.pending,pending))return 'uncertain';const key=libraryBatchRecoveryKey(pending.ownerId,pending.input.operationId,attempt.attemptId),raw=storage.getItem(key);
  if(raw===null)return 'uncertain';const current=attemptSchema.safeParse(JSON.parse(raw));if(!current.success||!same(current.data,attempt)||!isCurrent())return 'uncertain';storage.removeItem(key);
  return readPendingLibraryBatch(storage,pending.ownerId).blocked?'uncertain':'no-commit';
 }
 return 'uncertain';
}

// Validate the visible rows against frozen C; never derive C from display DTOs.
export async function validateLibraryBatchPreview(raw:unknown,input:LibraryBatchPreviewInput):Promise<LibraryBatchPreview & {complete:true}>{
 const value=raw as LibraryBatchPreview;if(!value||value.complete!==true||!value.descriptor||!Array.isArray(value.rows)||!Array.isArray(value.media))throw new Error('Нужен полный предпросмотр всех заготовок.');
 const d=value.descriptor,pending=makePendingLibraryBatch('validation','00000000-0000-4000-8000-000000000000',d);await validatePending(pending);
 const intent=pending.input.intent;
 if(!same(intent.settings,canonicalLibraryBatchIntent({...intent,settings:input.settings}).settings)||!same(intent.rows.map(r=>r.sourceId),input.sourceIds)||value.rows.length!==input.sourceIds.length)throw new Error('Предпросмотр не соответствует выбранному набору.');
 if(new Set(value.media.map(m=>m.id)).size!==value.media.length)throw new Error('Повтор медиа в предпросмотре.');
 for(let i=0;i<intent.rows.length;i++){
  const c=intent.rows[i],display=value.rows[i],item=display?.item;
  if(!item||item.id!==c.sourceId||item.status!=='READY'||item.sourcePostId||item.updatedAt!==c.sourceRevision||typeof item.text!=='string'||!(item.title===null||typeof item.title==='string')||!Array.isArray(item.mediaIds)||new Set(item.mediaIds).size!==item.mediaIds.length||display.issue!==null||display.scheduledAt!==c.targets[0].scheduledAt||!Array.isArray(display.accounts)||display.accounts.length!==c.targets.length||!same([...c.targets.map(t=>t.accountId)].sort(),[...input.accountIds].sort()))throw new Error('Неполный или устаревший предпросмотр.');
  for(const target of c.targets){const account=display.accounts.find(a=>a.id===target.accountId);if(!account||account.provider.toUpperCase()!==target.provider||account.providerAccountId!==target.destinationId||!account.enabled||account.connectionStatus!=='CONNECTED')throw new Error('Назначение площадки изменилось.');}
  for(const id of item.mediaIds){const media=value.media.find(m=>m.id===id);if(!media||typeof media.previewUrl!=='string'||!media.previewUrl||!/^image\/|^video\//.test(media.mimeType))throw new Error('Медиа предпросмотра недоступны.');}
 }
 return structuredClone(value) as LibraryBatchPreview & {complete:true};
}

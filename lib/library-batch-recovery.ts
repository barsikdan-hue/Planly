import {z} from 'zod';
import {libraryBatchCommitInputSchema,libraryBatchHashSchema,libraryBatchReceiptSchema,type LibraryBatchDescriptor,type LibraryBatchPreview,type LibraryBatchPreviewInput,type LibraryBatchCommitResult} from './contracts/library-batch.ts';
import {canonicalLibraryBatchIntent} from './library-batch.ts';

type Storage=Pick<globalThis.Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
const pendingSchema=z.object({version:z.literal(1),ownerId:z.string().min(1),requestHash:libraryBatchHashSchema,input:libraryBatchCommitInputSchema,
 terminal:z.object({operationId:z.string().uuid(),postIds:z.array(z.string().min(1)).min(1).max(20)}).strict().optional()}).strict();
export type PendingLibraryBatch=z.infer<typeof pendingSchema>;
export type LibraryBatchRecovery={pending:PendingLibraryBatch[];blocked:boolean};
// The owner-only key is retained solely for conservative legacy read/ack compatibility.
export const libraryBatchRecoveryKey=(ownerId:string,operationId?:string)=>`planly.library-batch.v1:${encodeURIComponent(ownerId)}${operationId?`:${operationId}`:""}`;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const stale=()=>new Error('Результат нужно проверить в исходном аккаунте.');
export async function browserLibraryBatchRequestHash(intent:LibraryBatchDescriptor['intent']):Promise<string>{
 const bytes=new TextEncoder().encode('planly.library-batch.intent.v1\n'+JSON.stringify(canonicalLibraryBatchIntent(intent)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
}
export function makePendingLibraryBatch(ownerId:string,operationId:string,descriptor:LibraryBatchDescriptor):PendingLibraryBatch{
 return pendingSchema.parse({version:1,ownerId,requestHash:descriptor.requestHash,input:{operationId,intent:canonicalLibraryBatchIntent(descriptor.intent),snapshotFingerprint:descriptor.snapshotFingerprint,previewProof:descriptor.previewProof}});
}
function readEntries(storage:Storage,ownerId:string){
 const entries:{key:string;pending:PendingLibraryBatch}[]=[],legacy=libraryBatchRecoveryKey(ownerId),prefix=legacy+':';let blocked=false;
 try{
  const keys=new Set<string>();if(storage.getItem(legacy)!==null)keys.add(legacy);
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))keys.add(key);}
  for(const key of [...keys].sort()){
   try{const raw=storage.getItem(key);if(raw===null)continue;const pending=pendingSchema.parse(JSON.parse(raw));
    if(pending.ownerId!==ownerId||key!==legacy&&key!==libraryBatchRecoveryKey(ownerId,pending.input.operationId)||pending.terminal&&pending.terminal.operationId!==pending.input.operationId)throw Error('Invalid recovery');
    entries.push({key,pending});
   }catch{blocked=true;}
  }
 }catch{blocked=true;}
 return {entries,blocked};
}
export function readPendingLibraryBatch(storage:Storage,ownerId:string):LibraryBatchRecovery{
 const {entries,blocked}=readEntries(storage,ownerId),byOperation=new Map<string,PendingLibraryBatch>(),conflicts=new Set<string>();
 for(const {pending} of entries){const id=pending.input.operationId,existing=byOperation.get(id);if(existing&&!same(existing,pending))conflicts.add(id);else byOperation.set(id,pending);}
 for(const id of conflicts)byOperation.delete(id);
 return {pending:[...byOperation.values()],blocked:blocked||conflicts.size>0||entries.length>0};
}
async function validatePending(pending:PendingLibraryBatch){const parsed=pendingSchema.parse(pending);if(await browserLibraryBatchRequestHash(parsed.input.intent)!==parsed.requestHash)throw new Error('Данные восстановления повреждены.');return parsed;}
function matchedKeys(storage:Storage,pending:PendingLibraryBatch){
 const matching=readEntries(storage,pending.ownerId).entries.filter(entry=>entry.pending.input.operationId===pending.input.operationId);
 if(!matching.length||matching.some(entry=>!same(entry.pending,pending)))throw new Error('Данные восстановления изменились.');return matching.map(entry=>entry.key);
}
function removeExact(storage:Storage,pending:PendingLibraryBatch,isCurrent:()=>boolean,knownSaved=false){
 if(!isCurrent())throw stale();const keys=matchedKeys(storage,pending);
 for(const key of keys){if(!isCurrent())throw stale();const raw=storage.getItem(key);if(raw===null)continue;if(!same(pendingSchema.parse(JSON.parse(raw)),pending))throw new Error('Данные восстановления изменились.');try{storage.removeItem(key);}catch(error){if(!knownSaved)throw error;}}
}
export async function acceptLibraryBatchResult(storage:Storage,pending:PendingLibraryBatch,raw:unknown,isCurrent:()=>boolean):Promise<LibraryBatchCommitResult>{
 await validatePending(pending);if(!isCurrent())throw stale();
 const result=z.object({receipt:libraryBatchReceiptSchema,replayed:z.boolean()}).strict().parse(raw),receipt=result.receipt;
 const intent=canonicalLibraryBatchIntent({contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:pending.input.intent.settings,rows:receipt.rows.map(row=>({sourceId:row.sourceId,sourceRevision:row.sourceRevision,contentHash:row.contentHash,targets:row.targets.map(t=>({accountId:t.accountId,provider:t.provider,destinationId:t.destinationId,scheduledAt:t.scheduledAt}))}))});
 if(receipt.operationId!==pending.input.operationId||receipt.requestHash!==pending.requestHash||(!result.replayed&&receipt.acceptedSnapshotFingerprint!==pending.input.snapshotFingerprint)||!same(intent,canonicalLibraryBatchIntent(pending.input.intent)))throw new Error('Сервер не подтвердил исходный набор. Проверь сохранение по прежнему ключу.');
 removeExact(storage,pending,isCurrent,true);return result;
}
export async function submitLibraryBatch(storage:Storage,pending:PendingLibraryBatch,send:(input:PendingLibraryBatch['input'])=>Promise<unknown>,isCurrent:()=>boolean):Promise<LibraryBatchCommitResult>{
 const parsed=await validatePending(pending);if(!isCurrent())throw stale();if(parsed.terminal)throw new Error('Результат удалён; повторное создание запрещено.');
 const found=readPendingLibraryBatch(storage,pending.ownerId),existing=found.pending.find(value=>value.input.operationId===pending.input.operationId);if(found.blocked&&!same(existing,pending))throw new Error('Сначала проверь исходное сохранение.');
 if(existing)matchedKeys(storage,pending);else storage.setItem(libraryBatchRecoveryKey(pending.ownerId,pending.input.operationId),JSON.stringify(parsed));if(!readPendingLibraryBatch(storage,pending.ownerId).pending.some(value=>same(value,parsed)))throw new Error('Браузер не сохранил данные восстановления.');
 if(!isCurrent())throw stale();const raw=await send(parsed.input);if(!isCurrent())throw stale();return acceptLibraryBatchResult(storage,parsed,raw,isCurrent);
}
// Only an explicit server rollback projection may release a pending operation.
// GET 404, 503, auth failures and conflicts are never rollback evidence.
export function resolveLibraryBatchError(storage:Storage,pending:PendingLibraryBatch,status:number,raw:unknown,isCurrent:()=>boolean,fromCommit:boolean):'deleted'|'no-commit'|'uncertain'{
 if(!isCurrent())return 'uncertain';const body=raw as {code?:unknown;commitApplied?:unknown;result?:unknown}|null;
 if(status===410&&body?.code==='BATCH_RESULT_DELETED'){
  const result=z.object({operationId:z.literal(pending.input.operationId),postIds:z.array(z.string().min(1)).length(pending.input.intent.rows.length)}).strict().safeParse(body.result);
  if(result.success&&new Set(result.data.postIds).size===result.data.postIds.length){
   const keys=matchedKeys(storage,pending);for(const key of keys){if(!isCurrent())return 'uncertain';const raw=storage.getItem(key);if(raw===null||!same(pendingSchema.parse(JSON.parse(raw)),pending))throw new Error('Данные восстановления изменились.');storage.setItem(key,JSON.stringify({...pending,terminal:result.data}));}return 'deleted';
  }
 }
 const rollbackCodes:Record<string,number>={BATCH_INVALID:422,BATCH_FORBIDDEN:403,BATCH_UNAVAILABLE:404,BATCH_PREVIEW_STALE:409,BATCH_ACCOUNT_UNAVAILABLE:409,BATCH_CONTENT_INVALID:409,BATCH_SLOT_CONFLICT:409};
 if(fromCommit&&body?.commitApplied===false&&typeof body.code==='string'&&Object.hasOwn(rollbackCodes,body.code)&&rollbackCodes[body.code]===status){removeExact(storage,pending,isCurrent);return 'no-commit';}
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

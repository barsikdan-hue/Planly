import {z} from 'zod';
import type {RecoveryStorage} from './editor-recovery.ts';
import {readPendingCreation} from './pending-creation.ts';
import {archiveLibraryItem,PlanlyApiError} from './planly-api.ts';
import type {LibraryItemDto} from '../contracts/library.ts';
import type {SwipeDislike,SwipeFeedbackSnapshot} from '../contracts/swipe-feedback.ts';
const schema=z.object({version:z.literal(1),key:z.string().uuid(),sourceId:z.string().min(1),expectedUpdatedAt:z.string().datetime({offset:true}),inputMethod:z.enum(['gesture','button','keyboard'])}).strict();
export type PendingDislike=z.infer<typeof schema>;
export type SwipeDecisionOutcome={status:'confirmed';saved:LibraryItemDto}|{status:'terminal'}|{status:'stale'};
export const pendingDislikeKey=(owner:string)=>`planly:pending-dislike:v1:${encodeURIComponent(owner)}`;
export function readPendingDislike(storage:RecoveryStorage,owner:string):PendingDislike|null {
 const raw=storage.getItem(pendingDislikeKey(owner));if(!raw)return null;
 try{if(raw.length>4096)throw Error();return schema.parse(JSON.parse(raw));}catch{throw Error('Запись предыдущего решения повреждена. Новое решение не отправлено.');}
}
export function writePendingDislike(storage:RecoveryStorage,owner:string,pending:PendingDislike){storage.setItem(pendingDislikeKey(owner),JSON.stringify(schema.parse(pending)));}
export function isDecisionResultDeleted(error:unknown){return error instanceof PlanlyApiError && error.status===410 && !!error.body && typeof error.body==='object' && 'code' in error.body && error.body.code==='DECISION_RESULT_DELETED';}
async function dispatch(storage:RecoveryStorage,owner:string,pending:PendingDislike,isCurrent:()=>boolean):Promise<SwipeDecisionOutcome>{
 const current=()=>isCurrent() && readPendingDislike(storage,owner)?.key===pending.key;
 try{
  const saved=await archiveLibraryItem(pending.sourceId,pending.expectedUpdatedAt,{operationId:pending.key,inputMethod:pending.inputMethod});
  if(!current())return {status:'stale'};
  storage.removeItem(pendingDislikeKey(owner));return {status:'confirmed',saved};
 }catch(error){
  if(!current())return {status:'stale'};
  if(isDecisionResultDeleted(error)){storage.removeItem(pendingDislikeKey(owner));return {status:'terminal'};}
  if(error instanceof PlanlyApiError && error.status===409 && error.body && typeof error.body==='object' && 'code' in error.body && ['LIBRARY_SOURCE_STALE','LIBRARY_SOURCE_CONFLICT'].includes(String(error.body.code)))storage.removeItem(pendingDislikeKey(owner));
  throw error;
 }
}
export async function submitSwipeDislike(storage:RecoveryStorage,owner:string,item:LibraryItemDto,inputMethod:SwipeDislike['inputMethod']='button',isCurrent=()=>true){
 if(!isCurrent())return {status:'stale'} as const;
 if(readPendingDislike(storage,owner)||readPendingCreation(storage,owner))throw Error('Сначала восстанови предыдущее решение.');
 const pending:PendingDislike={version:1,key:crypto.randomUUID(),sourceId:item.id,expectedUpdatedAt:item.updatedAt,inputMethod};
 writePendingDislike(storage,owner,pending);return dispatch(storage,owner,pending,isCurrent);
}
export async function retrySwipeDislike(storage:RecoveryStorage,owner:string,isCurrent=()=>true){
 const pending=readPendingDislike(storage,owner);if(!pending)throw Error('Нет решения для восстановления.');
 return dispatch(storage,owner,pending,isCurrent);
}
export async function loadSwipeFeedback(isCurrent:()=>boolean,exporting=false):Promise<SwipeFeedbackSnapshot|null>{
 const response=await fetch(exporting?'/api/swipe-feedback/export':'/api/swipe-feedback',{cache:'no-store'});
 if(!isCurrent())return null;
 if(!response.ok)throw Error('Не удалось загрузить оценки.');
 const value=await response.json() as SwipeFeedbackSnapshot;
 if(!isCurrent())return null;
 if(value.version!==1 || !value.aggregate || !Array.isArray(value.current)||!Array.isArray(value.receipts))throw Error('Сервер не подтвердил данные оценок.');
 return value;
}
function browserDownload(snapshot:SwipeFeedbackSnapshot){
 const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
 try{const anchor=document.createElement('a');anchor.href=url;anchor.download='planly-swipe-feedback-v1.json';anchor.click();}finally{URL.revokeObjectURL(url);}
}
export async function downloadSwipeFeedback(isCurrent:()=>boolean,download=browserDownload){
 const snapshot=await loadSwipeFeedback(isCurrent,true);
 if(snapshot && isCurrent())download(snapshot);
}

import { z } from 'zod';
import { schedulingPlanCommitInputSchema, schedulingPlanReceiptSchema, type SchedulingPlanCommitInput, type SchedulingPlanCommitResult } from '../contracts/scheduling-plan.ts';
import { canonicalSchedulingPlanCommit } from '../scheduling-plan.ts';
import { PlanlyApiError } from './planly-api.ts';

export type SchedulingRecoveryStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export type PendingSchedulingPlan = {version:1;ownerId:string;operationId:string;input:SchedulingPlanCommitInput};
export type SchedulingRecoveryRead = {pending:PendingSchedulingPlan[];blocked:boolean};
const schema=z.object({version:z.literal(1),ownerId:z.string().min(1).max(200),operationId:z.string().uuid(),input:schedulingPlanCommitInputSchema}).strict().refine(p=>p.operationId===p.input.operationId);
const prefix=(ownerId:string)=>`planly:scheduling-plan:v1:${encodeURIComponent(ownerId)}:`;
const key=(ownerId:string,operationId:string)=>`${prefix(ownerId)}${operationId}`;
function normalized(pending:PendingSchedulingPlan):PendingSchedulingPlan {
  const parsed=schema.parse(pending);return {...parsed,input:canonicalSchedulingPlanCommit(parsed.input)};
}
function encoded(pending:PendingSchedulingPlan):string {
  const raw=JSON.stringify(normalized(pending));
  if(new TextEncoder().encode(raw).length>65536)throw new Error('Scheduling recovery is unavailable');
  return raw;
}
function decode(raw:string):PendingSchedulingPlan {
  if(raw.length>65536||new TextEncoder().encode(raw).length>65536)throw new Error('Scheduling recovery is unavailable');
  return normalized(JSON.parse(raw));
}
export function readPendingSchedulingPlans(storage:SchedulingRecoveryStorage,ownerId:string):SchedulingRecoveryRead {
  const result:SchedulingRecoveryRead={pending:[],blocked:false};
  try {
    const keys:string[]=[];for(let i=0;i<storage.length;i++){const name=storage.key(i);if(name?.startsWith(prefix(ownerId)))keys.push(name);}
    for(const name of keys){try{const raw=storage.getItem(name);if(raw===null)continue;const pending=decode(raw);if(pending.ownerId!==ownerId||name!==key(ownerId,pending.operationId))throw new Error('Invalid operation');result.pending.push(pending);}catch{result.blocked=true;}}
  }catch{result.blocked=true;}
  result.blocked ||= result.pending.length>0;return result;
}
export function persistPendingSchedulingPlan(storage:SchedulingRecoveryStorage,pending:PendingSchedulingPlan):void {
  const raw=encoded(pending);const name=key(pending.ownerId,pending.operationId);const previous=storage.getItem(name);
  if(previous!==null&&encoded(decode(previous))!==raw)throw new Error('Scheduling operation conflict');
  if(previous===null)storage.setItem(name,raw);
}
export function completePendingSchedulingPlan(storage:SchedulingRecoveryStorage,ownerId:string,operationId:string):void {
  const name=key(ownerId,operationId);const raw=storage.getItem(name);if(raw===null)return;
  const pending=decode(raw);if(pending.ownerId===ownerId&&pending.operationId===operationId)storage.removeItem(name);
}
const clearable=new Set(['PLAN_BAD_JSON','PLAN_INVALID_INPUT','PLAN_CONTENT_INVALID','PLAN_POST_NOT_FOUND','PLAN_STALE','PLAN_SLOT_CONFLICT','PLAN_ACCOUNT_UNAVAILABLE','PLAN_INELIGIBLE','PLAN_INCOMPLETE']);
export async function submitPendingSchedulingPlan(storage:SchedulingRecoveryStorage,pending:PendingSchedulingPlan,send:(input:SchedulingPlanCommitInput)=>Promise<SchedulingPlanCommitResult>):Promise<SchedulingPlanCommitResult> {
  const intent=normalized(pending);persistPendingSchedulingPlan(storage,intent);
  let response:SchedulingPlanCommitResult;
  try{response=await send(intent.input);}catch(error){
    if(error instanceof PlanlyApiError&&[400,404,409,422].includes(error.status)&&error.body&&typeof error.body==='object'){
      const body=error.body as {code?:unknown;commitApplied?:unknown};
      if(body.commitApplied===false&&typeof body.code==='string'&&clearable.has(body.code)){try{completePendingSchedulingPlan(storage,intent.ownerId,intent.operationId);}catch{/* Retain a replayable intent if acknowledgement storage fails. */}}
    }throw error;
  }
  const receipt=schedulingPlanReceiptSchema.parse(response.receipt);
  if(typeof response.replayed!=='boolean'||receipt.operationId!==intent.operationId||receipt.rows.length!==intent.input.rows.length||receipt.rows.some((row,i)=>row.postId!==intent.input.rows[i].postId||new Date(row.scheduledAt).toISOString()!==intent.input.rows[i].scheduledAt))throw new Error('Scheduling acknowledgement is invalid');
  try{completePendingSchedulingPlan(storage,intent.ownerId,intent.operationId);}catch{/* A known commit remains successful; the original operation can be replayed. */}
  return {receipt,replayed:response.replayed};
}

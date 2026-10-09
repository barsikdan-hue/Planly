import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { posts, postTargets, publications, socialAccounts, schedulingPlanOperations } from '../../db/schema.ts';
import { schedulingPlanReceiptSchema, type SchedulingPlanCommitInput, type SchedulingPlanCommitResult, type SchedulingPlanReceipt } from '../contracts/scheduling-plan.ts';
import { fromDbProvider, type SavePostInput } from '../contracts/planner.ts';
import { canonicalSchedulingPlanCommit, isSchedulingPlanSlot } from '../scheduling-plan.ts';
import { slotMinuteKey } from '../planner-slots.ts';
import { lockOwnerSchedule, occupiedSlotMinutes } from './planner-slots.ts';
import { readSchedulingSnapshots, schedulingEligibility, fingerprintSchedulingSnapshot } from './scheduling-plan-snapshot.ts';
import { validatePostRelations } from './post-relations.ts';
import { reconcilePostPublicationsInTx, type PublicationQueueChange } from './publications.ts';
import { applyPublicationQueueChanges } from './scheduler/reconcile.ts';

type ConflictCode='PLAN_STALE'|'PLAN_SLOT_CONFLICT'|'PLAN_ACCOUNT_UNAVAILABLE'|'PLAN_INELIGIBLE'|'PLAN_INCOMPLETE'|'PLAN_OPERATION_CONFLICT';
export class SchedulingPlanConflictError extends Error {
  readonly code:ConflictCode;
  constructor(code:ConflictCode){super(code==='PLAN_OPERATION_CONFLICT'?'Не удалось восстановить операцию. Проверь календарь.':'План изменился или слот недоступен. Обнови предпросмотр и подтверди снова.');this.name='SchedulingPlanConflictError';this.code=code;}
}
export async function commitSchedulingPlan(userId:string,raw:SchedulingPlanCommitInput,options:{now?:()=>Date;mirrorQueue?:(changes:PublicationQueueChange[])=>Promise<void>}={}):Promise<SchedulingPlanCommitResult> {
  const input=canonicalSchedulingPlanCommit(raw);
  const requestHash=createHash('sha256').update(JSON.stringify({settings:input.settings,rows:input.rows})).digest('hex');
  const result=await getDb().transaction(async tx=>{
    await lockOwnerSchedule(tx,userId);
    const [saved]=await tx.select().from(schedulingPlanOperations).where(and(eq(schedulingPlanOperations.userId,userId),eq(schedulingPlanOperations.operationId,input.operationId)));
    if(saved){
      if(saved.requestHash!==requestHash)throw new SchedulingPlanConflictError('PLAN_OPERATION_CONFLICT');
      const parsed=schedulingPlanReceiptSchema.safeParse(saved.receipt);
      if(!parsed.success)throw new Error('Scheduling receipt invalid');
      const receipt=parsed.data;
      if(receipt.operationId!==input.operationId||receipt.rows.length!==input.rows.length||receipt.rows.some((row,i)=>row.postId!==input.rows[i].postId||row.scheduledAt!==input.rows[i].scheduledAt))throw new Error('Scheduling receipt invalid');
      return {receipt,replayed:true,changes:[] as PublicationQueueChange[]};
    }
    const ids=input.rows.map(row=>row.postId);
    const owned=await tx.select().from(posts).where(and(eq(posts.userId,userId),inArray(posts.id,ids))).orderBy(asc(posts.id)).for('update');
    if(owned.length!==ids.length)throw new Error('Post not found');
    await tx.select().from(publications).where(inArray(publications.postId,ids)).orderBy(asc(publications.id)).for('update');
    const initial=await readSchedulingSnapshots(tx,userId,ids);
    const accountIds=[...new Set(initial.flatMap(snapshot=>snapshot.targets.filter(row=>row.target.active).map(row=>row.account.id)))];
    if(accountIds.length)await tx.select().from(socialAccounts).where(and(eq(socialAccounts.userId,userId),inArray(socialAccounts.id,accountIds))).orderBy(asc(socialAccounts.id)).for('update');
    const snapshots=await readSchedulingSnapshots(tx,userId,ids);
    const current=options.now?.()??new Date();
    const providers=[...new Set(snapshots.flatMap(snapshot=>snapshot.targets.filter(row=>row.target.active).map(row=>fromDbProvider(row.account.provider))))];
    const occupied=providers.length?await occupiedSlotMinutes(tx,userId,{providers}):new Set<string>();
    const reserved=new Set<string>();
    for(const [i,snapshot] of snapshots.entries()){
      const row=input.rows[i];const issue=schedulingEligibility(snapshot);
      if(issue==='ACCOUNT_UNAVAILABLE')throw new SchedulingPlanConflictError('PLAN_ACCOUNT_UNAVAILABLE');
      if(issue==='POST_INELIGIBLE')throw new SchedulingPlanConflictError('PLAN_INELIGIBLE');
      const relations:SavePostInput={title:snapshot.post.title,baseText:snapshot.post.baseText,status:'READY',mediaIds:snapshot.media.map(row=>row.asset.id),targets:snapshot.targets.filter(row=>row.target.active).map(({target,account})=>({provider:fromDbProvider(account.provider),textOverride:target.textOverride,scheduledAt:row.scheduledAt}))};
      await validatePostRelations(tx,userId,relations);
      if(fingerprintSchedulingSnapshot(snapshot)!==row.fingerprint)throw new SchedulingPlanConflictError('PLAN_STALE');
      const minute=slotMinuteKey(row.scheduledAt);
      if(!isSchedulingPlanSlot(input.settings,row.scheduledAt)||new Date(row.scheduledAt)<=current||occupied.has(minute)||reserved.has(minute))throw new SchedulingPlanConflictError('PLAN_SLOT_CONFLICT');
      reserved.add(minute);
    }
    const changes:PublicationQueueChange[]=[];
    const receipt:SchedulingPlanReceipt={operationId:input.operationId,appliedAt:current.toISOString(),rows:[]};
    for(const [i,snapshot] of snapshots.entries()){
      const row=input.rows[i];const targetIds=snapshot.targets.filter(row=>row.target.active).map(row=>row.target.id);
      await tx.update(posts).set({status:'READY',updatedAt:current}).where(and(eq(posts.id,row.postId),eq(posts.userId,userId)));
      await tx.update(postTargets).set({scheduledAt:new Date(row.scheduledAt),updatedAt:current}).where(and(eq(postTargets.postId,row.postId),eq(postTargets.active,true),inArray(postTargets.id,targetIds)));
      changes.push(...await reconcilePostPublicationsInTx(tx,userId,row.postId));
      const scheduled=await tx.select().from(publications).where(and(eq(publications.userId,userId),inArray(publications.postTargetId,targetIds),eq(publications.status,'SCHEDULED')));
      if(scheduled.length!==targetIds.length||scheduled.some(p=>p.scheduledAt?.toISOString()!==row.scheduledAt))throw new Error('Scheduling publication invariant failed');
      receipt.rows.push({postId:row.postId,targetIds,scheduledAt:row.scheduledAt});
    }
    await tx.insert(schedulingPlanOperations).values({userId,operationId:input.operationId,requestHash,receipt,createdAt:current});
    return {receipt,replayed:false,changes};
  });
  if(!result.replayed&&result.changes.length){try{await (options.mirrorQueue??applyPublicationQueueChanges)(result.changes);}catch{console.error('SCHEDULING_QUEUE_MIRROR_FAILED');}}
  return {receipt:result.receipt,replayed:result.replayed};
}

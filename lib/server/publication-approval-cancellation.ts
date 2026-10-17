import {and, asc, eq, or} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db/index.ts';
import {posts,postTargets,publications} from '../../db/schema.ts';
import {cancelApprovalInputSchema,type CancelApprovalInput,type CancelApprovalResult} from '../contracts/planner.ts';
import type {PublicationQueueChange} from './publications.ts';
import {SocialConnectionError,lockConnectionActor,lockOwnedConnectionAccount} from './social-connections/state.ts';
import {sessionTokenHash} from './auth/session.ts';
import {approvalHistory} from './publication-approval-history.ts';
import {applyPublicationQueueChanges} from './scheduler/reconcile.ts';

export async function cancelPublicationApproval(raw:string,postId:string,targetId:string,input:CancelApprovalInput,options:{now?:()=>number;mirrorQueue?:(changes:PublicationQueueChange[])=>Promise<void>}={}):Promise<CancelApprovalResult> {
 const body=cancelApprovalInputSchema.parse(input),now=options.now??Date.now;
 z.string().min(1).max(128).parse(postId);z.string().min(1).max(128).parse(targetId);
 if(!raw || raw.length>4096)throw new SocialConnectionError('DENIED');
 const conflict=():never=>{throw new SocialConnectionError('CONFLICT');};
 const committed=await getDb().transaction(async tx=>{
  const actor=await lockConnectionActor(tx,sessionTokenHash(raw),now);
  const [post]=await tx.select().from(posts).where(and(eq(posts.id,postId),eq(posts.userId,actor.userId))).for('update');
  if(!post)return conflict();
  // Include mismatched legacy relationships too: independent FKs do not prove ownership.
  const history=await tx.select().from(publications).where(or(eq(publications.postId,postId),eq(publications.postTargetId,targetId))).orderBy(asc(publications.id)).for('update');
  const [target]=await tx.select().from(postTargets).where(and(eq(postTargets.id,targetId),eq(postTargets.postId,postId))).for('update');
  if(!target)return conflict();
  const account=await lockOwnedConnectionAccount(tx,actor,target.socialAccountId,now);
  const classified=approvalHistory(post,target,account,history),auth=classified.auth;
  if(!classified.safe || !auth || auth.id!==body.expectedPublicationId || auth.updatedAt.getTime()!==Date.parse(body.expectedPublicationUpdatedAt))return conflict();
  const result=(at:Date,replayed:boolean):CancelApprovalResult=>({postId,targetId,publicationId:auth.id,approvalCancelledAt:at.toISOString(),replayed});
  // Read-only receipt replay intentionally precedes current binding/target freshness.
  if(target.approvalCancelledAt) {
   if(!classified.cancelled)return conflict();
   return {result:result(target.approvalCancelledAt,true),changes:[] as PublicationQueueChange[]};
  }
  if(target.updatedAt.getTime()!==Date.parse(body.expectedTargetUpdatedAt) || account.bindingRevision!==body.expectedBindingRevision)return conflict();
  const at=new Date(now());
  if(actor.sessionExpiresAt<=at.getTime())throw new SocialConnectionError('DENIED');
  await tx.update(postTargets).set({scheduledAt:null,approvalCancelledAt:at,updatedAt:at}).where(eq(postTargets.id,targetId));
  const changes:PublicationQueueChange[]=[];
  for(const row of classified.open) {
   await tx.update(publications).set({status:'CANCELLED',nextRetryAt:null,updatedAt:at}).where(eq(publications.id,row.id));
   changes.push({publicationId:row.id,action:'remove'});
  }
  return {result:result(at,false),changes};
 });
 if(committed.changes.length)try{await (options.mirrorQueue??applyPublicationQueueChanges)(committed.changes);}catch{/* Durable terminal DB state is the barrier; never log driver credentials. */}
 return committed.result;
}

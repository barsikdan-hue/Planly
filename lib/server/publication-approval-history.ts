import type {posts, postTargets, publications, socialAccounts} from '../../db/schema.ts';
import type {CancelApprovalDto} from '../contracts/planner.ts';

type Post=typeof posts.$inferSelect;
type Target=typeof postTargets.$inferSelect;
type Account=typeof socialAccounts.$inferSelect;
type Publication=typeof publications.$inferSelect;

// A local AUTH proves only its own last path. Every earlier attempt matters.
// This predicate is shared by mutation, readback, preview and the release barrier.
export function approvalHistory(post:Post,target:Target,account:Account,history:Publication[]) {
 const rows=history.filter(row=>row.postTargetId===target.id);
 const auths=rows.filter(row=>row.status==='REQUIRES_RECONNECT');
 const auth=auths.length===1?auths[0]:null;
 const related=target.postId===post.id && account.id===target.socialAccountId && account.userId===post.userId &&
  (account.provider==='TELEGRAM'||account.provider==='MAX') && rows.every(row=>row.postId===post.id && row.userId===post.userId && row.provider===account.provider);
 const noReceipt=rows.every(row=>row.providerRemoteId===null && row.providerUrl===null && row.publishedAt===null && row.analyticsDestinationId===null && row.providerErrorCode!=='AMBIGUOUS_DELIVERY');
 const local=auth && auth.normalizedErrorType==='AUTH' && (
  auth.providerErrorCode==='PERSONAL_PROVIDER_SETUP_REQUIRED' && auth.attemptCount===0 && auth.lastAttemptAt===null ||
  auth.providerErrorCode===`${account.provider}_DISCONNECTED` && auth.attemptCount===1 && auth.lastAttemptAt instanceof Date && Number.isFinite(auth.lastAttemptAt.getTime())
 );
 const rest=rows.filter(row=>row!==auth);
 const safe=!!(related && noReceipt && local && rest.every(row=>
  ['SCHEDULED','QUEUED','CANCELLED'].includes(row.status) && row.attemptCount===0 && row.lastAttemptAt===null &&
  row.normalizedErrorType===null && row.providerErrorCode===null && row.providerErrorMessage===null));
 const cancelled=safe && !!target.approvalCancelledAt && target.scheduledAt===null &&
  target.updatedAt.getTime()===target.approvalCancelledAt.getTime() && rest.every(row=>row.status==='CANCELLED');
 return {auth:related?auth:null,safe,cancelled,open:safe?rest.filter(row=>row.status==='SCHEDULED'||row.status==='QUEUED'):[]};
}

export function cancellationPreview(post:Post,target:Target,account:Account,history:Publication[]):CancelApprovalDto {
 const result=approvalHistory(post,target,account,history);
 const available=result.safe && target.approvalCancelledAt===null;
 return {eligible:available,reason:available?'AVAILABLE':result.cancelled?'ALREADY_CANCELLED':'UNSUPPORTED_HISTORY',
  expectedPublicationId:result.auth?.id??null,expectedPublicationUpdatedAt:result.auth?.updatedAt.toISOString()??null,
  expectedTargetUpdatedAt:target.updatedAt.toISOString(),expectedBindingRevision:account.bindingRevision,
  historicalDestinationId:result.auth?.socialBindingDestinationId??null};
}

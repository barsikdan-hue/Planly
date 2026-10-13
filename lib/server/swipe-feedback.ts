import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { libraryItems,libraryItemMedia,mediaAssets,posts,swipeDecisionReceipts,swipeCurrentFeedback } from '../../db/schema.ts';
import { CreationConflictError } from './post-idempotency.ts';
import type { SwipeDislike,SwipeFeedbackSnapshot,SwipeDecisionMetadata } from '../contracts/swipe-feedback.ts';
export type SwipeTransaction=Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export class DecisionResultDeletedError extends Error {constructor(){super('Результат подтверждённого решения удалён.');this.name='DecisionResultDeletedError';}}
export function dislikeRequestHash(sourceId:string,revision:string,intent:SwipeDislike):string {
 return createHash('sha256').update(JSON.stringify({decision:'DISLIKE',sourceId,sourceRevision:new Date(revision).toISOString(),inputMethod:intent.inputMethod})).digest('hex');
}
export async function readSwipeReceipt(tx:SwipeTransaction,userId:string,operationId:string,requestHash:string,decision:'LIKE'|'DISLIKE') {
 const [receipt]=await tx.select().from(swipeDecisionReceipts).where(and(eq(swipeDecisionReceipts.userId,userId),eq(swipeDecisionReceipts.operationId,operationId))).limit(1);
 if(receipt && (receipt.requestHash!==requestHash||receipt.decision!==decision)) throw new CreationConflictError();
 return receipt;
}
export async function captureSwipeSource(tx:SwipeTransaction,userId:string,source:typeof libraryItems.$inferSelect) {
 const media=await tx.select({id:libraryItemMedia.mediaId,type:mediaAssets.mimeType}).from(libraryItemMedia).innerJoin(mediaAssets,and(eq(mediaAssets.id,libraryItemMedia.mediaId),eq(mediaAssets.userId,userId))).where(eq(libraryItemMedia.libraryItemId,source.id)).orderBy(asc(libraryItemMedia.position));
 return {sourceId:source.id,sourceRevision:source.updatedAt,contentFingerprint:createHash('sha256').update(JSON.stringify({title:source.title?.trim()??null,text:source.bodyText.trim(),mediaIds:media.map(m=>m.id)})).digest('hex'),textLength:source.bodyText.length,mediaTypes:[...new Set(media.map(m=>m.type))].sort(),mediaCount:media.length};
}
export async function recordSwipeDecision(tx:SwipeTransaction,receipt:typeof swipeDecisionReceipts.$inferInsert) {
 await tx.insert(swipeDecisionReceipts).values(receipt);
 await tx.insert(swipeCurrentFeedback).values({userId:receipt.userId,sourceId:receipt.sourceId,operationId:receipt.operationId}).onConflictDoUpdate({target:[swipeCurrentFeedback.userId,swipeCurrentFeedback.sourceId],set:{operationId:receipt.operationId}});
}
export async function readSwipeFeedback(userId:string):Promise<SwipeFeedbackSnapshot> {
 return getDb().transaction(async tx=>{
  const currentRows=await tx.select().from(swipeCurrentFeedback).where(eq(swipeCurrentFeedback.userId,userId));
  const rows=await tx.select({receipt:swipeDecisionReceipts,sourceId:libraryItems.id,postId:posts.id}).from(swipeDecisionReceipts)
   .leftJoin(libraryItems,and(eq(libraryItems.id,swipeDecisionReceipts.sourceId),eq(libraryItems.userId,userId)))
   .leftJoin(posts,and(eq(posts.id,swipeDecisionReceipts.resultPostId),eq(posts.userId,userId)))
   .where(eq(swipeDecisionReceipts.userId,userId)).orderBy(asc(swipeDecisionReceipts.confirmedAt),asc(swipeDecisionReceipts.operationId));
  const currentIds=new Set(currentRows.map(r=>r.operationId));
  const receipts:SwipeDecisionMetadata[]=rows.map(({receipt:r,sourceId,postId})=>({operationId:r.operationId,sourceId:r.sourceId,sourceRevision:r.sourceRevision.toISOString(),contentFingerprint:r.contentFingerprint,textLength:r.textLength,mediaTypes:r.mediaTypes,mediaCount:r.mediaCount,decision:r.decision,origin:r.origin,inputMethod:r.inputMethod,confirmedAt:r.confirmedAt.toISOString(),providers:r.providers,scheduledAt:r.scheduledAt?.toISOString()??null,resultPostId:r.resultPostId,sourceDeleted:sourceId===null,resultDeleted:r.decision==='LIKE'?postId===null:sourceId===null}));
  const current=receipts.filter(r=>currentIds.has(r.operationId)),likes=current.filter(r=>r.decision==='LIKE').length,total=current.length;
  return {version:1,aggregate:{likes,dislikes:total-likes,total,likeRatio:total?likes/total:null},current,receipts};
 },{isolationLevel:'repeatable read',accessMode:'read only'});
}

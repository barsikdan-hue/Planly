import {createHash,randomUUID} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {ZodError} from 'zod';
import {libraryItems,posts,sharedFeedDecisions} from '../../db/schema.ts';
import {sharedFeedDecisionInputSchema,sharedFeedDecisionReceiptSchema,type SharedFeedDecisionResult} from '../contracts/shared-feed.ts';
import {sharedLibraryOperationKeySchema} from '../contracts/shared-library.ts';
import {savePostInputSchema} from '../contracts/planner.ts';
import {slotMinuteKey} from '../planner-slots.ts';
import {PublicationContentError} from '../publication-content.ts';
import {UnauthorizedError} from './auth/owner.ts';
import {ForbiddenError} from './auth/access.ts';
import type {AuthTransaction} from './auth/admin.ts';
import {copySharedLibrarySources,listSharedLibrary,lockSharedLibrarySource,recheckSharedLibraryActor,SharedLibraryError,withSharedLibraryActor} from './shared-library.ts';
import {getObjectStorage} from './storage.ts';
import {occupiedSlotMinutes,PlannerAccountUnavailableError,PlannerSlotConflictError,requirePlannerAccounts} from './planner-slots.ts';
import {validatePostRelations} from './post-relations.ts';
import {insertPostRelations} from './post-relations-insert.ts';
import {reconcilePostPublicationsInTx,type PublicationQueueChange} from './publications.ts';
import {applyPublicationQueueChanges} from './scheduler/reconcile.ts';
import {captureSwipeSource,recordSwipeDecision} from './swipe-feedback.ts';

type Stored=typeof sharedFeedDecisions.$inferSelect;
type Options={mirrorQueue?:(changes:PublicationQueueChange[])=>Promise<void>};
function failure(status:number,code:string,message:string):never{throw new SharedLibraryError(status,code,message);}
async function readStored(tx:AuthTransaction,userId:string,operationId:string){
 const [receipt]=await tx.select().from(sharedFeedDecisions).where(and(eq(sharedFeedDecisions.userId,userId),eq(sharedFeedDecisions.operationId,operationId)));
 return receipt;
}
async function replay(tx:AuthTransaction,userId:string,row:Stored,inputHash?:string):Promise<SharedFeedDecisionResult>{
 if(inputHash!==undefined&&row.inputHash!==inputHash)failure(409,'SHARED_FEED_OPERATION_CONFLICT','Operation was already used with different intent');
 if(row.decision==='LIKE'){
  // Same order as ordinary source deletion: personal source, then Post.
  const [item]=await tx.select({id:libraryItems.id}).from(libraryItems).where(and(eq(libraryItems.userId,userId),eq(libraryItems.id,row.personalItemId!))).for('share');
  const [post]=await tx.select({id:posts.id}).from(posts).where(and(eq(posts.userId,userId),eq(posts.id,row.postId!))).for('share');
  if(!item||!post)failure(410,'SHARED_FEED_RESULT_DELETED','The result of this decision was deleted');
 }
 return {receipt:sharedFeedDecisionReceiptSchema.parse({operationId:row.operationId,shareId:row.shareId,sourceRevision:row.sourceRevision.toISOString(),decision:row.decision,personalItemId:row.personalItemId,postId:row.postId,scheduledAt:row.scheduledAt?.toISOString()??null}),replayed:true};
}

export async function listSharedFeed(request:Request){
 const items=await listSharedLibrary(request);
 return withSharedLibraryActor(request,async(tx,userId)=>{
  const rows=await tx.select({shareId:sharedFeedDecisions.shareId,revision:sharedFeedDecisions.sourceRevision}).from(sharedFeedDecisions).where(eq(sharedFeedDecisions.userId,userId));
  const decided=new Set(rows.map(row=>`${row.shareId}/${row.revision.toISOString()}`));
  await recheckSharedLibraryActor(tx,request,userId);
  return items.filter(item=>!decided.has(`${item.id}/${item.updatedAt}`));
 });
}
export async function readSharedFeedDecision(request:Request,operationId:unknown):Promise<SharedFeedDecisionResult>{
 const key=sharedLibraryOperationKeySchema.parse(operationId);
 return withSharedLibraryActor(request,async(tx,userId)=>{
  const stored=await readStored(tx,userId,key);
  if(!stored)failure(404,'SHARED_FEED_RESULT_NOT_FOUND','Decision not found');
  const result=await replay(tx,userId,stored);
  await recheckSharedLibraryActor(tx,request,userId);
  return result;
 });
}

export async function commitSharedFeedDecision(request:Request,raw:unknown,options:Options={}):Promise<SharedFeedDecisionResult>{
 const input=sharedFeedDecisionInputSchema.parse(raw);
 const inputHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const destinations:string[]=[];
 let prepared=false,deadline:AbortSignal|undefined,changes:PublicationQueueChange[]=[];
 let result:SharedFeedDecisionResult;
 try{
  result=await withSharedLibraryActor(request,async(tx,userId)=>{
   // The displayed principal is a consent precondition, never an identity
   // selector. A replacement cookie must not approve an old tab's intent.
   if(input.expectedActorId!==userId)failure(409,'SHARED_FEED_ACTOR_CHANGED','Account changed; return to the account that reviewed this material');
   const historical=await readStored(tx,userId,input.operationId);
   if(historical){const saved=await replay(tx,userId,historical,inputHash);await recheckSharedLibraryActor(tx,request,userId);return saved;}
   const [decided]=await tx.select({id:sharedFeedDecisions.operationId}).from(sharedFeedDecisions).where(and(eq(sharedFeedDecisions.userId,userId),eq(sharedFeedDecisions.shareId,input.shareId),eq(sharedFeedDecisions.sourceRevision,new Date(input.sourceRevision))));
   if(decided)failure(409,'SHARED_FEED_ALREADY_DECIDED','This material revision already has a personal decision');
   const source=await lockSharedLibrarySource(tx,input.shareId);
   if(source.updatedAt.getTime()!==Date.parse(input.sourceRevision))failure(409,'SHARED_FEED_SOURCE_STALE','Shared material changed; review the current revision');
   await recheckSharedLibraryActor(tx,request,userId,false);
   let personalItemId:string|null=null,postId:string|null=null,scheduledAt:Date|null=null;
   if(input.decision==='LIKE'){
    const approval=input.approval;
    await requirePlannerAccounts(tx,userId,approval.providers,true);
    if(Date.parse(approval.scheduledAt)<Date.now()+60_000 || (await occupiedSlotMinutes(tx,userId,{providers:approval.providers})).has(slotMinuteKey(approval.scheduledAt)))throw new PlannerSlotConflictError();
    const [copy]=await copySharedLibrarySources(tx,userId,[source],destinations,()=>deadline=AbortSignal.timeout(60_000));
    const postInput=savePostInputSchema.parse({title:copy.title,baseText:copy.text,status:'READY',mediaIds:copy.mediaIds,targets:approval.providers.map(provider=>({provider,textOverride:null,scheduledAt:approval.scheduledAt}))});
    const accounts=await validatePostRelations(tx,userId,postInput);
    const [personal]=await tx.select().from(libraryItems).where(eq(libraryItems.id,copy.id));
    const snapshot=await captureSwipeSource(tx,userId,personal),now=new Date();
    if(Date.parse(approval.scheduledAt)<now.getTime()+60_000)throw new PlannerSlotConflictError();
    postId=randomUUID();personalItemId=copy.id;scheduledAt=new Date(approval.scheduledAt);
    // This operation has its own durable namespace; it does not reserve a key
    // belonging to the existing public Post/copy idempotency APIs.
    await tx.insert(posts).values({id:postId,userId,title:postInput.title,baseText:postInput.baseText,status:'READY',sourceLibraryItemId:copy.id,createdAt:now,updatedAt:now});
    await insertPostRelations(tx,postId,postInput,accounts,now);
    changes=await reconcilePostPublicationsInTx(tx,userId,postId);
    await tx.update(libraryItems).set({status:'USED',updatedAt:now}).where(eq(libraryItems.id,copy.id));
    // Personal feedback uses a private operation namespace; the shared receipt
    // remains the externally recoverable consent identity.
    await recordSwipeDecision(tx,{...snapshot,userId,operationId:randomUUID(),requestHash:inputHash,decision:'LIKE',origin:'swipe-planner',inputMethod:approval.inputMethod,confirmedAt:now,providers:approval.providers,scheduledAt,resultPostId:postId});
   }
   const [stored]=await tx.insert(sharedFeedDecisions).values({userId,operationId:input.operationId,inputHash,shareId:input.shareId,sourceRevision:new Date(input.sourceRevision),decision:input.decision,personalItemId,postId,scheduledAt}).returning();
   const saved=await replay(tx,userId,stored);
   await recheckSharedLibraryActor(tx,request,userId);
   deadline?.throwIfAborted();
   prepared=true;
   return {...saved,replayed:false};
  });
 }catch(error){
  let reconciled:SharedFeedDecisionResult|undefined,committed=false;
  if(prepared){
   // Failure of COMMIT acknowledgement is not evidence of rollback. Only a
   // successful authoritative receipt read permits deletion of copied bytes.
   try{
    reconciled=await withSharedLibraryActor(request,async(tx,userId)=>{
     if(input.expectedActorId!==userId)failure(409,'SHARED_FEED_ACTOR_CHANGED','Account changed; return to the account that reviewed this material');
     const stored=await readStored(tx,userId,input.operationId);
     if(!stored)return undefined;
     committed=true;
     const saved=await replay(tx,userId,stored,inputHash);
     await recheckSharedLibraryActor(tx,request,userId);
     return saved;
    });
   }catch(recoveryError){
    if(committed&&recoveryError instanceof SharedLibraryError&&recoveryError.status===410)throw recoveryError;
    failure(502,'SHARED_FEED_OUTCOME_UNKNOWN','Decision outcome is unknown; recover or retry the same operation');
   }
  }
  if(committed&&reconciled)result=reconciled;
  else{
   const cleanup=await Promise.allSettled(destinations.map(key=>getObjectStorage().delete(key,AbortSignal.timeout(30_000))));
   if(cleanup.some(row=>row.status==='rejected'))failure(502,'SHARED_FEED_CLEANUP_FAILED','Decision failed and storage cleanup is incomplete; retry the same operation');
   if(error instanceof SharedLibraryError || error instanceof UnauthorizedError || error instanceof ForbiddenError || error instanceof ZodError || error instanceof PublicationContentError || error instanceof PlannerAccountUnavailableError || error instanceof PlannerSlotConflictError)throw error;
   if(deadline?.aborted)failure(504,'SHARED_FEED_TIMEOUT','Storage copy exceeded 60 seconds; retry the same operation');
   failure(502,'SHARED_FEED_FAILED','The decision could not be saved; retry the same operation');
  }
 }
 if(changes.length){try{await (options.mirrorQueue??applyPublicationQueueChanges)(changes);}catch{/* Durable publications are recovered by existing scheduler reconciliation. */}}
 return result;
}

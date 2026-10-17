import {and,asc,eq,inArray,or} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {getDb} from '../../db/index.ts';
import {users,sessions,libraryItems,libraryItemMedia,mediaAssets,socialAccounts,socialBindings,posts,postTargets,publications,libraryBatchConsentOperations} from '../../db/schema.ts';
import {libraryBatchPreviewInputSchema,libraryBatchCommitInputSchema,libraryBatchOperationIdSchema,libraryBatchReceiptSchema,type LibraryBatchPreview,type LibraryBatchCommitResult,type LibraryBatchIntent,type LibraryBatchReceipt} from '../contracts/library-batch.ts';
import {fromDbProvider,type SavePostInput} from '../contracts/planner.ts';
import {canonicalLibraryBatchIntent} from '../library-batch.ts';
import {allocateDraftSlots,isSchedulingPlanSlot} from '../scheduling-plan.ts';
import {slotMinuteKey} from '../planner-slots.ts';
import {validatePublicationContent} from '../publication-content.ts';
import {sessionTokenHash} from './auth/session.ts';
import {getOwnerEmail} from './env.ts';
import {occupiedSlotMinutes,type Transaction} from './planner-slots.ts';
import {libraryBatchContentHash,libraryBatchRequestHash,libraryBatchSnapshotHash,type LibraryBatchSnapshot} from './library-batch-hash.ts';
import {signLibraryBatchPreview,verifyLibraryBatchPreview} from './library-batch-proof.ts';
import {socialConnectionConfig} from './social-connections/config.ts';
import {socialAccountDto} from './social-connections/metadata.ts';
import {getObjectStorage,type ObjectStorage} from './storage.ts';
import {schedulingMediaDto} from './scheduling-plan-snapshot.ts';
import {insertPostRelations} from './post-relations-insert.ts';
import {reconcilePostPublicationsInTx,type PublicationQueueChange} from './publications.ts';
import {applyPublicationQueueChanges} from './scheduler/reconcile.ts';

const statuses={BATCH_UNAUTHORIZED:401,BATCH_FORBIDDEN:403,BATCH_UNAVAILABLE:404,BATCH_RESULT_NOT_FOUND:404,BATCH_INVALID:422,BATCH_OPERATION_CONFLICT:409,BATCH_PREVIEW_STALE:409,BATCH_ACCOUNT_UNAVAILABLE:409,BATCH_CONTENT_INVALID:409,BATCH_SLOT_CONFLICT:409,BATCH_RESULT_DELETED:410,BATCH_RESULT_UNCERTAIN:503} as const;
export class LibraryBatchError extends Error {
 readonly code:keyof typeof statuses;readonly status:number;
 readonly result?:{operationId:string;postIds:string[]};
 constructor(code:keyof typeof statuses,result?:{operationId:string;postIds:string[]}){super(code);this.name='LibraryBatchError';this.code=code;this.status=statuses[code];this.result=result;}
}
function fail(code:keyof typeof statuses):never{throw new LibraryBatchError(code);}
export type LibraryBatchOptions={now?:()=>Date;storage?:Pick<ObjectStorage,'signedGetUrl'>;mirrorQueue?:(changes:PublicationQueueChange[])=>Promise<void>};
const instant=(options:LibraryBatchOptions)=>options.now?.()??new Date();
type Actor={user:typeof users.$inferSelect;session:typeof sessions.$inferSelect};
async function lockActor(tx:Transaction,rawToken:string,options:LibraryBatchOptions):Promise<Actor>{
 if(!rawToken) return fail('BATCH_UNAUTHORIZED');
 const hash=sessionTokenHash(rawToken);
 const [reference]=await tx.select({userId:sessions.userId}).from(sessions).where(eq(sessions.tokenHash,hash));
 if(!reference)return fail('BATCH_UNAUTHORIZED');
 const [user]=await tx.select().from(users).where(eq(users.id,reference.userId)).for('update');
 // Read independently after the user wait; a joined lookup can retain a deleted session.
 const [session]=await tx.select().from(sessions).where(and(eq(sessions.tokenHash,hash),eq(sessions.userId,reference.userId))).for('update');
 if(!user||!session)return fail('BATCH_UNAUTHORIZED');
 const actor={user,session};validateActor(actor,options);return actor;
}
function validateActor(actor:Actor,options:LibraryBatchOptions){
 if(!actor.user.authInitialized||actor.user.accessState!=='ACTIVE'||actor.user.sessionVersion!==actor.session.sessionVersion||actor.session.expiresAt.getTime()<=instant(options).getTime())fail('BATCH_UNAUTHORIZED');
}
function freshActor(actor:Actor){if(actor.user.role!=='USER'||actor.user.email===getOwnerEmail())fail('BATCH_FORBIDDEN');}
async function transaction<T>(run:(tx:Transaction)=>Promise<T>):Promise<T>{try{return await getDb().transaction(run);}catch(error){if(error instanceof LibraryBatchError)throw error;throw new LibraryBatchError('BATCH_RESULT_UNCERTAIN');}}
async function capture(tx:Transaction,actor:Actor,sourceIds:string[],accountIds:string[],options:LibraryBatchOptions){
 const userId=actor.user.id;
 const sources=await tx.select().from(libraryItems).where(and(eq(libraryItems.userId,userId),inArray(libraryItems.id,sourceIds))).orderBy(asc(libraryItems.id)).for('update');
 validateActor(actor,options);if(sources.length!==sourceIds.length)fail('BATCH_UNAVAILABLE');
 const attachments=await tx.select().from(libraryItemMedia).where(inArray(libraryItemMedia.libraryItemId,sourceIds)).orderBy(asc(libraryItemMedia.libraryItemId),asc(libraryItemMedia.position));
 const ids=[...new Set(attachments.map(a=>a.mediaId))];
 const media=ids.length?await tx.select().from(mediaAssets).where(and(eq(mediaAssets.userId,userId),inArray(mediaAssets.id,ids))).orderBy(asc(mediaAssets.id)).for('update'):[];
 validateActor(actor,options);if(media.length!==ids.length)fail('BATCH_UNAVAILABLE');
 const selected=await tx.select().from(socialAccounts).where(and(eq(socialAccounts.userId,userId),inArray(socialAccounts.id,accountIds))).orderBy(asc(socialAccounts.id)).for('update');
 validateActor(actor,options);if(selected.length!==accountIds.length)fail('BATCH_UNAVAILABLE');
 if(selected.some(a=>a.provider==='VK'))fail('BATCH_ACCOUNT_UNAVAILABLE');
 const accounts=selected as (typeof socialAccounts.$inferSelect & {provider:'TELEGRAM'|'MAX'})[];
 const bindings=await tx.select().from(socialBindings).where(inArray(socialBindings.accountId,accountIds)).orderBy(asc(socialBindings.accountId));
 const configs:LibraryBatchSnapshot['configs']=[];
 let available=true;
 for(const account of accounts){let revision:string;try{revision=socialConnectionConfig(account.provider).revision;}catch{available=false;continue;}configs.push({provider:account.provider,configRevision:revision});
 const binding=bindings.find(b=>b.accountId===account.id);
 if(!account.enabled||account.connectionStatus!=='CONNECTED'||!binding||binding.userId!==userId||binding.provider!==account.provider||binding.destinationId!==account.providerAccountId||binding.revision!==account.bindingRevision||binding.sessionVersion!==actor.user.sessionVersion||binding.configRevision!==revision)available=false;
 }
 const linked=await tx.select({id:posts.id,userId:posts.userId,sourceId:posts.sourceLibraryItemId}).from(posts).where(inArray(posts.sourceLibraryItemId,sourceIds));
 if(linked.some(p=>p.userId!==userId))fail('BATCH_UNAVAILABLE');
 const rows=sourceIds.map(id=>{const source=sources.find(s=>s.id===id)!;const attached=attachments.filter(a=>a.libraryItemId===id).map(a=>({asset:media.find(m=>m.id===a.mediaId)!,position:a.position}));return {source,attached,linkedPostId:linked.find(p=>p.sourceId===id)?.id??null};});
 return {sources,attachments,media,accounts,bindings,configs,available,rows};
}
type Capture=Awaited<ReturnType<typeof capture>>;
function fingerprint(actor:Actor,state:Capture,intentHash:string){return libraryBatchSnapshotHash({contractVersion:1,owner:actor.user,intentHash,sources:state.rows.map(r=>({...r.source,linkedPostId:r.linkedPostId})),attachments:state.attachments.map(a=>({sourceId:a.libraryItemId,mediaId:a.mediaId,position:a.position})),media:state.media,accounts:state.accounts,bindings:state.bindings as LibraryBatchSnapshot['bindings'],configs:state.configs});}
function content(row:Capture['rows'][number]){return libraryBatchContentHash({title:row.source.title,baseText:row.source.bodyText,media:row.attached.map(a=>({...a.asset,position:a.position}))});}
function issue(state:Capture,row:Capture['rows'][number]){
 if(row.source.status!=='READY'||row.linkedPostId)return 'SOURCE_INELIGIBLE' as const;
 if(!state.available)return 'ACCOUNT_UNAVAILABLE' as const;
 if(state.accounts.some(a=>validatePublicationContent(a.provider,row.source.bodyText,row.attached.map(m=>m.asset))))return 'CONTENT_INVALID' as const;
 return null;
}
export async function canPreviewLibraryBatch(rawToken:string,options:LibraryBatchOptions={}):Promise<boolean>{return transaction(async tx=>{const actor=await lockActor(tx,rawToken,options);validateActor(actor,options);return actor.user.role==='USER'&&actor.user.email!==getOwnerEmail();});}
export async function previewLibraryBatch(rawToken:string,raw:unknown,options:LibraryBatchOptions={}):Promise<LibraryBatchPreview>{
 const parsed=libraryBatchPreviewInputSchema.safeParse(raw);if(!parsed.success)fail('BATCH_INVALID');const input=parsed.data;
 return transaction(async tx=>{
 const actor=await lockActor(tx,rawToken,options);freshActor(actor);const state=await capture(tx,actor,input.sourceIds,input.accountIds,options);
 const rows:LibraryBatchPreview['rows']=state.rows.map(row=>({item:{id:row.source.id,title:row.source.title,text:row.source.bodyText,status:row.source.status,sourcePostId:row.linkedPostId,createdAt:row.source.createdAt.toISOString(),updatedAt:row.source.updatedAt.toISOString(),mediaIds:row.attached.map(a=>a.asset.id)},accounts:state.accounts.map(socialAccountDto),scheduledAt:null,issue:issue(state,row)}));
 if(rows.every(r=>!r.issue)){const providers=state.accounts.map(a=>fromDbProvider(a.provider));const allocated=allocateDraftSlots(input.sourceIds,{...input.settings,providers},await occupiedSlotMinutes(tx,actor.user.id,{providers}),instant(options));rows.forEach((row,i)=>{row.scheduledAt=allocated[i].scheduledAt;if(!row.scheduledAt)row.issue='NO_SLOT';});}
 const media:LibraryBatchPreview['media']=[];
 if(state.media.length){const storage=options.storage??getObjectStorage();for(const asset of state.media)media.push({...schedulingMediaDto(asset),previewUrl:await storage.signedGetUrl(asset.storageKey,300)});}
 validateActor(actor,options);
 if(rows.some(r=>r.issue||!r.scheduledAt))return {complete:false,descriptor:null,rows,media};
 const intent=canonicalLibraryBatchIntent({contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:input.settings,rows:state.rows.map((row,i)=>({sourceId:row.source.id,sourceRevision:row.source.updatedAt.toISOString(),contentHash:content(row),targets:state.accounts.map(a=>({accountId:a.id,provider:a.provider,destinationId:a.providerAccountId!,scheduledAt:rows[i].scheduledAt!}))}))});
 const requestHash=libraryBatchRequestHash(intent),snapshotFingerprint=fingerprint(actor,state,requestHash);
 const previewProof=signLibraryBatchPreview({ownerId:actor.user.id,requestHash,snapshotFingerprint},instant(options));
 validateActor(actor,options);return {complete:true,rows,media,descriptor:{intent,requestHash,snapshotFingerprint,previewProof}};
 });
}
async function historical(tx:Transaction,actor:Actor,operationId:string,options:LibraryBatchOptions,intent?:LibraryBatchIntent):Promise<LibraryBatchReceipt|null>{
 const [saved]=await tx.select().from(libraryBatchConsentOperations).where(and(eq(libraryBatchConsentOperations.userId,actor.user.id),eq(libraryBatchConsentOperations.operationId,operationId)));
 if(!saved)return null;
 // Corrupt persisted data is uncertain, never a fresh-admission opportunity.
 const receipt=libraryBatchReceiptSchema.parse(saved.receipt);
 const hash=libraryBatchRequestHash(saved.canonicalIntent);
 if(hash!==saved.requestHash||receipt.requestHash!==hash||receipt.operationId!==operationId||receipt.acceptedSnapshotFingerprint!==saved.acceptedSnapshotFingerprint||libraryBatchRequestHash({contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:saved.canonicalIntent.settings,rows:receipt.rows.map(({sourceId,sourceRevision,contentHash,targets})=>({sourceId,sourceRevision,contentHash,targets:targets.map(({accountId,provider,destinationId,scheduledAt})=>({accountId,provider,destinationId,scheduledAt}))}))})!==hash)throw new Error('Invalid receipt');
 if(intent&&libraryBatchRequestHash(intent)!==hash)fail('BATCH_OPERATION_CONFLICT');
 const ids=receipt.rows.map(r=>r.postId);
 const owned=await tx.select({id:posts.id}).from(posts).where(and(eq(posts.userId,actor.user.id),inArray(posts.id,ids))).orderBy(asc(posts.id)).for('share');
 validateActor(actor,options);
 if(owned.length!==ids.length)throw new LibraryBatchError('BATCH_RESULT_DELETED',{operationId,postIds:ids});
 return receipt;
}
export async function readLibraryBatchOperation(rawToken:string,operationId:string,options:LibraryBatchOptions={}):Promise<LibraryBatchCommitResult>{
 if(!libraryBatchOperationIdSchema.safeParse(operationId).success)fail('BATCH_INVALID');
 return transaction(async tx=>{const actor=await lockActor(tx,rawToken,options);const receipt=await historical(tx,actor,operationId,options);if(!receipt)fail('BATCH_RESULT_NOT_FOUND');validateActor(actor,options);return {receipt,replayed:true};});
}
export async function commitLibraryBatch(rawToken:string,raw:unknown,options:LibraryBatchOptions={}):Promise<LibraryBatchCommitResult>{
 const parsed=libraryBatchCommitInputSchema.safeParse(raw);if(!parsed.success)fail('BATCH_INVALID');const input=parsed.data,intent=canonicalLibraryBatchIntent(input.intent),requestHash=libraryBatchRequestHash(intent);
 const result=await transaction(async tx=>{
 const actor=await lockActor(tx,rawToken,options),saved=await historical(tx,actor,input.operationId,options,intent);
 if(saved){validateActor(actor,options);return {receipt:saved,replayed:true,changes:[] as PublicationQueueChange[]};}
 freshActor(actor);const state=await capture(tx,actor,intent.rows.map(r=>r.sourceId),intent.rows[0].targets.map(t=>t.accountId),options);
 for(let i=0;i<state.rows.length;i++){const row=state.rows[i],problem=issue(state,row);if(problem==='SOURCE_INELIGIBLE')fail('BATCH_PREVIEW_STALE');if(problem==='ACCOUNT_UNAVAILABLE')fail('BATCH_ACCOUNT_UNAVAILABLE');if(problem==='CONTENT_INVALID')fail('BATCH_CONTENT_INVALID');if(intent.rows[i].sourceRevision!==row.source.updatedAt.toISOString()||intent.rows[i].contentHash!==content(row))fail('BATCH_PREVIEW_STALE');for(const target of intent.rows[i].targets){const account=state.accounts.find(a=>a.id===target.accountId);if(!account||account.provider!==target.provider||account.providerAccountId!==target.destinationId)fail('BATCH_PREVIEW_STALE');}}
 const providers=state.accounts.map(a=>fromDbProvider(a.provider)),occupied=await occupiedSlotMinutes(tx,actor.user.id,{providers});
 const validateSlots=()=>{const reserved=new Set(occupied);for(const row of intent.rows){const at=row.targets[0].scheduledAt,key=slotMinuteKey(at);if(!isSchedulingPlanSlot(intent.settings,at)||Date.parse(at)<=instant(options).getTime()||reserved.has(key))fail('BATCH_SLOT_CONFLICT');reserved.add(key);}};
 validateSlots();
 const snapshotFingerprint=fingerprint(actor,state,requestHash);
 const validateProof=()=>{if(snapshotFingerprint!==input.snapshotFingerprint||!verifyLibraryBatchPreview(input.previewProof,{ownerId:actor.user.id,requestHash,snapshotFingerprint},instant(options)))fail('BATCH_PREVIEW_STALE');};
 validateProof();validateActor(actor,options);
 const confirmedAt=instant(options),receipt:LibraryBatchReceipt={contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',operationId:input.operationId,requestHash,acceptedSnapshotFingerprint:snapshotFingerprint,confirmedAt:confirmedAt.toISOString(),rows:[]},changes:PublicationQueueChange[]=[];
 const accountMap=new Map(state.accounts.map(a=>[a.provider,a.id]));
 for(let i=0;i<state.rows.length;i++){const row=state.rows[i],accepted=intent.rows[i],postId=randomUUID();const postInput:SavePostInput={title:row.source.title,baseText:row.source.bodyText,status:'READY',mediaIds:row.attached.map(a=>a.asset.id),targets:accepted.targets.map(t=>({provider:fromDbProvider(t.provider),textOverride:null,scheduledAt:t.scheduledAt}))};
 await tx.insert(posts).values({id:postId,userId:actor.user.id,title:postInput.title,baseText:postInput.baseText,status:'READY',sourceLibraryItemId:row.source.id,creationKey:null,creationInputHash:null,createdAt:confirmedAt,updatedAt:confirmedAt});
 await insertPostRelations(tx,postId,postInput,accountMap,confirmedAt);changes.push(...await reconcilePostPublicationsInTx(tx,actor.user.id,postId));
 const targets=await tx.select().from(postTargets).where(eq(postTargets.postId,postId));
 const graph=await tx.select().from(publications).where(or(eq(publications.postId,postId),inArray(publications.postTargetId,targets.map(t=>t.id))));
 if(targets.length!==accepted.targets.length||graph.length!==accepted.targets.length)throw new Error('Invalid admission graph');
 receipt.rows.push({...accepted,postId,targets:accepted.targets.map(t=>{
   const matches=targets.filter(target=>target.socialAccountId===t.accountId),target=matches[0];
   const histories=graph.filter(p=>p.postTargetId===target?.id),publication=histories[0],account=state.accounts.find(a=>a.id===t.accountId)!;
   if(matches.length!==1||!target.active||target.textOverride!==null||target.scheduledAt?.toISOString()!==t.scheduledAt||histories.length!==1||publication.userId!==actor.user.id||publication.postId!==postId||publication.provider!==t.provider||publication.status!=='SCHEDULED'||publication.attemptCount!==0||publication.scheduledAt?.toISOString()!==t.scheduledAt||publication.socialBindingRevision!==account.bindingRevision||publication.socialBindingDestinationId!==t.destinationId)throw new Error('Invalid admission graph');
   return {...t,targetId:target.id,publicationId:publication.id};
 })});
 await tx.update(libraryItems).set({status:'USED',updatedAt:confirmedAt}).where(and(eq(libraryItems.id,row.source.id),eq(libraryItems.userId,actor.user.id)));
 }
 libraryBatchReceiptSchema.parse(receipt);
 await tx.insert(libraryBatchConsentOperations).values({userId:actor.user.id,operationId:input.operationId,requestHash,canonicalIntent:intent,acceptedSnapshotFingerprint:snapshotFingerprint,receipt,createdAt:confirmedAt});
 // Fresh wall clock at callback exit, after every possible lock and write wait.
 validateActor(actor,options);validateSlots();validateProof();return {receipt,replayed:false,changes};
 });
 if(!result.replayed){try{await (options.mirrorQueue??applyPublicationQueueChanges)(result.changes);}catch{/* Durable receipt remains authoritative; scheduler reconstructs the mirror. */}}
 return {receipt:result.receipt,replayed:result.replayed};
}

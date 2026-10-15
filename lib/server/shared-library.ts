import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { libraryItems, libraryItemMedia, mediaAssets, sharedLibraryItems, sharedLibraryCopyReceipts, sessions, users } from '../../db/schema.ts';
import type { LibraryItemDto } from '../contracts/library.ts';
import { sharedLibraryCopyInputSchema, sharedLibraryOperationKeySchema, type SharedLibraryItemDto } from '../contracts/shared-library.ts';
import { requireApiOwner, requestCookie, UnauthorizedError } from './auth/owner.ts';
import { SESSION_COOKIE_NAME, sessionTokenHash } from './auth/session.ts';
import { withAdmin, type AuthTransaction } from './auth/admin.ts';
import { getObjectStorage, readMediaObjectBytes } from './storage.ts';
import { apiError, json } from './http.ts';

class SharedLibraryError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {super(message);this.status=status;this.code=code;}
}
function unavailable(): never {throw new SharedLibraryError(404,'SHARED_SOURCE_UNAVAILABLE','Shared material is unavailable');}
function corrupt(): never {throw new SharedLibraryError(409,'SHARED_SOURCE_INVALID','Shared material has invalid attachments');}
export function sharedLibraryApiError(error: unknown) {
  return error instanceof SharedLibraryError ? json({error:error.message,code:error.code},error.status) : apiError(error);
}

// User lifecycle first. Never lock the source administrator's user row: native
// source deletion takes that lock before the source and must remain acyclic.
async function withActor<T>(request: Request, work: (tx: AuthTransaction, userId: string)=>Promise<T>): Promise<T> {
  const actor = await requireApiOwner(request);
  return getDb().transaction(async tx=>{
    const [user] = await tx.select().from(users).where(eq(users.id,actor.id)).for('update');
    if(!user?.authInitialized || user.accessState!=='ACTIVE') throw new UnauthorizedError();
    const [session]=await tx.select({id:sessions.id}).from(sessions).where(and(
      eq(sessions.userId,user.id),eq(sessions.tokenHash,sessionTokenHash(requestCookie(request,SESSION_COOKIE_NAME)??'')),
      eq(sessions.sessionVersion,user.sessionVersion),gt(sessions.expiresAt,new Date()),
    )).limit(1);
    if(!session) throw new UnauthorizedError();
    return work(tx,user.id);
  });
}
type Source = typeof libraryItems.$inferSelect;
type Asset = typeof mediaAssets.$inferSelect;
async function lockSources(tx: AuthTransaction, ids: string[]): Promise<Source[]> {
  return ids.length ? tx.select().from(libraryItems).where(inArray(libraryItems.id,ids)).orderBy(asc(libraryItems.id)).for('update') : [];
}
async function loadMedia(tx: AuthTransaction, sources: Source[]): Promise<Map<string,Asset[]>> {
  const bySource = new Map(sources.map(s=>[s.id,[] as Asset[]]));
  if(!sources.length)return bySource;
  const links=await tx.select().from(libraryItemMedia).where(inArray(libraryItemMedia.libraryItemId,sources.map(s=>s.id))).orderBy(asc(libraryItemMedia.libraryItemId),asc(libraryItemMedia.position));
  if(links.length>sources.length*20)corrupt();
  const mediaIds=[...new Set(links.map(l=>l.mediaId))].sort();
  const assets=mediaIds.length?await tx.select().from(mediaAssets).where(inArray(mediaAssets.id,mediaIds)).orderBy(asc(mediaAssets.id)).for('update'):[];
  const byId=new Map(assets.map(a=>[a.id,a])), sourceById=new Map(sources.map(s=>[s.id,s]));
  for(const link of links){
    const source=sourceById.get(link.libraryItemId)!,asset=byId.get(link.mediaId),ordered=bySource.get(source.id)!;
    if(!asset || asset.userId!==source.userId || link.position!==ordered.length || ordered.length>=20 || !Number.isSafeInteger(asset.byteSize) || asset.byteSize<1 || asset.byteSize>20*1024*1024 || !/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(asset.mimeType))corrupt();
    ordered.push(asset);
  }
  return bySource;
}

export async function listSharedLibrary(request: Request): Promise<SharedLibraryItemDto[]> {
  return withActor(request,async tx=>{
    const initial=await tx.select().from(sharedLibraryItems);
    const sources=await lockSources(tx,initial.map(s=>s.sourceId));
    // Re-read publication membership after the source lock, so a preceding
    // unshare/delete cannot leave a stale preview response.
    const shares=await tx.select().from(sharedLibraryItems),shareBySource=new Map(shares.map(s=>[s.sourceId,s.id]));
    const ready=sources.filter(s=>s.status==='READY' && shareBySource.has(s.id));
    const attachments=await loadMedia(tx,ready);
    return Promise.all(ready.sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()||a.id.localeCompare(b.id)).map(async source=>({
      id:shareBySource.get(source.id)!,title:source.title,text:source.bodyText,updatedAt:source.updatedAt.toISOString(),
      media:await Promise.all(attachments.get(source.id)!.map(async a=>({name:a.originalName,mimeType:a.mimeType,previewUrl:await getObjectStorage().signedGetUrl(a.storageKey,300)}))),
    })));
  });
}
export async function listAdminSharedLibrary(request: Request): Promise<string[]> {
  return withAdmin(request,async(tx,userId)=>(await tx.select({sourceId:sharedLibraryItems.sourceId}).from(sharedLibraryItems)
    .innerJoin(libraryItems,eq(sharedLibraryItems.sourceId,libraryItems.id)).where(eq(libraryItems.userId,userId)).orderBy(asc(sharedLibraryItems.sourceId))).map(s=>s.sourceId));
}
export async function setLibraryShared(request: Request, sourceId: string, shared: boolean): Promise<void> {
  await withAdmin(request,async(tx,userId)=>{
    const [source]=await tx.select().from(libraryItems).where(and(eq(libraryItems.id,sourceId),eq(libraryItems.userId,userId))).for('update');
    if(!source)unavailable();
    if(shared){
      if(source.status!=='READY')throw new SharedLibraryError(409,'SHARED_SOURCE_NOT_READY','Only READY materials can be shared');
      await tx.insert(sharedLibraryItems).values({id:randomUUID(),sourceId}).onConflictDoNothing({target:sharedLibraryItems.sourceId});
    }else await tx.delete(sharedLibraryItems).where(eq(sharedLibraryItems.sourceId,sourceId));
  });
}
type CopyReceipt = typeof sharedLibraryCopyReceipts.$inferSelect;
async function replayCopyReceipt(tx: AuthTransaction,userId: string,receipt: CopyReceipt,inputHash: string): Promise<LibraryItemDto[]> {
  if(receipt.inputHash!==inputHash)throw new SharedLibraryError(409,'SHARED_COPY_KEY_CONFLICT','Copy key was already used with different selections');
  const results=await tx.select({id:libraryItems.id}).from(libraryItems).where(and(eq(libraryItems.userId,userId),inArray(libraryItems.id,receipt.items.map(i=>i.id)))).orderBy(asc(libraryItems.id)).for('update');
  if(results.length!==receipt.items.length)throw new SharedLibraryError(410,'SHARED_COPY_RESULT_DELETED','A copied material was deleted');
  return receipt.items;
}
export async function copySharedLibrary(request: Request, raw: unknown, operationKey: unknown): Promise<LibraryItemDto[]> {
  const input=sharedLibraryCopyInputSchema.parse(raw),key=sharedLibraryOperationKeySchema.parse(operationKey);
  const inputHash=createHash('sha256').update(JSON.stringify(input.ids)).digest('hex');
  const destinations:string[]=[];
  let preparedItems:LibraryItemDto[]|undefined;
  let storageDeadline:AbortSignal|undefined;
  try{
    return await withActor(request,async(tx,userId)=>{
      const [receipt]=await tx.select().from(sharedLibraryCopyReceipts).where(and(eq(sharedLibraryCopyReceipts.userId,userId),eq(sharedLibraryCopyReceipts.operationId,key)));
      if(receipt)return replayCopyReceipt(tx,userId,receipt,inputHash);
      const initial=await tx.select().from(sharedLibraryItems).where(inArray(sharedLibraryItems.id,input.ids));
      if(initial.length!==input.ids.length)unavailable();
      const sources=await lockSources(tx,initial.map(s=>s.sourceId));
      const shares=await tx.select().from(sharedLibraryItems).where(inArray(sharedLibraryItems.id,input.ids));
      if(shares.length!==input.ids.length || sources.length!==input.ids.length || sources.some(s=>s.status!=='READY'))unavailable();
      const sourceById=new Map(sources.map(s=>[s.id,s])),shareById=new Map(shares.map(s=>[s.id,s]));
      const media=await loadMedia(tx,sources),items:LibraryItemDto[]=[];
      // Count attachment occurrences, including assets reused by several sources.
      // Receipt replay stays first; admission is atomic and precedes any storage I/O.
      const attachments=[...media.values()].flat();
      if(attachments.length>20 || attachments.reduce((sum,asset)=>sum+asset.byteSize,0)>100*1024*1024)
        throw new SharedLibraryError(422,'SHARED_COPY_LIMIT_EXCEEDED','Copy at most 20 media files and 100 MiB per operation');
      storageDeadline=AbortSignal.timeout(60_000);
      for(const selectedId of input.ids){
        const source=sourceById.get(shareById.get(selectedId)!.sourceId)!;
        const id=randomUUID(),now=new Date(),mediaIds:string[]=[];
        await tx.insert(libraryItems).values({id,userId,title:source.title,bodyText:source.bodyText,status:'READY',createdAt:now,updatedAt:now});
        for(const asset of media.get(source.id)!){
          storageDeadline.throwIfAborted();
          const bytes=await readMediaObjectBytes(asset.storageKey,asset.byteSize,storageDeadline);
          if(createHash('sha256').update(bytes).digest('hex')!==asset.checksum)throw new Error('Media checksum mismatch');
          const mediaId=randomUUID(),ownerPrefix=createHash('sha256').update(userId).digest('hex').slice(0,16);
          const storageKey=`users/${ownerPrefix}/${randomUUID()}`;
          // Register BEFORE PUT: an interrupted response can follow a successful write.
          storageDeadline.throwIfAborted();
          destinations.push(storageKey);
          await getObjectStorage().put(storageKey,bytes,asset.mimeType,storageDeadline);
          storageDeadline.throwIfAborted();
          await tx.insert(mediaAssets).values({...asset,id:mediaId,userId,storageKey,createdAt:now,updatedAt:now});
          await tx.insert(libraryItemMedia).values({libraryItemId:id,mediaId,position:mediaIds.length});mediaIds.push(mediaId);
        }
        items.push({id,title:source.title,text:source.bodyText,status:'READY',mediaIds,sourcePostId:null,createdAt:now.toISOString(),updatedAt:now.toISOString()});
      }
      storageDeadline.throwIfAborted();
      await tx.insert(sharedLibraryCopyReceipts).values({userId,operationId:key,inputHash,items});
      preparedItems=items;
      return items;
    });
  }catch(error){
    let reconciled:LibraryItemDto[]|undefined,replayError:SharedLibraryError|undefined,committed=false;
    if(preparedItems){
      // A rejected COMMIT response does not prove rollback. Reacquiring the
      // actor lock waits for the first transaction to finish before reading its
      // durable receipt. Never delete objects while that outcome is unknown.
      try{
        await withActor(request,async(tx,userId)=>{
          const [receipt]=await tx.select().from(sharedLibraryCopyReceipts).where(and(eq(sharedLibraryCopyReceipts.userId,userId),eq(sharedLibraryCopyReceipts.operationId,key)));
          if(!receipt)return;
          committed=receipt.items.length===preparedItems!.length && receipt.items.every((item,i)=>item.id===preparedItems![i].id);
          try{reconciled=await replayCopyReceipt(tx,userId,receipt,inputHash);}
          catch(failure){if(failure instanceof SharedLibraryError)replayError=failure;else throw failure;}
        });
      }catch{
        throw new SharedLibraryError(502,'SHARED_COPY_OUTCOME_UNKNOWN','Copy outcome is unknown; retry the same selections with the same key');
      }
      if(committed){if(replayError)throw replayError;return reconciled!;}
    }
    const cleanup=await Promise.allSettled(destinations.map(key=>getObjectStorage().delete(key,AbortSignal.timeout(30_000))));
    if(cleanup.some(r=>r.status==='rejected'))throw new SharedLibraryError(502,'SHARED_COPY_CLEANUP_FAILED','Copy failed and storage cleanup could not be completed');
    if(replayError)throw replayError;
    if(reconciled)return reconciled;
    if(error instanceof SharedLibraryError || error instanceof UnauthorizedError)throw error;
    // All storage/DB failure details remain private; no keys, signed URLs or
    // upstream error messages enter the response or console.
    const {ForbiddenError}=await import('./auth/access.ts');
    if(error instanceof ForbiddenError)throw error;
    if(storageDeadline?.aborted)throw new SharedLibraryError(504,'SHARED_COPY_TIMEOUT','Storage copy exceeded 60 seconds; retry with the same key');
    throw new SharedLibraryError(502,'SHARED_COPY_FAILED','The selected materials could not be copied');
  }
}

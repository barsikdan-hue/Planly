import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { posts, postTargets, socialAccounts, mediaAssets, postMedia, publications } from '../../db/schema.ts';
import type { Transaction } from './planner-slots.ts';
import { fromDbProvider, type PostDto, type SocialAccountDto, type MediaAssetDto } from '../contracts/planner.ts';
import type { SchedulingIssue } from '../contracts/scheduling-plan.ts';
import { validatePublicationContent } from '../publication-content.ts';
type PostRow=typeof posts.$inferSelect;type TargetRow=typeof postTargets.$inferSelect;type AccountRow=typeof socialAccounts.$inferSelect;type MediaRow=typeof mediaAssets.$inferSelect;type PublicationRow=typeof publications.$inferSelect;
export type SchedulingSnapshot={post:PostRow;targets:{target:TargetRow;account:AccountRow}[];media:{asset:MediaRow;position:number}[];history:PublicationRow[]};
export async function readSchedulingSnapshots(tx:Transaction,userId:string,postIds:readonly string[]):Promise<SchedulingSnapshot[]> {
  const ids=[...postIds];
  const owned=await tx.select().from(posts).where(and(eq(posts.userId,userId),inArray(posts.id,ids)));
  if(owned.length!==ids.length)throw new Error('Post not found');
  const targets=await tx.select({target:postTargets,account:socialAccounts}).from(postTargets).innerJoin(socialAccounts,eq(postTargets.socialAccountId,socialAccounts.id)).where(inArray(postTargets.postId,ids)).orderBy(asc(postTargets.id));
  if(targets.some(row=>row.account.userId!==userId))throw new Error('Post not found');
  const attached=await tx.select({postId:postMedia.postId,asset:mediaAssets,position:postMedia.position}).from(postMedia).innerJoin(mediaAssets,eq(postMedia.mediaId,mediaAssets.id)).where(inArray(postMedia.postId,ids)).orderBy(asc(postMedia.position));
  if(attached.some(row=>row.asset.userId!==userId))throw new Error('Post not found');
  const history=await tx.select().from(publications).where(inArray(publications.postId,ids));
  return ids.map(id=>({post:owned.find(row=>row.id===id)!,targets:targets.filter(row=>row.target.postId===id),media:attached.filter(row=>row.postId===id).map(({asset,position})=>({asset,position})),history:history.filter(row=>row.postId===id)}));
}
export function schedulingEligibility(snapshot:SchedulingSnapshot):SchedulingIssue|null {
  const active=snapshot.targets.filter(row=>row.target.active);
  if(snapshot.post.status!=='DRAFT'||snapshot.history.length||!active.length||active.some(row=>row.account.provider==='VK'||row.target.scheduledAt!==null))return 'POST_INELIGIBLE';
  if(active.some(row=>!row.account.enabled||row.account.connectionStatus!=='CONNECTED'||row.account.userId!==snapshot.post.userId))return 'ACCOUNT_UNAVAILABLE';
  if(active.some(row=>validatePublicationContent(row.account.provider,row.target.textOverride??snapshot.post.baseText,snapshot.media.map(row=>row.asset))))return 'CONTENT_INVALID';
  return null;
}
export function fingerprintSchedulingSnapshot(snapshot:SchedulingSnapshot):string {
  const post=snapshot.post;
  const data={post:{id:post.id,title:post.title,baseText:post.baseText,status:post.status,updatedAt:post.updatedAt.toISOString()},
    targets:snapshot.targets.filter(row=>row.target.active).map(({target,account})=>({id:target.id,accountId:target.socialAccountId,active:target.active,textOverride:target.textOverride,scheduledAt:target.scheduledAt?.toISOString()??null,updatedAt:target.updatedAt.toISOString(),account:{id:account.id,provider:account.provider,providerAccountId:account.providerAccountId,displayName:account.displayName,enabled:account.enabled,connectionStatus:account.connectionStatus,updatedAt:account.updatedAt.toISOString()}})),
    media:snapshot.media.map(({asset,position})=>({id:asset.id,position,storageKey:asset.storageKey,checksum:asset.checksum,mimeType:asset.mimeType,byteSize:asset.byteSize,width:asset.width,height:asset.height,durationMs:asset.durationMs,updatedAt:asset.updatedAt.toISOString()}))};
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
export function schedulingPostDto(snapshot:SchedulingSnapshot):PostDto {
  return {id:snapshot.post.id,title:snapshot.post.title,baseText:snapshot.post.baseText,status:snapshot.post.status,createdAt:snapshot.post.createdAt.toISOString(),updatedAt:snapshot.post.updatedAt.toISOString(),mediaIds:snapshot.media.map(row=>row.asset.id),
    targets:snapshot.targets.filter(row=>row.target.active).map(({target,account})=>({id:target.id,socialAccountId:account.id,provider:fromDbProvider(account.provider),textOverride:target.textOverride,scheduledAt:target.scheduledAt?.toISOString()??null}))};
}
export function schedulingAccountDto(account:AccountRow):SocialAccountDto{return {id:account.id,provider:fromDbProvider(account.provider),providerAccountId:account.providerAccountId,displayName:account.displayName,enabled:account.enabled,connectionStatus:account.connectionStatus};}
export function schedulingMediaDto(asset:MediaRow):MediaAssetDto{return {id:asset.id,originalName:asset.originalName,mimeType:asset.mimeType,byteSize:asset.byteSize,width:asset.width,height:asset.height,durationMs:asset.durationMs,source:asset.source,createdAt:asset.createdAt.toISOString()};}

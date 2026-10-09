import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { users, posts, postTargets, socialAccounts, publications, mediaAssets, postMedia } from '../../db/schema.ts';
export const owner = 'scheduling-owner', other = 'scheduling-other';
export const settings = {startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[1,2,3,4,5,6,7],times:['10:00','18:00']};
export const now = new Date('2029-12-31T00:00Z');
export const noMirror = {mirrorQueue:async()=>undefined,now:()=>now};
export const fakeSigningStorage = {signedGetUrl:async(key:string)=>`https://private.example.test/${key}`};
export async function addSchedulingDraft(id:string, providers:('TELEGRAM'|'MAX'|'VK')[]=['TELEGRAM'], who=owner) {
  const db=getDb(); await db.insert(posts).values({id,userId:who,baseText:`Text ${id}`,title:`Title ${id}`});
  if(providers.length) await db.insert(postTargets).values(providers.map(provider=>({id:`${id}-${provider}`,postId:id,socialAccountId:`${who}-${provider}`,textOverride:`Override ${id} ${provider}`})));
}
export async function seedSchedulingFixture() {
  const db=getDb(); await db.delete(users);
  await db.insert(users).values([{id:owner,email:process.env.OWNER_EMAIL??'owner@example.test',displayName:'Owner'},{id:other,email:'other@example.test',displayName:'Other'}]);
  await db.insert(socialAccounts).values([owner,other].flatMap(userId=>['TELEGRAM','MAX','VK'].map(provider=>({id:`${userId}-${provider}`,userId,provider:provider as 'TELEGRAM'|'MAX'|'VK',displayName:provider,providerAccountId:`destination-${userId}-${provider}`,enabled:true,connectionStatus:'CONNECTED' as const}))));
  await addSchedulingDraft('a'); await addSchedulingDraft('b',['MAX']); await addSchedulingDraft('foreign',['TELEGRAM'],other);
  await db.insert(mediaAssets).values(['m1','m2','unrelated'].map(id=>({id,userId:owner,storageKey:id,originalName:`${id}.png`,mimeType:'image/png',byteSize:100,checksum:id,width:100,height:100})));
}
export async function schedulingCounts(who:string) {
  const db=getDb(); return {posts:(await db.select().from(posts).where(eq(posts.userId,who))).length,
    targets:(await db.select().from(postTargets).innerJoin(posts,eq(postTargets.postId,posts.id)).where(eq(posts.userId,who))).length,
    publications:(await db.select().from(publications).where(eq(publications.userId,who))).length};
}
export async function cleanupSchedulingFixture() { await getDb().delete(users).where(inArray(users.id,[owner,other])); }
export async function attachSchedulingMedia(postId:string, ids=['m2','m1']) { await getDb().insert(postMedia).values(ids.map((mediaId,position)=>({postId,mediaId,position}))); }
export async function addSchedulingHistory(postId:string,status:'SCHEDULED'|'QUEUED'|'PUBLISHING'|'PUBLISHED'|'FAILED'|'CANCELLED'|'REQUIRES_RECONNECT'='SCHEDULED', scheduledAt=new Date('2030-01-01T07:00:00Z')) {
  const [target]=await getDb().select().from(postTargets).where(and(eq(postTargets.postId,postId),eq(postTargets.active,true)));
  await getDb().insert(publications).values({id:`history-${postId}`,userId:owner,postId,postTargetId:target.id,provider:target.socialAccountId.endsWith('MAX')?'MAX':'TELEGRAM',status,scheduledAt,idempotencyKey:`history-${postId}`});
}

import { getDb } from '../../db/index.ts';
import { users, posts, publications, socialAccounts, postTargets } from '../../db/schema.ts';

export async function analyticsFixture() {
  const db=getDb();
  await db.delete(users);
  await db.insert(users).values([{id:'a',email:'owner@example.test',displayName:'A'},{id:'b',email:'b@example.test',displayName:'B'}]);
  await db.insert(socialAccounts).values(['a','b'].flatMap(userId=>['TELEGRAM','MAX'].map(provider=>({id:`${userId}-${provider}`,userId,provider:provider as 'TELEGRAM'|'MAX',displayName:provider,providerAccountId:provider==='TELEGRAM'?'-100123456':'123',enabled:true,connectionStatus:'CONNECTED' as const}))));
}
export async function analyticsPublication(id:string, options:{owner?:string;provider?:'TELEGRAM'|'MAX';value?:number;remoteId?:string;publishedAt?:Date;destination?:string|null;status?:'PUBLISHED'|'SCHEDULED'}={}) {
  const {owner='a',provider='MAX'}=options;
  const db=getDb();
  await db.insert(posts).values({id,userId:owner,baseText:`Post ${id}`,status:'READY'});
  await db.insert(postTargets).values({id:`t-${id}`,postId:id,socialAccountId:`${owner}-${provider}`});
  await db.insert(publications).values({id,userId:owner,postId:id,postTargetId:`t-${id}`,provider,status:options.status??'PUBLISHED',publishedAt:options.publishedAt??new Date('2026-10-07T12:00:00Z'),providerRemoteId:options.remoteId??(provider==='TELEGRAM'?'31':'mid_42'),providerUrl:provider==='TELEGRAM'?'https://t.me/channel_name/31':null,analyticsDestinationId:options.destination===undefined?(provider==='TELEGRAM'?'-100123456':'123'):options.destination,idempotencyKey:`key-${id}`});
}

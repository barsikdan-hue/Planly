import {and,eq,sql} from 'drizzle-orm';
import {getDb} from '../../../db/index.ts';
import {posts,postTargets,publications,socialAccounts,users} from '../../../db/schema.ts';
import {getOwnerAuthEnv} from '../env.ts';
import {isCount,record,numericDestination} from '../../analytics.ts';
import {publicationIdentity,saveObservation} from './repository.ts';
export class ReactionInputError extends Error {constructor(){super('Invalid reaction aggregate');} }
export type ReactionAggregate={updateId:number;destinationId:string;messageId:string;eventAt:Date;total:number};
export function parseReactionCountUpdate(input:unknown):ReactionAggregate|null {
  const update=record(input);
  if(!update||!Object.hasOwn(update,'message_reaction_count'))return null;
  const event=record(update.message_reaction_count);const chat=record(event?.chat);
  if(!isCount(update.update_id)||chat?.type!=='channel'||typeof chat.id!=='number'||!numericDestination(String(chat.id))||chat.id>=0||!isCount(event?.message_id)||event!.message_id===0||!isCount(event?.date)||!Array.isArray(event?.reactions)||event.reactions.length>1000)throw new ReactionInputError();
  const date=new Date(event.date*1000);if(!Number.isFinite(date.getTime()))throw new ReactionInputError();
  const seen=new Set<string>();let total=0;
  for(const entry of event.reactions){
    const item=record(entry);const type=record(item?.type);let key:string;
    if(type?.type==='paid')key='paid';
    else if(type?.type==='emoji'&&typeof type.emoji==='string'&&type.emoji.length>0&&type.emoji.length<=128)key=`emoji:${type.emoji}`;
    else if(type?.type==='custom_emoji'&&typeof type.custom_emoji_id==='string'&&type.custom_emoji_id.length>0&&type.custom_emoji_id.length<=128)key=`custom:${type.custom_emoji_id}`;
    else throw new ReactionInputError();
    if(seen.has(key)||!isCount(item?.total_count))throw new ReactionInputError();seen.add(key);total+=item.total_count;if(!isCount(total))throw new ReactionInputError();
  }
  return {updateId:update.update_id,destinationId:String(chat.id),messageId:String(event.message_id),eventAt:date,total};
}
export async function ingestTelegramReaction(update:ReactionAggregate,now=new Date()):Promise<'APPLIED'|'IGNORED'> {
  const {OWNER_EMAIL}=getOwnerAuthEnv();
  return getDb().transaction(async tx=>{
    const rows=await tx.select({publication:publications,account:socialAccounts,email:users.email}).from(publications)
      .innerJoin(postTargets,eq(postTargets.id,publications.postTargetId)).innerJoin(socialAccounts,eq(socialAccounts.id,postTargets.socialAccountId))
      .innerJoin(posts,and(eq(posts.id,publications.postId),eq(posts.userId,publications.userId))).innerJoin(users,eq(users.id,publications.userId))
      .where(and(eq(publications.provider,'TELEGRAM'),eq(publications.status,'PUBLISHED'),eq(sql<string>`split_part(${publications.providerRemoteId},',',1)`,update.messageId),eq(socialAccounts.provider,'TELEGRAM'),eq(socialAccounts.userId,publications.userId),eq(socialAccounts.enabled,true),eq(socialAccounts.connectionStatus,'CONNECTED'),eq(socialAccounts.providerAccountId,update.destinationId)));
    const matches=rows.filter(({publication})=>{const identity=publicationIdentity(publication);return identity?.destinationId===update.destinationId&&identity.remoteId===update.messageId;});
    if(matches.length!==1||matches[0].email!==OWNER_EMAIL)return 'IGNORED';
    const row=matches[0];if(!row.publication.publishedAt||Math.floor(row.publication.publishedAt.getTime()/1000)>update.eventAt.getTime()/1000)return 'IGNORED';
    const saved=await saveObservation(tx,{userId:row.publication.userId,publicationId:row.publication.id,accountId:row.account.id,destinationId:update.destinationId,remoteMessageId:update.messageId,metric:'reactions',value:update.total,observedAt:now,providerEventAt:update.eventAt,updateId:update.updateId});
    return saved?'APPLIED':'IGNORED';
  });
}

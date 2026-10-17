import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { posts, postTargets, publications, socialAccounts, socialBindings } from '../../../db/schema.ts';
import { sessionTokenHash } from '../auth/session.ts';
import { createTelegramConnector } from '../connectors/telegram.ts';
import { createMaxConnector } from '../connectors/max.ts';
import { socialConnectionConfig } from './config.ts';
import { connectionDenied, invalidateConnectionIntents, lockConnectionActor, lockOwnedConnectionAccount, lockProviderDestinations, SocialConnectionError, type ConnectionTransaction } from './state.ts';

// The user lock serializes this read with every new approval/admission. History
// is preserved, including receipts and uncertain outcomes needing manual recovery.
export async function requireEmptyConnectionQueue(tx:ConnectionTransaction,accountId:string) {
  const targets=await tx.select({target:postTargets,post:posts}).from(postTargets)
    .innerJoin(posts,eq(posts.id,postTargets.postId)).where(eq(postTargets.socialAccountId,accountId));
  for(const {target,post} of targets) {
    const history=await tx.select().from(publications).where(eq(publications.postTargetId,target.id));
    if(history.some(p=>['SCHEDULED','QUEUED','PUBLISHING','REQUIRES_RECONNECT'].includes(p.status) || p.providerErrorCode==='AMBIGUOUS_DELIVERY'))throw new SocialConnectionError('CONFLICT');
    if(post.status==='READY' && target.active && target.scheduledAt && !history.some(p=>p.status==='PUBLISHED' && p.providerRemoteId))throw new SocialConnectionError('CONFLICT');
  }
}

export function createSocialConnectionLifecycle(options:{now?:()=>number;fetcher?:typeof fetch}={}) {
  const now=options.now??Date.now,db=getDb();
  async function context(tx:ConnectionTransaction,raw:string,id:string,revision:number) {
    if(!raw || raw.length>4096 || !Number.isSafeInteger(revision) || revision<0)return connectionDenied();
    const actor=await lockConnectionActor(tx,sessionTokenHash(raw),now);
    const account=await lockOwnedConnectionAccount(tx,actor,id,now);
    if(account.bindingRevision!==revision)return connectionDenied();
    return {actor,account};
  }
  async function proven(tx:ConnectionTransaction,raw:string,id:string,revision:number) {
    const ctx=await context(tx,raw,id,revision),{account,actor}=ctx;
    const config=socialConnectionConfig(account.provider as 'TELEGRAM'|'MAX');
    const [binding]=await tx.select().from(socialBindings).where(eq(socialBindings.accountId,id));
    if(!binding || binding.userId!==actor.userId || binding.provider!==account.provider || binding.destinationId!==account.providerAccountId || binding.revision!==revision || binding.sessionVersion!==actor.sessionVersion || binding.configRevision!==config.revision)return connectionDenied();
    return {...ctx,binding,config};
  }
  return {
    async pause(raw:string,id:string,revision:number) {
      return db.transaction(async tx=>{
        await context(tx,raw,id,revision);
        await invalidateConnectionIntents(tx,id);
        await tx.update(socialAccounts).set({enabled:false,updatedAt:new Date(now())}).where(eq(socialAccounts.id,id));
        return {accountId:id,bindingRevision:revision,enabled:false};
      });
    },
    async enable(raw:string,id:string,revision:number) {
      const snapshot=await db.transaction(tx=>proven(tx,raw,id,revision)),checkedAt=now();
      const connector=snapshot.account.provider==='TELEGRAM'?createTelegramConnector({token:snapshot.config.token,fetcher:options.fetcher}):createMaxConnector({token:snapshot.config.token,fetcher:options.fetcher});
      const control=await connector.validateControl(snapshot.binding.destinationId,snapshot.binding.humanId);
      if(!control.ok || control.destinationId!==snapshot.binding.destinationId || control.humanId!==snapshot.binding.humanId || control.botId!==snapshot.binding.botId)throw new SocialConnectionError('CONTROL_FAILED');
      return db.transaction(async tx=>{
        const current=await proven(tx,raw,id,revision);
        if(now()<checkedAt || now()-checkedAt>30000 || current.actor.sessionId!==snapshot.actor.sessionId || current.account.connectionGeneration!==snapshot.account.connectionGeneration || current.config.revision!==snapshot.config.revision || current.binding.humanId!==snapshot.binding.humanId || current.binding.botId!==snapshot.binding.botId || current.binding.destinationId!==snapshot.binding.destinationId)return connectionDenied();
        await tx.update(socialAccounts).set({enabled:true,connectionStatus:'CONNECTED',updatedAt:new Date(now())}).where(eq(socialAccounts.id,id));
        return {accountId:id,bindingRevision:revision,enabled:true};
      });
    },
    async release(raw:string,id:string,revision:number) {
      return db.transaction(async tx=>{
        const {actor,account}=await context(tx,raw,id,revision);
        await requireEmptyConnectionQueue(tx,id);
        await lockProviderDestinations(tx,account.provider as 'TELEGRAM'|'MAX');
        if(actor.sessionExpiresAt<=now())return connectionDenied();
        await invalidateConnectionIntents(tx,id);
        await tx.delete(socialBindings).where(and(eq(socialBindings.accountId,id),eq(socialBindings.userId,actor.userId)));
        await tx.update(socialAccounts).set({enabled:false,connectionStatus:'DISCONNECTED',providerAccountId:null,bindingRevision:revision+1,updatedAt:new Date(now())}).where(eq(socialAccounts.id,id));
        return {accountId:id,bindingRevision:revision+1,enabled:false};
      });
    },
  };
}

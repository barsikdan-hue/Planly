import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { sessions, socialAccounts, socialBindings, socialConnectionIntents, socialConnectionReceipts, socialProofRateLimits, type SocialConnectionReceipt } from '../../../db/schema.ts';
import { sessionTokenHash } from '../auth/session.ts';
import { createTelegramConnector } from '../connectors/telegram.ts';
import { createMaxConnector } from '../connectors/max.ts';
import { socialConnectionConfig as setup } from './config.ts';
import { verifyTelegramLaunch, verifyMaxLaunch } from './launch.ts';
import { SocialConnectionError, connectionDenied, lockConnectionActor, lockOwnedConnectionAccount, invalidateConnectionIntents, lockProviderDestinations, assertDestinationAvailable, isCanonicalDestination, type ConnectionActor, type ConnectionTransaction } from './state.ts';

export { SocialConnectionError } from './state.ts';
type Provider = 'TELEGRAM'|'MAX';
type Intent = typeof socialConnectionIntents.$inferSelect;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const credential=()=>randomBytes(32).toString('base64url');
const ttl=300000;
export function getSocialConnectionReadiness(provider:Provider) {
  try {setup(provider);return {available:true as const};}
  catch {return {available:false as const,message:'Подключение пока недоступно. Администратору нужно настроить Mini App и бота.'};}
}
function tokenDigest(raw:string) {
  if(typeof raw!=='string' || !raw || raw.length>4096) return connectionDenied();
  return sessionTokenHash(raw);
}
function ticketDigest(raw:string) {
  if(typeof raw!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return connectionDenied();
  return digest(raw);
}
function current(intent:Intent,actor:ConnectionActor,account:typeof socialAccounts.$inferSelect,now:number,config:string) {
  if(actor.sessionExpiresAt<=now || intent.userId!==actor.userId || intent.sessionId!==actor.sessionId || intent.sessionVersion!==actor.sessionVersion || intent.accountId!==account.id || intent.provider!==account.provider || intent.generation!==account.connectionGeneration || intent.bindingRevision!==account.bindingRevision || intent.configRevision!==config || intent.expiresAt.getTime()<=now) return connectionDenied();
}
function candidate(intent:Intent,now:number) {
  if(!intent.humanId || !intent.authDate || !intent.ticketExpiresAt || intent.ticketExpiresAt.getTime()<=now || now-intent.authDate.getTime()>ttl || intent.authDate.getTime()-now>30000) return connectionDenied();
}
function consent(intent:Intent,actor:ConnectionActor) {
  return {operationId:intent.id,accountId:intent.accountId,provider:intent.provider as Provider,planlyName:actor.displayName,destinationId:intent.destinationId,destinationName:intent.destinationName,humanId:intent.humanId!,humanName:intent.humanName??'',expiresAt:intent.ticketExpiresAt!.toISOString()};
}

export function createSocialConnectionService(options:{now?:()=>number;fetcher?:typeof fetch}={}) {
  const now=options.now??Date.now, db=getDb();
  const connector=(provider:Provider,token:string)=>provider==='TELEGRAM'?createTelegramConnector({token,fetcher:options.fetcher}):createMaxConnector({token,fetcher:options.fetcher});
  async function ticketContext(tx:ConnectionTransaction,rawSession:string,rawTicket:string) {
    const hash=ticketDigest(rawTicket), actor=await lockConnectionActor(tx,tokenDigest(rawSession),now);
    const [receipt]=await tx.select().from(socialConnectionReceipts).where(eq(socialConnectionReceipts.ticketHash,hash));
    const [hint]=await tx.select().from(socialConnectionIntents).where(eq(socialConnectionIntents.ticketHash,hash));
    const accountId=receipt?.accountId??hint?.accountId;
    if(!accountId) return connectionDenied();
    const account=await lockOwnedConnectionAccount(tx,actor,accountId,now),config=setup(account.provider as Provider);
    if(receipt) {
      if(receipt.userId!==actor.userId || receipt.sessionId!==actor.sessionId || receipt.sessionVersion!==actor.sessionVersion || receipt.generation!==account.connectionGeneration || receipt.configRevision!==config.revision || receipt.receipt.bindingRevision!==account.bindingRevision) return connectionDenied();
      return {actor,account,config,receipt:receipt.receipt,intent:undefined};
    }
    const [intent]=await tx.select().from(socialConnectionIntents).where(eq(socialConnectionIntents.id,hint!.id)).for('update');
    if(!intent || !['CANDIDATE','VERIFYING'].includes(intent.state)) return connectionDenied();
    current(intent,actor,account,now(),config.revision);candidate(intent,now());
    return {actor,account,config,intent,receipt:undefined};
  }
  async function closeFailed(intent:Intent) {
    // CAS only: an old error never modifies the new generation/account state.
    await db.update(socialConnectionIntents).set({state:'FAILED'}).where(and(eq(socialConnectionIntents.id,intent.id),eq(socialConnectionIntents.generation,intent.generation),eq(socialConnectionIntents.state,'VERIFYING')));
  }
  return {
    async start(rawSession:string,accountId:string,destination:string) {
      const hash=tokenDigest(rawSession);
      if(typeof destination!=='string' || destination.length>128) return connectionDenied();
      const snapshot=await db.transaction(async tx=>{
        const actor=await lockConnectionActor(tx,hash,now),account=await lockOwnedConnectionAccount(tx,actor,accountId,now);
        const config=setup(account.provider as Provider);
        const count=account.connectionAttemptWindow && now()-account.connectionAttemptWindow.getTime()<ttl?account.connectionAttemptCount:0;
        if(count>=10) throw new SocialConnectionError('LIMITED');
        await tx.update(socialAccounts).set({connectionAttemptCount:count+1,connectionAttemptWindow:count?account.connectionAttemptWindow:new Date(now())}).where(eq(socialAccounts.id,account.id));
        return {actor,account,config};
      });
      const result=await connector(snapshot.account.provider as Provider,snapshot.config.token).validate(destination);
      if(!result.ok || !isCanonicalDestination(result.destinationId)) throw new SocialConnectionError('CONTROL_FAILED');
      return db.transaction(async tx=>{
        const actor=await lockConnectionActor(tx,hash,now),account=await lockOwnedConnectionAccount(tx,actor,accountId,now),config=setup(account.provider as Provider);
        if(actor.sessionId!==snapshot.actor.sessionId || actor.sessionVersion!==snapshot.actor.sessionVersion || account.connectionGeneration!==snapshot.account.connectionGeneration || account.bindingRevision!==snapshot.account.bindingRevision || config.revision!==snapshot.config.revision) return connectionDenied();
        if(account.providerAccountId && account.providerAccountId!==result.destinationId) return connectionDenied();
        const [binding]=await tx.select().from(socialBindings).where(eq(socialBindings.accountId,account.id));
        if(binding && binding.destinationId!==result.destinationId) return connectionDenied();
        const next=await invalidateConnectionIntents(tx,account.id),nonce=credential(),operationId=randomUUID(),expiresAt=new Date(now()+ttl);
        await tx.delete(socialConnectionIntents).where(and(eq(socialConnectionIntents.accountId,account.id),lt(socialConnectionIntents.expiresAt,new Date(now()-86400000))));
        await tx.insert(socialConnectionIntents).values({id:operationId,userId:actor.userId,accountId,sessionId:actor.sessionId,sessionVersion:actor.sessionVersion,provider:account.provider,destinationId:result.destinationId,destinationName:result.displayName.slice(0,200),generation:next.connectionGeneration,bindingRevision:account.bindingRevision,configRevision:config.revision,nonceHash:digest(nonce),expiresAt,createdAt:new Date(now())});
        return {operationId,accountId,provider:account.provider as Provider,destinationId:result.destinationId,launchUrl:`${config.appUrl}?startapp=${nonce}`,expiresAt:expiresAt.toISOString()};
      });
    },
    async receive(provider:Provider,rawInitData:string) {
      const config=setup(provider);
      if(typeof rawInitData!=='string' || Buffer.byteLength(rawInitData)>16384) return connectionDenied();
      const admitted=await db.transaction(async tx=>{
        await tx.insert(socialProofRateLimits).values({provider,count:0,windowStartedAt:new Date(now())}).onConflictDoNothing();
        const [limit]=await tx.select().from(socialProofRateLimits).where(eq(socialProofRateLimits.provider,provider)).for('update');
        const count=now()-limit.windowStartedAt.getTime()<60000?limit.count:0;
        if(count>=120) return false;
        await tx.update(socialProofRateLimits).set({count:count+1,windowStartedAt:count?limit.windowStartedAt:new Date(now())}).where(eq(socialProofRateLimits.provider,provider));return true;
      });
      if(!admitted) throw new SocialConnectionError('LIMITED');
      let proof;
      try {proof=provider==='TELEGRAM'?verifyTelegramLaunch(rawInitData,config.token,now()):verifyMaxLaunch(rawInitData,config.token,now());} catch {return connectionDenied();}
      if(!/^[A-Za-z0-9_-]{43}$/.test(proof.startParam)) return connectionDenied();
      try {
        return await db.transaction(async tx=>{
          const [hint]=await tx.select().from(socialConnectionIntents).where(eq(socialConnectionIntents.nonceHash,digest(proof.startParam)));
          if(!hint || hint.provider!==provider) return connectionDenied();
          const [session]=await tx.select().from(sessions).where(eq(sessions.id,hint.sessionId));if(!session) return connectionDenied();
          const actor=await lockConnectionActor(tx,session.tokenHash,now),account=await lockOwnedConnectionAccount(tx,actor,hint.accountId,now);
          const [intent]=await tx.select().from(socialConnectionIntents).where(eq(socialConnectionIntents.id,hint.id)).for('update');
          if(!intent || intent.state!=='PENDING' || setup(provider).revision!==config.revision) return connectionDenied();
          current(intent,actor,account,now(),config.revision);
          const rawTicket=credential(),expiresAt=new Date(Math.min(intent.expiresAt.getTime(),proof.authDateMs+ttl));
          if(expiresAt.getTime()<=now()) return connectionDenied();
          const [updated]=await tx.update(socialConnectionIntents).set({state:'CANDIDATE',ticketHash:digest(rawTicket),replayDigest:proof.replayDigest,humanId:proof.humanId,humanName:proof.displayName??'',authDate:new Date(proof.authDateMs),ticketExpiresAt:expiresAt}).where(and(eq(socialConnectionIntents.id,intent.id),eq(socialConnectionIntents.state,'PENDING'))).returning();
          if(!updated) return connectionDenied();
          return {ticket:rawTicket,...consent(updated,actor)};
        });
      } catch(error) {if(error instanceof SocialConnectionError) throw error;return connectionDenied();}
    },
    async preview(rawSession:string,rawTicket:string) {
      return db.transaction(async tx=>{const ctx=await ticketContext(tx,rawSession,rawTicket);if(!ctx.intent || ctx.intent.state!=='CANDIDATE') return connectionDenied();return consent(ctx.intent,ctx.actor);});
    },
    async confirm(rawSession:string,rawTicket:string):Promise<SocialConnectionReceipt> {
      const snapshot=await db.transaction(async tx=>{
        const ctx=await ticketContext(tx,rawSession,rawTicket);
        if(ctx.receipt) return ctx;
        if(ctx.intent.state!=='CANDIDATE' || ctx.intent.attempts>=5) return connectionDenied();
        await tx.update(socialConnectionIntents).set({state:'VERIFYING',attempts:ctx.intent.attempts+1}).where(eq(socialConnectionIntents.id,ctx.intent.id));
        return ctx;
      });
      if(snapshot.receipt) return snapshot.receipt;
      const intent=snapshot.intent,checkedAt=now();
      const control=await connector(intent.provider as Provider,snapshot.config.token).validateControl(intent.destinationId,intent.humanId!);
      if(!control.ok || control.destinationId!==intent.destinationId || control.humanId!==intent.humanId || now()-checkedAt>30000 || now()<checkedAt) {await closeFailed(intent);throw new SocialConnectionError('CONTROL_FAILED');}
      try {
        return await db.transaction(async tx=>{
          const ctx=await ticketContext(tx,rawSession,rawTicket);
          if(ctx.receipt) return ctx.receipt;
          if(ctx.intent.id!==intent.id || ctx.intent.state!=='VERIFYING' || now()-checkedAt>30000 || now()<checkedAt) return connectionDenied();
          await lockProviderDestinations(tx,intent.provider as Provider);
          // Freshness must hold after waiting for the shared uniqueness lock.
          current(ctx.intent,ctx.actor,ctx.account,now(),setup(intent.provider as Provider).revision);candidate(ctx.intent,now());
          if(now()-checkedAt>30000) return connectionDenied();
          await assertDestinationAvailable(tx,intent.accountId,intent.provider as Provider,intent.destinationId);
          const [existing]=await tx.select().from(socialBindings).where(eq(socialBindings.accountId,intent.accountId));
          if(existing && (existing.destinationId!==intent.destinationId || existing.humanId!==intent.humanId)) return connectionDenied();
          const revision=ctx.account.bindingRevision+1;
          const binding={accountId:intent.accountId,userId:intent.userId,provider:intent.provider,destinationId:intent.destinationId,humanId:intent.humanId!,botId:control.botId,configRevision:ctx.config.revision,sessionVersion:ctx.actor.sessionVersion,revision,checkedAt:new Date(checkedAt),updatedAt:new Date(now())};
          await tx.insert(socialBindings).values(binding).onConflictDoUpdate({target:socialBindings.accountId,set:binding});
          await tx.update(socialAccounts).set({providerAccountId:intent.destinationId,displayName:intent.destinationName,enabled:false,connectionStatus:'CONNECTED',bindingRevision:revision,updatedAt:new Date(now())}).where(eq(socialAccounts.id,intent.accountId));
          const receipt:SocialConnectionReceipt={operationId:intent.id,accountId:intent.accountId,provider:intent.provider as Provider,destinationId:intent.destinationId,bindingRevision:revision,state:'VERIFIED_DISABLED'};
          await tx.insert(socialConnectionReceipts).values({operationId:intent.id,userId:intent.userId,accountId:intent.accountId,sessionId:ctx.actor.sessionId,sessionVersion:ctx.actor.sessionVersion,generation:intent.generation,configRevision:ctx.config.revision,ticketHash:ticketDigest(rawTicket),receipt,createdAt:new Date(now())});
          await tx.update(socialConnectionIntents).set({state:'COMPLETED'}).where(eq(socialConnectionIntents.id,intent.id));
          return receipt;
        });
      } catch(error) {await closeFailed(intent);if(error instanceof SocialConnectionError) throw error;throw new SocialConnectionError('CONFLICT');}
    },
  };
}

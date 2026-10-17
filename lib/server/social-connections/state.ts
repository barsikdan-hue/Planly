import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { sessions, socialAccounts, socialBindings, socialConnectionIntents, users } from '../../../db/schema.ts';

export type ConnectionTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export type ConnectionActor = { userId: string; sessionId: string; sessionVersion: number; sessionExpiresAt: number; displayName: string };
type ConnectionClock = number | (()=>number);
const clockValue=(clock:ConnectionClock)=>typeof clock==='function'?clock():clock;
export class SocialConnectionError extends Error {
  readonly code: 'UNAVAILABLE'|'DENIED'|'CONFLICT'|'LIMITED'|'CONTROL_FAILED';
  constructor(code: SocialConnectionError['code'] = 'DENIED') {
    super(code === 'UNAVAILABLE' ? 'Подключение пока недоступно. Администратору нужно настроить Mini App и бота.' : code === 'CONFLICT' ? 'Это подключение сейчас недоступно.' : 'Не удалось подтвердить подключение. Начните заново.');
    this.name = 'SocialConnectionError';
    this.code = code;
  }
}
export const connectionDenied = (): never => { throw new SocialConnectionError(); };

// Every caller holds user before account. Session FOR UPDATE serializes logout;
// no network call is made while these locks are held.
export async function lockConnectionActor(tx:ConnectionTransaction, tokenHash:string, now:ConnectionClock):Promise<ConnectionActor> {
  const [reference]=await tx.select().from(sessions).where(eq(sessions.tokenHash,tokenHash));
  if(!reference) return connectionDenied();
  const [user]=await tx.select().from(users).where(eq(users.id,reference.userId)).for('update');
  if(!user || !user.authInitialized || user.accessState!=='ACTIVE' || user.sessionVersion!==reference.sessionVersion || reference.expiresAt.getTime()<=clockValue(now)) return connectionDenied();
  return {userId:user.id,sessionId:reference.id,sessionVersion:user.sessionVersion,sessionExpiresAt:reference.expiresAt.getTime(),displayName:user.displayName.slice(0,100)};
}
export async function lockOwnedConnectionAccount(tx:ConnectionTransaction,actor:ConnectionActor,accountId:string,now:ConnectionClock) {
  const [account]=await tx.select().from(socialAccounts).where(and(eq(socialAccounts.id,accountId),eq(socialAccounts.userId,actor.userId))).for('update');
  if(!account || account.provider==='VK') return connectionDenied();
  const [session]=await tx.select().from(sessions).where(eq(sessions.id,actor.sessionId)).for('update');
  if(!session || session.userId!==actor.userId || session.sessionVersion!==actor.sessionVersion || session.expiresAt.getTime()<=clockValue(now)) return connectionDenied();
  actor.sessionExpiresAt=session.expiresAt.getTime();
  return account;
}
export async function invalidateConnectionIntents(tx:ConnectionTransaction,accountId:string) {
  await tx.update(socialConnectionIntents).set({state:'CANCELLED'}).where(and(eq(socialConnectionIntents.accountId,accountId),sql`${socialConnectionIntents.state} IN ('PENDING','CANDIDATE','VERIFYING')`));
  const [account]=await tx.update(socialAccounts).set({connectionGeneration:sql`${socialAccounts.connectionGeneration}+1`,updatedAt:new Date()}).where(eq(socialAccounts.id,accountId)).returning();
  return account;
}
export async function lockProviderDestinations(tx:ConnectionTransaction,provider:'TELEGRAM'|'MAX') {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(660066, ${provider==='TELEGRAM'?1:2})`);
}
// Under the provider advisory lock, legacy writes and verified claims see each
// other. A foreign raw alias cannot be resolved without a foreign provider read;
// fail closed until rollout preflight resolves that protected legacy row.
export async function assertDestinationAvailable(tx:ConnectionTransaction,accountId:string,provider:'TELEGRAM'|'MAX',destination:string) {
  const bindings=await tx.select().from(socialBindings).where(and(eq(socialBindings.provider,provider),ne(socialBindings.accountId,accountId)));
  if(bindings.some(b=>b.destinationId===destination)) throw new SocialConnectionError('CONFLICT');
  const foreign=await tx.select({destination:socialAccounts.providerAccountId}).from(socialAccounts)
    .where(and(eq(socialAccounts.provider,provider),ne(socialAccounts.id,accountId),isNotNull(socialAccounts.providerAccountId)));
  if(foreign.some(row=>!isCanonicalDestination(row.destination!) || row.destination===destination)) throw new SocialConnectionError('CONFLICT');
}
export function isCanonicalDestination(value:string) { return /^-?[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value)); }

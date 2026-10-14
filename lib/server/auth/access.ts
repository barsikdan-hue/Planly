import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { sessions, users } from '../../../db/schema.ts';
import { getOwnerEmail } from '../env.ts';

export class ForbiddenError extends Error {
  constructor() { super('Forbidden'); this.name = 'ForbiddenError'; }
}
export class SessionAccessError extends Error {
  constructor() { super('Session access denied'); this.name = 'SessionAccessError'; }
}

// Retain the owner's identity, password source and data. Initialize once;
// session recovery must never undo subsequent suspension.
export async function initializeLegacyOwner(): Promise<void> {
  await getDb().update(users).set({role:'ADMIN', accessState:'ACTIVE', authInitialized:true})
    .where(and(eq(users.email,getOwnerEmail()),eq(users.authInitialized,false)));
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await getDb().transaction(async tx => {
    await tx.select({id:users.id}).from(users).where(eq(users.id,userId)).for('update');
    await tx.update(users).set({sessionVersion:sql`${users.sessionVersion}+1`,updatedAt:new Date()}).where(eq(users.id,userId));
    await tx.delete(sessions).where(eq(sessions.userId,userId));
  });
}

// Internal lifecycle primitive; no enrollment or administration endpoint.
export async function setUserAccessState(userId: string, accessState: 'ACTIVE' | 'BLOCKED'): Promise<void> {
  await getDb().transaction(async tx => {
    const [user]=await tx.select().from(users).where(eq(users.id,userId)).for('update');
    if(!user || user.authInitialized && user.accessState===accessState) return;
    // A migration-default BLOCKED row is not yet an explicit lifecycle decision.
    // Record that decision before lazy owner initialization can grant access.
    const role=!user.authInitialized && user.email===getOwnerEmail()?'ADMIN':user.role;
    await tx.update(users).set({role,accessState,authInitialized:true,sessionVersion:sql`${users.sessionVersion}+1`,updatedAt:new Date()}).where(eq(users.id,userId));
    await tx.delete(sessions).where(eq(sessions.userId,userId));
  });
}

export function requireOwnerProviderAccess(identity: {email:string}): void {
  if(identity.email!==getOwnerEmail()) throw new ForbiddenError();
}
export async function hasOwnerProviderAccess(userId: string): Promise<boolean> {
  await initializeLegacyOwner();
  const [user]=await getDb().select({id:users.id}).from(users).where(and(eq(users.id,userId),eq(users.email,getOwnerEmail()),eq(users.authInitialized,true),eq(users.accessState,'ACTIVE'))).limit(1);
  return !!user;
}
export function requireSameOriginMutation(request: Request): void {
  const site=request.headers.get('sec-fetch-site'), origin=request.headers.get('origin');
  // Metadata handles a reverse proxy's internal listen URL. Without metadata,
  // validate the supplied Origin instead.
  if(site ? site!=='same-origin' : origin && origin!==new URL(request.url).origin) throw new ForbiddenError();
}
export function rejectIdentitySelectors(request: Request): void {
  const query=new URL(request.url).searchParams;
  if(['userId','ownerId'].some(key=>query.has(key)) || request.headers.has('x-user-id') || request.headers.has('x-owner-id')) throw new ForbiddenError();
}
export function rejectIdentityPayload(body: unknown): void {
  if(body && typeof body==='object' && ['userId','ownerId','role','accessState','passwordHash','sessionVersion','authInitialized'].some(key=>Object.hasOwn(body,key))) throw new ForbiddenError();
}

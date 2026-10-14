import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { getOwnerEmail } from '../env.ts';
import { loginRateLimits, sessions, userInvitations, users } from '../../../db/schema.ts';
import { ForbiddenError, rejectIdentityPayload, rejectIdentitySelectors, requireSameOriginMutation } from './access.ts';
import { requireApiOwner, requestCookie, UnauthorizedError } from './owner.ts';
import { hashOwnerPassword } from './password.ts';
import { createSessionInTransaction, SESSION_COOKIE_NAME, sessionTokenHash } from './session.ts';
import { z } from 'zod';

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
const INVITE_TTL = 24 * 60 * 60 * 1000;
const PUBLIC_WINDOW = 15 * 60 * 1000;
const PUBLIC_LIMIT = 20;
export const invitationCreateSchema = z.object({email:z.string().trim().email().max(320).transform(email=>email.toLowerCase())}).strict();
export const invitationInspectSchema = z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export const invitationAcceptSchema = invitationInspectSchema.extend({password:z.string().min(12).max(128)}).strict();
export class InvitationError extends Error {
  readonly status: number;
  constructor(status:number) { super(status===409?'Этот email уже используется или приглашён.':'Приглашение недействительно.'); this.status=status; }
}
function tokenHash(token:string) { return createHash('sha256').update(token).digest('hex'); }
async function emailLock(tx:Transaction,email:string) { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${email}, 1))`); }
async function existingEmail(tx:Transaction,email:string) {
  return (await tx.select({id:users.id}).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1)).length>0;
}
async function withAdmin<T>(request:Request,work:(tx:Transaction,userId:string)=>Promise<T>):Promise<T> {
  const identity=await requireApiOwner(request);
  return getDb().transaction(async tx=>{
    const [user]=await tx.select().from(users).where(eq(users.id,identity.id)).for('update');
    if(!user?.authInitialized || user.accessState!=='ACTIVE') throw new UnauthorizedError();
    const [session]=await tx.select({id:sessions.id}).from(sessions).where(and(eq(sessions.userId,user.id),eq(sessions.tokenHash,sessionTokenHash(requestCookie(request,SESSION_COOKIE_NAME)??'')),eq(sessions.sessionVersion,user.sessionVersion),gt(sessions.expiresAt,new Date()))).limit(1);
    if(!session)throw new UnauthorizedError();
    if(user.role!=='ADMIN')throw new ForbiddenError();
    return work(tx,user.id);
  });
}
export async function createInvitation(request:Request) {
  return withAdmin(request,async(tx,userId)=>{
    const body:unknown=await request.json();
    rejectIdentityPayload(body);const {email}=invitationCreateSchema.parse(body);
    await emailLock(tx,email);
    if(email===getOwnerEmail() || await existingEmail(tx,email))throw new InvitationError(409);
    const now=new Date();
    await tx.update(userInvitations).set({status:'EXPIRED'}).where(and(eq(userInvitations.email,email),eq(userInvitations.status,'PENDING'),lte(userInvitations.expiresAt,now)));
    const [pending]=await tx.select({id:userInvitations.id}).from(userInvitations).where(and(eq(userInvitations.email,email),eq(userInvitations.status,'PENDING'))).limit(1);
    if(pending)throw new InvitationError(409);
    const token=randomBytes(32).toString('base64url'),id=randomUUID(),expiresAt=new Date(now.getTime()+INVITE_TTL);
    await tx.insert(userInvitations).values({id,email,createdBy:userId,tokenHash:tokenHash(token),expiresAt});
    return {id,email,expiresAt,token};
  });
}
export async function listInvitations(request:Request) {
  return withAdmin(request,async tx=>{
    const rows=await tx.select({id:userInvitations.id,email:userInvitations.email,status:userInvitations.status,createdAt:userInvitations.createdAt,expiresAt:userInvitations.expiresAt}).from(userInvitations).orderBy(desc(userInvitations.createdAt)).limit(500);
    return {invitations:rows.map(row=>({...row,status:row.status==='PENDING' && row.expiresAt.getTime()<=Date.now()?'EXPIRED':row.status}))};
  });
}
export async function revokeInvitation(request:Request,id:string) {
  return withAdmin(request,async tx=>{
    const [invitation]=await tx.select().from(userInvitations).where(eq(userInvitations.id,id)).for('update');
    if(!invitation)throw new InvitationError(404);
    if(invitation.status==='PENDING')await tx.update(userInvitations).set({status:invitation.expiresAt.getTime()<=Date.now()?'EXPIRED':'REVOKED'}).where(eq(userInvitations.id,id));
    return {ok:true};
  });
}
export async function inspectInvitation(token:string) {
  const [invitation]=await getDb().select({email:userInvitations.email,expiresAt:userInvitations.expiresAt}).from(userInvitations).where(and(eq(userInvitations.tokenHash,tokenHash(token)),eq(userInvitations.status,'PENDING'),gt(userInvitations.expiresAt,new Date()))).limit(1);
  if(!invitation)throw new InvitationError(410);
  return invitation;
}
export async function acceptInvitation(token:string,password:string) {
  // Validate before the expensive KDF, then revalidate under the consume lock.
  const inspected=await inspectInvitation(token);
  const passwordHash=await hashOwnerPassword(password);
  return getDb().transaction(async tx=>{
    // Creation/replacement and acceptance acquire email before invitation.
    // Recheck expiry only after waiting for that admission lock.
    await emailLock(tx,inspected.email);
    const [invitation]=await tx.select().from(userInvitations).where(eq(userInvitations.tokenHash,tokenHash(token))).for('update');
    if(!invitation || invitation.status!=='PENDING' || invitation.expiresAt.getTime()<=Date.now())throw new InvitationError(410);
    if(invitation.email.trim().toLowerCase()===getOwnerEmail() || await existingEmail(tx,invitation.email))throw new InvitationError(410);
    const id=randomUUID();
    await tx.insert(users).values({id,email:invitation.email,displayName:invitation.email.split('@')[0],role:'USER',accessState:'ACTIVE',authInitialized:true,passwordHash});
    await tx.update(userInvitations).set({status:'ACCEPTED',acceptedAt:new Date()}).where(eq(userInvitations.id,invitation.id));
    return createSessionInTransaction(tx,id);
  });
}
export async function consumeInvitationRateLimit(request:Request) {
  requireSameOriginMutation(request);rejectIdentitySelectors(request);
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const keyHash=createHash('sha256').update(`invitations:${ip}`).digest('hex');
  return consumeInvitationBudget(keyHash);
}
export async function consumeInvitationTokenRateLimit(token:string) {
  // Bind the KDF allowance to the bearer capability even if proxy headers vary.
  // Store only a namespaced digest; never retain the raw invitation token.
  const keyHash=createHash('sha256').update(`invitations-token:${tokenHash(token)}`).digest('hex');
  return consumeInvitationBudget(keyHash);
}
async function consumeInvitationBudget(keyHash:string) {
  const now=new Date(),cutoff=new Date(now.getTime()-PUBLIC_WINDOW);
  const [row]=await getDb().insert(loginRateLimits).values({keyHash,failedCount:1,windowStartedAt:now,updatedAt:now}).onConflictDoUpdate({target:loginRateLimits.keyHash,set:{failedCount:sql<number>`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then 1 else ${loginRateLimits.failedCount}+1 end`,windowStartedAt:sql<Date>`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then ${now} else ${loginRateLimits.windowStartedAt} end`,updatedAt:now}}).returning();
  return {allowed:row.failedCount<=PUBLIC_LIMIT,retryAfterSeconds:Math.max(1,Math.ceil((row.windowStartedAt.getTime()+PUBLIC_WINDOW-now.getTime())/1000))};
}

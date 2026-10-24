import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { users } from '../../../db/schema.ts';
import { ensureOwnerSocialAccounts } from '../social-accounts.ts';
import { getOwnerAuthEnv } from '../env.ts';
import { verifyOwnerPassword } from './password.ts';
import { hasCurrentManualAccess, ManualAccessExpiredError } from './manual-access.ts';
import { initializeLegacyOwner, rejectIdentitySelectors, requireSameOriginMutation } from './access.ts';
import {
  getOwnerBySessionToken,
  SESSION_COOKIE_NAME,
  type Owner,
} from './session.ts';

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureOwner(): Promise<Owner> {
  const { OWNER_EMAIL } = getOwnerAuthEnv();
  let [owner] = await getDb()
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, OWNER_EMAIL))
    .limit(1);
  if (!owner) {
    await getDb().insert(users).values({
      id: randomUUID(),
      email: OWNER_EMAIL,
      displayName: OWNER_EMAIL.split('@')[0] || 'Owner',
      role: 'ADMIN', accessState: 'ACTIVE', authInitialized: true,
    }).onConflictDoNothing({ target: users.email });

    [owner] = await getDb()
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.email, OWNER_EMAIL))
      .limit(1);
  }
  if (!owner) throw new Error('Owner bootstrap failed.');
  await initializeLegacyOwner();
  await ensureOwnerSocialAccounts(owner.id);
  return owner;
}

export async function authenticateOwner(email: string, password: string): Promise<Owner | null> {
  const env = getOwnerAuthEnv();
  const normalized=normalizeEmail(email);
  if(normalized===env.OWNER_EMAIL) {
    if(!await verifyOwnerPassword(password,env.OWNER_PASSWORD_HASH))return null;
    await ensureOwner();
  }
  const [user]=await getDb().select().from(users).where(eq(users.email,normalized)).limit(1);
  if(normalized!==env.OWNER_EMAIL && !await verifyOwnerPassword(password,user?.passwordHash??env.OWNER_PASSWORD_HASH))return null;
  if(!user?.authInitialized || user.accessState!=='ACTIVE' || normalized!==env.OWNER_EMAIL && !user.passwordHash)return null;
  return {id:user.id,email:user.email,displayName:user.displayName,sessionVersion:user.sessionVersion};
}

export function requestCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) return undefined;
  for (const pair of raw.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function requireApiOwner(request: Request): Promise<Owner> {
  const owner = await getOwnerBySessionToken(requestCookie(request, SESSION_COOKIE_NAME) ?? '');
  if (!owner) throw new UnauthorizedError();
  rejectIdentitySelectors(request);
  // These existing OAuth handlers validate the configured public VK origin,
  // rather than Next's internal reverse-proxy listen URL.
  const vkMutation=['/api/social-accounts/vk/start','/api/social-accounts/vk/disconnect'].includes(new URL(request.url).pathname);
  if(!['GET','HEAD','OPTIONS'].includes(request.method) && !vkMutation)requireSameOriginMutation(request);
  const path = new URL(request.url).pathname;
  // Post PATCH checks exact cancellation-only content under the user/Post locks.
  const safeCancellation = path.endsWith('/cancel-approval') || path === '/api/auth/logout' || request.method === 'PATCH' && /^\/api\/posts\/[^/]+$/.test(path);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !safeCancellation && !await hasCurrentManualAccess(owner.id)) throw new ManualAccessExpiredError();
  return owner;
}

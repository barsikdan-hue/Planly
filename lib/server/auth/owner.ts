import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { users } from '../../../db/schema.ts';
import { getOwnerAuthEnv } from '../env.ts';
import { verifyOwnerPassword } from './password.ts';
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
  if (owner) return owner;

  await getDb().insert(users).values({
    id: randomUUID(),
    email: OWNER_EMAIL,
    displayName: OWNER_EMAIL.split('@')[0] || 'Owner',
  }).onConflictDoNothing({ target: users.email });

  [owner] = await getDb()
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, OWNER_EMAIL))
    .limit(1);
  if (!owner) throw new Error('Owner bootstrap failed.');
  return owner;
}

export async function authenticateOwner(email: string, password: string): Promise<Owner | null> {
  const env = getOwnerAuthEnv();
  const passwordMatches = await verifyOwnerPassword(password, env.OWNER_PASSWORD_HASH);
  if (!passwordMatches || normalizeEmail(email) !== env.OWNER_EMAIL) return null;
  return ensureOwner();
}

function requestCookie(request: Request, name: string): string | undefined {
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
  return owner;
}

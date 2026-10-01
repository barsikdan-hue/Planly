import { cookies } from 'next/headers';
import {
  deleteSessionByToken,
  getOwnerBySessionToken,
  SESSION_COOKIE_NAME,
  type Owner,
} from './session.ts';

export async function getOwnerFromSession(): Promise<Owner | null> {
  const rawToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return rawToken ? getOwnerBySessionToken(rawToken) : null;
}

export async function destroyOwnerSession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) await deleteSessionByToken(rawToken);
  store.delete(SESSION_COOKIE_NAME);
}

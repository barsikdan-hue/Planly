import { redirect } from 'next/navigation';
import { getOwnerFromSession } from './next-session.ts';
import type { Owner } from './session.ts';

export async function requireOwner(): Promise<Owner> {
  const owner = await getOwnerFromSession();
  if (!owner) redirect('/login');
  return owner;
}

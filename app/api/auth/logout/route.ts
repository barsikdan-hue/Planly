import { NextResponse } from 'next/server';
import { destroyOwnerSession } from '../../../../lib/server/auth/session.ts';

export async function POST() {
  await destroyOwnerSession();
  return NextResponse.json({ ok: true });
}

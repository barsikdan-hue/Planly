import { NextResponse } from 'next/server.js';
import { requestCookie } from '../../../../lib/server/auth/owner.ts';
import { ForbiddenError, requireSameOriginMutation } from '../../../../lib/server/auth/access.ts';
import { deleteSessionByToken, SESSION_COOKIE_NAME, sessionCookieOptions } from '../../../../lib/server/auth/session.ts';

export async function POST(request: Request) {
  try { requireSameOriginMutation(request); }
  catch(error) { if(error instanceof ForbiddenError)return NextResponse.json({error:'Forbidden'},{status:403,headers:{'cache-control':'private, no-store'}});throw error; }
  await deleteSessionByToken(requestCookie(request,SESSION_COOKIE_NAME)??'');
  const response=NextResponse.json({ok:true},{headers:{'cache-control':'private, no-store'}});
  response.cookies.set(SESSION_COOKIE_NAME,'',{...sessionCookieOptions(),maxAge:0});
  return response;
}

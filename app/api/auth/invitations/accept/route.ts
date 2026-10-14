import { NextResponse } from 'next/server.js';
import { rejectIdentityPayload } from '../../../../../lib/server/auth/access.ts';
import { consumeInvitationRateLimit, consumeInvitationTokenRateLimit, acceptInvitation, invitationAcceptSchema } from '../../../../../lib/server/auth/invitations.ts';
import { invitationError, invitationJson } from '../../../../../lib/server/auth/invitation-http.ts';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../../../../../lib/server/auth/session.ts';
export async function POST(request:Request) {
  try {
    const rate=await consumeInvitationRateLimit(request);
    if(!rate.allowed)return invitationJson({error:'Слишком много попыток. Попробуй позже.'},429,{'retry-after':String(rate.retryAfterSeconds)});
    const body:unknown=await request.json();rejectIdentityPayload(body);
    const {token,password}=invitationAcceptSchema.parse(body);
    const tokenRate=await consumeInvitationTokenRateLimit(token);
    if(!tokenRate.allowed)return invitationJson({error:'Слишком много попыток. Попробуй позже.'},429,{'retry-after':String(tokenRate.retryAfterSeconds)});
    const rawSession=await acceptInvitation(token,password);
    const response=NextResponse.json({ok:true},{headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer'}});
    response.cookies.set(SESSION_COOKIE_NAME,rawSession,sessionCookieOptions());
    return response;
  } catch(error) { return invitationError(error); }
}

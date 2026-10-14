import { rejectIdentityPayload } from '../../../../../lib/server/auth/access.ts';
import { consumeInvitationRateLimit, consumeInvitationTokenRateLimit, inspectInvitation, invitationInspectSchema } from '../../../../../lib/server/auth/invitations.ts';
import { invitationError, invitationJson } from '../../../../../lib/server/auth/invitation-http.ts';
export async function POST(request:Request) {
  try {
    const rate=await consumeInvitationRateLimit(request);
    if(!rate.allowed)return invitationJson({error:'Слишком много попыток. Попробуй позже.'},429,{'retry-after':String(rate.retryAfterSeconds)});
    const body:unknown=await request.json();rejectIdentityPayload(body);
    const {token}=invitationInspectSchema.parse(body);
    const tokenRate=await consumeInvitationTokenRateLimit(token);
    if(!tokenRate.allowed)return invitationJson({error:'Слишком много попыток. Попробуй позже.'},429,{'retry-after':String(tokenRate.retryAfterSeconds)});
    return invitationJson(await inspectInvitation(token));
  } catch(error) { return invitationError(error); }
}

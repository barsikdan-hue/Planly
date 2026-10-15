import { createInvitation, listInvitations } from '../../../../lib/server/auth/invitations.ts';
import { invitationError, invitationJson } from '../../../../lib/server/auth/invitation-http.ts';
export async function GET(request:Request) {
  try { return invitationJson(await listInvitations(request)); } catch(error) { return invitationError(error); }
}
export async function POST(request:Request) {
  try { return invitationJson(await createInvitation(request),201); } catch(error) { return invitationError(error); }
}

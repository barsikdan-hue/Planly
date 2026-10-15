import { revokeInvitation } from '../../../../../lib/server/auth/invitations.ts';
import { invitationError, invitationJson } from '../../../../../lib/server/auth/invitation-http.ts';
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}) {
  try { return invitationJson(await revokeInvitation(request,(await context.params).id)); } catch(error) { return invitationError(error); }
}

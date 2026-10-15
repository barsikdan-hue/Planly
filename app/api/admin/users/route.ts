import { listManagedUsers, managedUserError, managedUserJson } from '../../../../lib/server/auth/user-management.ts';

export async function GET(request: Request) {
  try { return managedUserJson(await listManagedUsers(request)); }
  catch (error) { return managedUserError(error); }
}

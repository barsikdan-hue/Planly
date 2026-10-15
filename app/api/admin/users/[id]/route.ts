import { changeManagedUserAccess, managedUserError, managedUserJson } from '../../../../../lib/server/auth/user-management.ts';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return managedUserJson(await changeManagedUserAccess(request, id));
  } catch (error) { return managedUserError(error); }
}

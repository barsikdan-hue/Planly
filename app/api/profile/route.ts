import { updateProfileInputSchema } from '../../../lib/contracts/planner.ts';
import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../lib/server/http.ts';
import { getProfile, updateProfile } from '../../../lib/server/profile.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    return json(await getProfile(owner.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const input = updateProfileInputSchema.parse(await readJson(request));
    return json(await updateProfile(owner.id, input));
  } catch (error) {
    return apiError(error);
  }
}

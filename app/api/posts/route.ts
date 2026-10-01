import { savePostInputSchema } from '../../../lib/contracts/planner.ts';
import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../lib/server/http.ts';
import { createPost, listPlannerPosts } from '../../../lib/server/posts.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    return json(await listPlannerPosts(owner.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const input = savePostInputSchema.parse(await readJson(request));
    return json(await createPost(owner.id, input), 201);
  } catch (error) {
    return apiError(error);
  }
}

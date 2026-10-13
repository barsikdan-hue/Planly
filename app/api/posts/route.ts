import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json } from '../../../lib/server/http.ts';
import { listPlannerPosts } from '../../../lib/server/posts.ts';
import { handleCreatePost } from '../../../lib/server/create-post-handler.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    return json(await listPlannerPosts(owner.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> { return handleCreatePost(request); }

import { createPostSourceSchema, savePostInputSchema } from '../../../lib/contracts/planner.ts';
import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../lib/server/http.ts';
import { createPost, listPlannerPosts } from '../../../lib/server/posts.ts';
import { creationKeySchema } from '../../../lib/server/post-idempotency.ts';
import { runDuePublications, shouldProcessImmediately } from '../../../lib/server/scheduler/tick.ts';

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
    const raw = await readJson(request);
    const input = savePostInputSchema.parse(raw);
    const source = createPostSourceSchema.parse(raw);
    const header = request.headers.get('idempotency-key');
    const creationKey = header === null ? undefined : creationKeySchema.parse(header);
    const saved = await createPost(owner.id, input, { creationKey, ...source });
    if (!shouldProcessImmediately(input)) return json(saved, 201);

    await runDuePublications({ userId: owner.id, postId: saved.id, limit: Math.max(1, saved.targets.length) });
    const refreshed = (await listPlannerPosts(owner.id)).find(post => post.id === saved.id) ?? saved;
    return json(refreshed, 201);
  } catch (error) {
    return apiError(error);
  }
}
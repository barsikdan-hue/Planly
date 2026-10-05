import { savePostInputSchema } from '../../../../lib/contracts/planner.ts';
import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../../lib/server/http.ts';
import { deletePost, listPlannerPosts, updatePost } from '../../../../lib/server/posts.ts';
import { runDuePublications, shouldProcessImmediately } from '../../../../lib/server/scheduler/tick.ts';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    const input = savePostInputSchema.parse(await readJson(request));
    const saved = await updatePost(owner.id, id, input);
    if (!shouldProcessImmediately(input)) return json(saved);

    await runDuePublications({ userId: owner.id, postId: saved.id, limit: Math.max(1, saved.targets.length) });
    const refreshed = (await listPlannerPosts(owner.id)).find(post => post.id === saved.id) ?? saved;
    return json(refreshed);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    await deletePost(owner.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
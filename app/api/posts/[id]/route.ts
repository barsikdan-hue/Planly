import { savePostInputSchema } from '../../../../lib/contracts/planner.ts';
import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../../lib/server/http.ts';
import { deletePost, updatePost } from '../../../../lib/server/posts.ts';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    const input = savePostInputSchema.parse(await readJson(request));
    return json(await updatePost(owner.id, id, input));
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

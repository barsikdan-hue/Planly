import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { apiError } from '../../../../lib/server/http.ts';
import { deleteMediaAsset } from '../../../../lib/server/media.ts';

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    await deleteMediaAsset(owner.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && /attached/i.test(error.message)) {
      return Response.json({ error: 'Media is attached to content' }, { status: 409 });
    }
    return apiError(error);
  }
}

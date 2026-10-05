import { patchLibraryItemInputSchema } from '../../../../lib/contracts/library.ts';
import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../../lib/server/http.ts';
import { archiveLibraryItem, deleteLibraryItem, updateLibraryItem } from '../../../../lib/server/library-items.ts';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    const input = patchLibraryItemInputSchema.parse(await readJson(request));
    return json('expectedUpdatedAt' in input
      ? await archiveLibraryItem(owner.id, id, input.expectedUpdatedAt)
      : await updateLibraryItem(owner.id, id, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    await deleteLibraryItem(owner.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

import { createLibraryItemInputSchema, libraryCreationKeySchema } from '../../../lib/contracts/library.ts';
import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../lib/server/http.ts';
import { createLibraryItemForIntent, listLibraryItems } from '../../../lib/server/library-items.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    return json(await listLibraryItems(owner.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const input = createLibraryItemInputSchema.parse(await readJson(request));
    const creationKey = libraryCreationKeySchema.parse(request.headers.get('idempotency-key'));
    return json(await createLibraryItemForIntent(owner.id, input, creationKey), 201);
  } catch (error) {
    return apiError(error);
  }
}

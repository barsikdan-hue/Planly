import { shareLibraryItemInputSchema } from '../../../../../lib/contracts/shared-library.ts';
import { requireApiOwner } from '../../../../../lib/server/auth/owner.ts';
import { json, readJson } from '../../../../../lib/server/http.ts';
import { setLibraryShared, sharedLibraryApiError } from '../../../../../lib/server/shared-library.ts';

export async function POST(request: Request, context: {params:Promise<{id:string}>}): Promise<Response> {
  try {
    await requireApiOwner(request);
    const input=shareLibraryItemInputSchema.parse(await readJson(request));
    await setLibraryShared(request,(await context.params).id,input.shared);
    return json({shared:input.shared});
  }catch(error){return sharedLibraryApiError(error);}
}

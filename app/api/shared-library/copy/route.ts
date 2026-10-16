import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { json, readJson } from '../../../../lib/server/http.ts';
import { copySharedLibrary, sharedLibraryApiError } from '../../../../lib/server/shared-library.ts';

export async function POST(request: Request): Promise<Response> {
  try {
    await requireApiOwner(request);
    return json({items:await copySharedLibrary(request,await readJson(request),request.headers.get('idempotency-key'))},201);
  }catch(error){return sharedLibraryApiError(error);}
}

import { json } from '../../../lib/server/http.ts';
import { listSharedLibrary, sharedLibraryApiError } from '../../../lib/server/shared-library.ts';

export async function GET(request: Request): Promise<Response> {
  try {return json({items:await listSharedLibrary(request)});}catch(error){return sharedLibraryApiError(error);}
}

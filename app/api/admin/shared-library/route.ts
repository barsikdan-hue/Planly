import { json } from '../../../../lib/server/http.ts';
import { listAdminSharedLibrary, sharedLibraryApiError } from '../../../../lib/server/shared-library.ts';

export async function GET(request: Request): Promise<Response> {
  try {return json({sourceIds:await listAdminSharedLibrary(request)});}catch(error){return sharedLibraryApiError(error);}
}

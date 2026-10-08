import {requireApiOwner} from '../../../lib/server/auth/owner.ts';
import {listAnalytics} from '../../../lib/server/analytics/repository.ts';
import {analyticsApiError,analyticsJson,analyticsQuery} from '../../../lib/server/analytics/http.ts';
export async function GET(request:Request):Promise<Response> {
  try{const owner=await requireApiOwner(request);return analyticsJson(await listAnalytics(owner.id,analyticsQuery(request),new Date()));}catch(error){return analyticsApiError(error);}
}

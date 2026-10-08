import {requireApiOwner} from '../../../../lib/server/auth/owner.ts';
import {analyticsRefreshSchema} from '../../../../lib/contracts/analytics.ts';
import {refreshMaxAnalytics} from '../../../../lib/server/analytics/refresh.ts';
import {analyticsApiError,analyticsJson,requireAnalyticsRefreshRequest} from '../../../../lib/server/analytics/http.ts';
import {PayloadLimitError,readBoundedJson} from '../../../../lib/server/analytics/body.ts';
export async function POST(request:Request):Promise<Response> {
  try{const owner=await requireApiOwner(request);requireAnalyticsRefreshRequest(request);const input=analyticsRefreshSchema.parse(await readBoundedJson(request.body,4096));return analyticsJson(await refreshMaxAnalytics(owner.id,input));}
  catch(error){return error instanceof PayloadLimitError?analyticsJson({error:'Payload too large'},413):analyticsApiError(error);}
}

import {ZodError} from 'zod';
import {UnauthorizedError} from '../auth/owner.ts';
import {analyticsQuerySchema,type AnalyticsQuery} from '../../contracts/analytics.ts';
export const analyticsJson=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export class AnalyticsCsrfError extends Error {}
export function requireAnalyticsRefreshRequest(request:Request):void {
  const site=request.headers.get('sec-fetch-site');
  if(request.headers.get('X-Planly-Analytics')!=='1'||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||site&&site!=='same-origin')throw new AnalyticsCsrfError();
}
export function analyticsQuery(request:Request):AnalyticsQuery {
  const raw=Object.fromEntries(new URL(request.url).searchParams);
  return analyticsQuerySchema.parse({...raw,period:Number(raw.period??7),page:Number(raw.page??0),provider:raw.provider??'max'});
}
export function analyticsApiError(error:unknown):Response {
  if(error instanceof UnauthorizedError)return analyticsJson({error:'Unauthorized'},401);
  if(error instanceof AnalyticsCsrfError)return analyticsJson({error:'Forbidden'},403);
  if(error instanceof ZodError)return analyticsJson({error:'Invalid analytics selection'},422);
  if(error instanceof SyntaxError)return analyticsJson({error:'Malformed JSON'},400);
  return analyticsJson({error:'Analytics temporarily unavailable'},503);
}

import {ZodError} from 'zod';
import {UnauthorizedError} from './auth/owner.ts';
import {PublicationContentError} from '../publication-content.ts';
import {SchedulingPlanConflictError} from './scheduling-plan-commit.ts';
export const schedulingPlanJson=(body:unknown,status=200):Response=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
class SchedulingPlanCsrfError extends Error {}
export function requireSchedulingPlanRequest(request:Request):void {
  const site=request.headers.get('sec-fetch-site');
  if(request.headers.get('X-Planly-Scheduling')!=='1'||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||(site&&site!=='same-origin'))throw new SchedulingPlanCsrfError();
}
export function schedulingPlanApiError(error:unknown):Response {
  if(error instanceof UnauthorizedError)return schedulingPlanJson({error:'Unauthorized'},401);
  if(error instanceof SchedulingPlanCsrfError)return schedulingPlanJson({error:'Forbidden'},403);
  if(error instanceof SyntaxError)return schedulingPlanJson({error:'Malformed JSON',code:'PLAN_BAD_JSON',commitApplied:false},400);
  if(error instanceof ZodError)return schedulingPlanJson({error:'Invalid scheduling input',code:'PLAN_INVALID_INPUT',commitApplied:false},422);
  if(error instanceof PublicationContentError)return schedulingPlanJson({error:'Invalid publication content',code:'PLAN_CONTENT_INVALID',commitApplied:false},422);
  if(error instanceof SchedulingPlanConflictError)return schedulingPlanJson({error:error.message,code:error.code,...(error.code==='PLAN_OPERATION_CONFLICT'?{}:{commitApplied:false})},409);
  if(error instanceof Error&&error.message==='Post not found')return schedulingPlanJson({error:'Post not found',code:'PLAN_POST_NOT_FOUND',commitApplied:false},404);
  return schedulingPlanJson({error:'Scheduling temporarily unavailable'},500);
}

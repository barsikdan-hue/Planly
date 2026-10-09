import {requireApiOwner} from '../../../../lib/server/auth/owner.ts';
import {schedulingPlanPreviewInputSchema} from '../../../../lib/contracts/scheduling-plan.ts';
import {previewSchedulingPlan} from '../../../../lib/server/scheduling-plan-preview.ts';
import {requireSchedulingPlanRequest,schedulingPlanApiError,schedulingPlanJson,readSchedulingPlanJson} from '../../../../lib/server/scheduling-plan-http.ts';
export async function POST(request:Request):Promise<Response> {
  try {const owner=await requireApiOwner(request);requireSchedulingPlanRequest(request);const input=schedulingPlanPreviewInputSchema.parse(await readSchedulingPlanJson(request));return schedulingPlanJson(await previewSchedulingPlan(owner.id,input));}
  catch(error){return schedulingPlanApiError(error);}
}

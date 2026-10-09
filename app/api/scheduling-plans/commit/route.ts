import {requireApiOwner} from '../../../../lib/server/auth/owner.ts';
import {schedulingPlanCommitInputSchema} from '../../../../lib/contracts/scheduling-plan.ts';
import {commitSchedulingPlan} from '../../../../lib/server/scheduling-plan-commit.ts';
import {requireSchedulingPlanRequest,schedulingPlanApiError,schedulingPlanJson,readSchedulingPlanJson} from '../../../../lib/server/scheduling-plan-http.ts';
export async function POST(request:Request):Promise<Response> {
  try {const owner=await requireApiOwner(request);requireSchedulingPlanRequest(request);const input=schedulingPlanCommitInputSchema.parse(await readSchedulingPlanJson(request));return schedulingPlanJson(await commitSchedulingPlan(owner.id,input));}
  catch(error){return schedulingPlanApiError(error);}
}

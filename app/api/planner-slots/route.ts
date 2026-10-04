import { slotQuerySchema } from '../../../lib/contracts/swipe-planner.ts';
import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json } from '../../../lib/server/http.ts';
import { previewPlannerSlot } from '../../../lib/server/planner-slots.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const params = new URL(request.url).searchParams;
    const query = slotQuerySchema.parse({
      providers: params.get('providers')?.split(','), startDate: params.get('startDate'), endDate: params.get('endDate'),
      weekdays: params.get('weekdays')?.split(',').map(Number), times: params.get('times')?.split(','),
    });
    return json(await previewPlannerSlot(owner.id, query));
  } catch (error) { return apiError(error); }
}

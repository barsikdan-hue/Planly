import { schedulingPlanCommitInputSchema, planSettingsSchema, type PlanSettings, type SchedulingPlanCommitInput } from './contracts/scheduling-plan.ts';
import type { SlotQuery } from './contracts/swipe-planner.ts';
import { findNextSlot, slotMinuteKey } from './planner-slots.ts';

export function canonicalSchedulingPlanCommit(input: SchedulingPlanCommitInput): SchedulingPlanCommitInput {
  const parsed = schedulingPlanCommitInputSchema.parse(input);
  return {...parsed,settings:{...parsed.settings,weekdays:[...parsed.settings.weekdays].sort((a,b)=>a-b),times:[...parsed.settings.times].sort()},
    rows:parsed.rows.map(row=>({...row,scheduledAt:new Date(row.scheduledAt).toISOString()}))};
}
export function allocateDraftSlots(postIds: readonly string[], query: SlotQuery, occupied: ReadonlySet<string>, now: Date): {postId:string;scheduledAt:string|null}[] {
  const reserved = new Set(occupied);
  return postIds.map(postId=>{
    const scheduledAt = findNextSlot(query,reserved,now);
    if(scheduledAt) reserved.add(slotMinuteKey(scheduledAt));
    return {postId,scheduledAt};
  });
}
export function isSchedulingPlanSlot(settings: PlanSettings, scheduledAt: string): boolean {
  if(!planSettingsSchema.safeParse(settings).success) return false;
  const instant = new Date(scheduledAt);
  if(!Number.isFinite(instant.getTime()) || instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) return false;
  const moscow = new Date(instant.getTime()+3*60*60*1000);
  const date = moscow.toISOString().slice(0,10);
  return date >= settings.startDate && date <= settings.endDate && settings.weekdays.includes(moscow.getUTCDay() || 7) && settings.times.includes(moscow.toISOString().slice(11,16));
}

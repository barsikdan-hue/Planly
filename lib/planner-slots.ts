import { slotQuerySchema, type SlotQuery } from './contracts/swipe-planner.ts';
export const slotPresets = {
  daily10: { weekdays:[1,2,3,4,5,6,7], times:['10:00'] },
  weekdays10: { weekdays:[1,2,3,4,5], times:['10:00'] },
  daily10and18: { weekdays:[1,2,3,4,5,6,7], times:['10:00','18:00'] },
};
export function slotMinuteKey(iso: string): string { return new Date(iso).toISOString().slice(0,16); }
export function findNextSlot(raw: SlotQuery, occupiedMinutes: ReadonlySet<string>, now: Date): string | null {
  const query = slotQuerySchema.parse(raw);
  const times = [...query.times].sort();
  const start = Date.parse(`${query.startDate}T12:00:00Z`);
  const end = Date.parse(`${query.endDate}T12:00:00Z`);
  for (let day = start; day <= end; day += 86_400_000) {
    const noon = new Date(day);
    const date = noon.toISOString().slice(0,10);
    if (query.weekdays.includes(noon.getUTCDay() || 7)) {
      for (const time of times) {
        const candidate = new Date(`${date}T${time}:00+03:00`);
        const iso = candidate.toISOString();
        if (candidate > now && !occupiedMinutes.has(slotMinuteKey(iso))) return iso;
      }
    }
  }
  return null;
}

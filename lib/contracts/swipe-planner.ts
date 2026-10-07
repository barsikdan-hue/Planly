import { z } from 'zod';
import { providerSchema } from './planner.ts';
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0,10) === value;
}, 'Invalid calendar date');
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const slotQuerySchema = z.object({
  providers: z.array(providerSchema).min(1).max(3).refine(unique, 'Duplicate provider'),
  startDate: calendarDate,
  endDate: calendarDate,
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(unique, 'Duplicate weekday'),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(4).refine(unique, 'Duplicate time'),
}).refine(value => {
  const days = (Date.parse(`${value.endDate}T12:00Z`) - Date.parse(`${value.startDate}T12:00Z`))/86_400_000;
  return days >= 0 && days <= 30;
}, 'Range must contain 1–31 dates');
export type SlotQuery = z.infer<typeof slotQuerySchema>;

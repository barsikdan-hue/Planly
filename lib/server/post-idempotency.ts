import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SavePostInput } from '../contracts/planner.ts';
import { canonicalCreationInput } from '../post-creation.ts';

export const creationKeySchema = z.string().uuid().transform(value => value.toLowerCase());
export type PlannerCreationContext = { sourceLibraryUpdatedAt?: string; requireFreeSlot?: boolean };
export function creationInputHash(input: SavePostInput, sourceLibraryItemId?: string, planner?: PlannerCreationContext): string {
  const canonical = canonicalCreationInput(input);
  const hasPlannerContext = planner?.sourceLibraryUpdatedAt !== undefined || planner?.requireFreeSlot !== undefined;
  const identity = hasPlannerContext
    ? JSON.stringify({ canonical, sourceLibraryItemId, planner: {
      sourceLibraryUpdatedAt: planner?.sourceLibraryUpdatedAt === undefined ? undefined : new Date(planner.sourceLibraryUpdatedAt).toISOString(),
      requireFreeSlot: planner?.requireFreeSlot,
    } })
    : sourceLibraryItemId === undefined ? canonical : JSON.stringify({ canonical, sourceLibraryItemId });
  return createHash('sha256').update(identity).digest('hex');
}
export class CreationConflictError extends Error {
  constructor() { super('Этот запрос уже использован для другого поста. Сначала восстанови результат предыдущего сохранения.'); this.name = 'CreationConflictError'; }
}

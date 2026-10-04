import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SavePostInput } from '../contracts/planner.ts';
import { canonicalCreationInput } from '../post-creation.ts';

export const creationKeySchema = z.string().uuid().transform(value => value.toLowerCase());
export function creationInputHash(input: SavePostInput): string {
  return createHash('sha256').update(canonicalCreationInput(input)).digest('hex');
}
export class CreationConflictError extends Error {
  constructor() { super('Этот запрос уже использован для другого поста. Сначала восстанови результат предыдущего сохранения.'); this.name = 'CreationConflictError'; }
}

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SavePostInput } from '../contracts/planner.ts';
import { canonicalCreationInput } from '../post-creation.ts';

export const creationKeySchema = z.string().uuid().transform(value => value.toLowerCase());
export function creationInputHash(input: SavePostInput, sourceLibraryItemId?: string): string {
  const canonical = canonicalCreationInput(input);
  const identity = sourceLibraryItemId === undefined ? canonical : JSON.stringify({ canonical, sourceLibraryItemId });
  return createHash('sha256').update(identity).digest('hex');
}
export class CreationConflictError extends Error {
  constructor() { super('Этот запрос уже использован для другого поста. Сначала восстанови результат предыдущего сохранения.'); this.name = 'CreationConflictError'; }
}

import { createHash } from 'node:crypto';
import { canonicalLibraryCreateInput, type CreateLibraryItemInput } from '../contracts/library.ts';

export function libraryCreationInputHash(input: CreateLibraryItemInput): string {
  return createHash('sha256').update(JSON.stringify(canonicalLibraryCreateInput(input))).digest('hex');
}
export class LibraryCreationConflictError extends Error {
  constructor() { super('Исходный запрос создания заготовки изменился. Сначала проверь предыдущий результат.'); this.name = 'LibraryCreationConflictError'; }
}
export class LibraryCreationDeletedError extends Error {
  constructor() { super('Предыдущая заготовка была создана и затем удалена.'); this.name = 'LibraryCreationDeletedError'; }
}

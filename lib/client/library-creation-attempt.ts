import { z } from 'zod';
import { canonicalLibraryCreateInput, libraryCreationKeySchema } from '../contracts/library.ts';
import type { LibraryRecoveryStorage } from './library-editor-recovery.ts';

export type LibraryCreationAttempt = {
  version: 1; creationKey: string; editorToken: string; editorRevision: number;
  input: { title: string | null; text: string; mediaIds: string[] };
};
const MAX_SERIALIZED_ATTEMPT = 150_000;
const schema = z.object({
  version: z.literal(1), creationKey: libraryCreationKeySchema, editorToken: z.string().uuid(),
  editorRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  input: z.object({ title: z.string().trim().max(200).nullable(), text: z.string().trim().max(20_000),
    mediaIds: z.array(z.string().min(1).max(200)).max(20).refine(ids => new Set(ids).size === ids.length),
  }).strict().refine(input => input.text.length > 0 || input.mediaIds.length > 0),
}).strict();

export function libraryCreationAttemptKey(ownerId: string): string {
  return `planly:library-create:v1:${encodeURIComponent(ownerId)}`;
}
function encoded(value: LibraryCreationAttempt): string {
  return JSON.stringify({ version: value.version, creationKey: value.creationKey, editorToken: value.editorToken,
    editorRevision: value.editorRevision, input: canonicalLibraryCreateInput(value.input) });
}
function decode(raw: string | null): LibraryCreationAttempt | null {
  if (raw === null || raw.length > MAX_SERIALIZED_ATTEMPT) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...parsed.data, input: canonicalLibraryCreateInput(parsed.data.input) } : null;
  } catch { return null; }
}
export function readLibraryCreationAttempt(storage: LibraryRecoveryStorage, ownerId: string): {
  attempt: LibraryCreationAttempt | null; unavailable: boolean; invalid: boolean;
} {
  try {
    const raw = storage.getItem(libraryCreationAttemptKey(ownerId)), attempt = decode(raw);
    return { attempt, unavailable: false, invalid: raw !== null && attempt === null };
  } catch { return { attempt: null, unavailable: true, invalid: false }; }
}
export function writeLibraryCreationAttempt(storage: LibraryRecoveryStorage, ownerId: string, attempt: LibraryCreationAttempt): boolean {
  try {
    const parsed = schema.safeParse(attempt);
    if (!parsed.success) return false;
    const raw = encoded(parsed.data);
    if (raw.length > MAX_SERIALIZED_ATTEMPT) return false;
    const current = readLibraryCreationAttempt(storage, ownerId);
    // Never replace a corrupt or different unresolved intent.
    if (current.unavailable || current.invalid || current.attempt && encoded(current.attempt) !== raw) return false;
    const key = libraryCreationAttemptKey(ownerId);
    storage.setItem(key, raw);
    return storage.getItem(key) === raw;
  } catch { return false; }
}
export function clearLibraryCreationAttempt(storage: LibraryRecoveryStorage, ownerId: string, expectedAttempt: LibraryCreationAttempt): boolean {
  try {
    const parsed = schema.safeParse(expectedAttempt);
    if (!parsed.success) return false;
    const current = readLibraryCreationAttempt(storage, ownerId);
    if (current.unavailable || current.invalid || !current.attempt || encoded(current.attempt) !== encoded(parsed.data)) return false;
    const key = libraryCreationAttemptKey(ownerId);
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch { return false; }
}

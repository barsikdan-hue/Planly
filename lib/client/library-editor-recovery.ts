import { z } from 'zod';
import type { LibraryItemDto } from '../contracts/library.ts';
import type { Media } from '../planner.ts';

export type LibraryRecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LibraryEditorFields = { id?: string; title: string; text: string; mediaIds: string[] };
export type LibraryEditorSnapshot = { version: 1; token: string; revision: number; editor: LibraryEditorFields };
const schema = z.object({
  version: z.literal(1), token: z.string().uuid(), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  editor: z.object({ id: z.string().min(1).max(200).optional(), title: z.string(), text: z.string(),
    mediaIds: z.array(z.string().min(1).max(200)).max(20).refine(ids => new Set(ids).size === ids.length) }),
});

export function libraryRecoveryStorage(): LibraryRecoveryStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}
export function libraryEditorKey(ownerId: string): string { return `planly:library-editor:v1:${encodeURIComponent(ownerId)}`; }
export function libraryEditorFields(fields: LibraryEditorFields): LibraryEditorFields {
  return { ...(fields.id !== undefined ? { id: fields.id } : {}), title: fields.title, text: fields.text, mediaIds: [...fields.mediaIds] };
}
function encoded(snapshot: LibraryEditorSnapshot): string {
  return JSON.stringify({ version: snapshot.version, token: snapshot.token, revision: snapshot.revision, editor: libraryEditorFields(snapshot.editor) });
}
function decode(raw: string | null): LibraryEditorSnapshot | null {
  if (!raw || raw.length > 150_000) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...parsed.data, editor: libraryEditorFields(parsed.data.editor) } : null;
  } catch { return null; }
}
export function readLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string): {
  snapshot: LibraryEditorSnapshot | null; unavailable: boolean; invalid: boolean;
} {
  try {
    const raw = storage.getItem(libraryEditorKey(ownerId)); const snapshot = decode(raw);
    return { snapshot, unavailable: false, invalid: raw !== null && snapshot === null };
  } catch { return { snapshot: null, unavailable: true, invalid: false }; }
}
export function writeLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string, snapshot: LibraryEditorSnapshot): boolean {
  try {
    const raw = encoded(snapshot);
    if (!decode(raw)) return false;
    storage.setItem(libraryEditorKey(ownerId), raw); return true;
  } catch { return false; }
}
export function clearSavedLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string, submitted: LibraryEditorSnapshot): boolean {
  try {
    const current = decode(storage.getItem(libraryEditorKey(ownerId)));
    if (!current || encoded(current) !== encoded(submitted)) return false;
    storage.removeItem(libraryEditorKey(ownerId)); return true;
  } catch { return false; }
}
// Explicit discard is authorized by identity, unlike acknowledgement cleanup.
// This allows cancelling an older same-token cache after a failed current write.
export function discardLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string, token: string): boolean {
  try {
    const raw = storage.getItem(libraryEditorKey(ownerId));
    if (raw === null) return true;
    const current = decode(raw);
    if (!current || current.token !== token) return false;
    storage.removeItem(libraryEditorKey(ownerId)); return true;
  } catch { return false; }
}
export function restoreLibraryEditorRecovery(snapshot: LibraryEditorSnapshot, items: Pick<LibraryItemDto, 'id'>[], media: Pick<Media, 'id'>[]): {
  snapshot: LibraryEditorSnapshot; missingItem: boolean; missingMediaCount: number;
} {
  const available = new Set(media.map(asset => asset.id));
  const mediaIds = snapshot.editor.mediaIds.filter(id => available.has(id));
  return { snapshot: { ...snapshot, editor: { ...libraryEditorFields(snapshot.editor), mediaIds } },
    missingItem: !!snapshot.editor.id && !items.some(item => item.id === snapshot.editor.id),
    missingMediaCount: snapshot.editor.mediaIds.length - mediaIds.length };
}

import { z } from 'zod';
import { savePostInputSchema, type SavePostInput } from '../contracts/planner.ts';
import { canonicalCreationInput } from '../post-creation.ts';
import { editorFields, editorFieldsSchema, type EditorFields, type RecoveryStorage } from './editor-recovery.ts';
import { PlanlyApiError, savePost } from './planly-api.ts';

const pendingSchema = z.object({ version: z.literal(1), key: z.string().uuid(),
  input: savePostInputSchema, editor: editorFieldsSchema,
  intent: z.enum(['draft', 'scheduled', 'now']), editorToken: z.string().uuid(), activeEditorToken: z.string().uuid(),
  acknowledgedId: z.string().min(1).optional() });
export type PendingCreation = z.infer<typeof pendingSchema>;
export type CreationIntent = PendingCreation['intent'];
export const pendingCreationKey = (ownerId: string) => `planly:pending-create:v1:${encodeURIComponent(ownerId)}`;

export function readPendingCreation(storage: RecoveryStorage, ownerId: string): PendingCreation | null {
  const raw = storage.getItem(pendingCreationKey(ownerId));
  if (!raw) return null;
  if (raw.length > 150_000) throw new Error('Запись предыдущего сохранения повреждена. Новый пост не отправлен.');
  try { return pendingSchema.parse(JSON.parse(raw)); }
  catch { throw new Error('Запись предыдущего сохранения повреждена. Новый пост не отправлен.'); }
}
export function writePendingCreation(storage: RecoveryStorage, ownerId: string, pending: PendingCreation): void {
  const raw = JSON.stringify(pendingSchema.parse(pending));
  if (raw.length > 150_000) throw new Error('Запрос слишком большой для надёжного восстановления в этой вкладке. Сократи текст перед сохранением.');
  storage.setItem(pendingCreationKey(ownerId), raw);
}
export function completePendingCreation(storage: RecoveryStorage, ownerId: string, key: string): void {
  const pending = readPendingCreation(storage, ownerId);
  if (pending?.key === key) storage.removeItem(pendingCreationKey(ownerId));
}
export function replacePendingEditor(storage: RecoveryStorage, ownerId: string, editorToken: string): void {
  const pending = readPendingCreation(storage, ownerId);
  if (pending) writePendingCreation(storage, ownerId, { ...pending, activeEditorToken: editorToken });
}

// No submission occurs during hydration. The caller invokes this only for an explicit save/retry.
export async function submitPendingCreation(storage: RecoveryStorage, ownerId: string, editorToken: string,
  editor: EditorFields, input: () => SavePostInput, intent: CreationIntent) {
  let pending = readPendingCreation(storage, ownerId);
  if (!pending) {
    pending = { version: 1, key: crypto.randomUUID(), input: savePostInputSchema.parse(input()),
      editor: editorFields(editor), intent, editorToken, activeEditorToken: editorToken };
    // If persistence fails, never dispatch an unrepeatable creation request.
    writePendingCreation(storage, ownerId, pending);
  }
  let saved;
  try { saved = await savePost(pending.input, undefined, pending.key); }
  catch (error) {
    if (error instanceof PlanlyApiError && [400, 404, 422].includes(error.status)) completePendingCreation(storage, ownerId, pending.key);
    throw error;
  }
  pending = { ...pending, activeEditorToken: readPendingCreation(storage, ownerId)?.activeEditorToken ?? pending.activeEditorToken, acknowledgedId: saved.id };
  // A failed acknowledgement write still leaves the original key safely replayable.
  try { writePendingCreation(storage, ownerId, pending); } catch { /* Original durable request remains. */ }
  const belongsToEditor = pending.editorToken === editorToken;
  let updateError: unknown;
  if (belongsToEditor) {
    const currentFields = editorFields(editor);
    if (currentFields.id === pending.acknowledgedId) currentFields.id = pending.editor.id;
    const unchanged = JSON.stringify(currentFields) === JSON.stringify(pending.editor) && intent === pending.intent;
    try {
      const desired = unchanged ? pending.input : input();
      if (canonicalCreationInput(desired) !== canonicalCreationInput(pending.input)) saved = await savePost(desired, saved.id);
    } catch (error) { updateError = error; }
  }
  return { saved, pending, belongsToEditor, updateError };
}

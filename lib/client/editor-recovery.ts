import { z } from 'zod';
import { blankPost, type Media, type Post } from '../planner.ts';

export type EditorFields = Pick<Post, 'id' | 'text' | 'networks' | 'date' | 'time' | 'mediaIds' | 'overrides' | 'sourceLibraryItemId'>;
export type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const editorUiSchema = z.object({ publishMode: z.enum(['now', 'scheduled']) }).strict();
export type EditorUiIntent = z.infer<typeof editorUiSchema>;
// Corrupt optional UI must not invalidate recoverable content or frozen requests.
export const optionalEditorUiSchema = z.preprocess(value => {
  const parsed = editorUiSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}, editorUiSchema.optional());
export function initialEditorUi(post: Pick<Post, 'status'>): EditorUiIntent {
  return { publishMode: post.status === 'scheduled' ? 'scheduled' : 'now' };
}
const recoverySchema = z.object({
  version: z.literal(1),
  ui: optionalEditorUiSchema,
  editor: z.object({
    id: z.string().max(200), text: z.string(), date: z.string().max(10), time: z.string().max(5),
    sourceLibraryItemId: z.string().min(1).max(200).nullable().optional(),
    networks: z.array(z.enum(['telegram', 'max'])).max(2).refine(values => new Set(values).size === values.length),
    mediaIds: z.array(z.string().min(1).max(200)).refine(values => new Set(values).size === values.length),
    overrides: z.object({ telegram: z.string().optional(), max: z.string().optional() }).strict(),
  }),
});
export const editorFieldsSchema = recoverySchema.shape.editor;

export function editorKey(ownerId: string): string { return `planly:editor:v1:${encodeURIComponent(ownerId)}`; }

export function editorFields(post: EditorFields): EditorFields {
  const overrides: Post['overrides'] = {};
  for (const network of ['telegram', 'max'] as const) {
    if (post.overrides[network] !== undefined) overrides[network] = post.overrides[network];
  }
  return { id: post.id, text: post.text, networks: [...post.networks], date: post.date, time: post.time,
    mediaIds: [...post.mediaIds], overrides, sourceLibraryItemId: post.sourceLibraryItemId ?? null };
}

function encoded(fields: EditorFields, ui?: EditorUiIntent): string {
  return JSON.stringify({ version: 1, editor: editorFields(fields), ...(ui ? { ui: editorUiSchema.parse(ui) } : {}) });
}

function decode(raw: string | null): { editor: EditorFields; ui?: EditorUiIntent } | null {
  if (!raw || raw.length > 150_000) return null;
  try {
    const parsed = recoverySchema.safeParse(JSON.parse(raw));
    return parsed.success ? { editor: editorFields(parsed.data.editor), ...(parsed.data.ui ? { ui: parsed.data.ui } : {}) } : null;
  } catch { return null; }
}

export function sessionRecoveryStorage(): RecoveryStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

export function readRecovery(storage: RecoveryStorage, ownerId: string): { editor: EditorFields | null; ui?: EditorUiIntent; unavailable: boolean; invalid: boolean } {
  try {
    const raw = storage.getItem(editorKey(ownerId));
    const cached = decode(raw);
    return { editor: cached?.editor ?? null, ...(cached?.ui ? { ui: cached.ui } : {}), unavailable: false, invalid: raw !== null && cached === null };
  } catch { return { editor: null, unavailable: true, invalid: false }; }
}

export function writeRecovery(storage: RecoveryStorage, ownerId: string, fields: EditorFields, ui?: EditorUiIntent): boolean {
  try {
    const raw = encoded(fields, ui);
    // Editor state can temporarily exceed submission limits. Never report a
    // successful write that the next reload cannot decode; keep the older copy.
    if (!decode(raw)) return false;
    storage.setItem(editorKey(ownerId), raw);
    return true;
  } catch { return false; }
}

export function clearSavedRecovery(storage: RecoveryStorage, ownerId: string, submitted: EditorFields, submittedUi?: EditorUiIntent): boolean {
  try {
    const current = decode(storage.getItem(editorKey(ownerId)));
    if (current && encoded(current.editor) !== encoded(submitted)) return false;
    if (submittedUi && (!current || current.ui?.publishMode !== submittedUi.publishMode)) return false;
    storage.removeItem(editorKey(ownerId));
    return true;
  } catch { return false; }
}

export function restoreRecovery(fields: EditorFields, posts: Post[], media: Pick<Media, 'id'>[]): {
  draft: Post; missingPost: boolean; missingMediaCount: number;
} {
  const currentPost = fields.id ? posts.find(post => post.id === fields.id) : undefined;
  const available = new Set(media.map(item => item.id));
  const mediaIds = fields.mediaIds.filter(id => available.has(id));
  return { draft: { ...(currentPost ?? blankPost()), ...editorFields(fields), id: currentPost?.id ?? '', mediaIds,
    sourceLibraryItemId: fields.id ? null : fields.sourceLibraryItemId ?? null },
    missingPost: !!fields.id && !currentPost, missingMediaCount: fields.mediaIds.length - mediaIds.length };
}

export function shouldReplaceEditor(current: Post, next: Post, posts: Post[]): boolean {
  const saved = current.id ? posts.find(post => post.id === current.id) : undefined;
  const unsaved = saved ? encoded(current) !== encoded(saved)
    : !!current.text.trim() || current.mediaIds.length > 0 || Object.values(current.overrides).some(text => !!text?.trim());
  return unsaved && encoded(current) !== encoded(next);
}

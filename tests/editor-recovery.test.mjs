import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPost } from '../lib/planner.ts';
import { editorFields, editorKey, readRecovery, writeRecovery, clearSavedRecovery, restoreRecovery, shouldReplaceEditor } from '../lib/client/editor-recovery.ts';

function memoryStorage() {
  const data = new Map();
  return { getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { data.set(key, value); }, removeItem(key) { data.delete(key); } };
}
const editor = () => ({ ...blankPost(), text: 'Несохранённая идея', networks: ['max', 'telegram'],
  date: '2099-10-04', time: '19:45', mediaIds: ['B', 'A'], overrides: { telegram: 'Telegram текст', max: 'MAX текст' } });

test('same-tab reload restores all editable fields and existing upload ids in their order', () => {
  const storage = memoryStorage();
  const draft = editor();
  assert.equal(writeRecovery(storage, 'owner', draft), true);
  const read = readRecovery(storage, 'owner');
  assert.deepEqual(read.editor, editorFields(draft));
  const restored = restoreRecovery(read.editor, [], [{ id: 'A' }, { id: 'B' }]);
  assert.deepEqual(editorFields(restored.draft), editorFields(draft));
  assert.deepEqual(restored.draft.targets, []);
});

test('owner isolation and independent tab storage do not expose another editor', () => {
  const tabA = memoryStorage(), tabB = memoryStorage();
  writeRecovery(tabA, 'owner-a', editor());
  assert.equal(readRecovery(tabA, 'owner-b').editor, null);
  assert.equal(readRecovery(tabB, 'owner-a').editor, null);
});

test('current server publication state replaces cached metadata; recovery never includes links or tokens', () => {
  const storage = memoryStorage();
  const changed = { ...editor(), id: 'saved-post', status: 'failed', targets: [{ network: 'telegram', status: 'failed', error: 'old error' }] };
  writeRecovery(storage, 'owner', changed);
  const raw = storage.getItem(editorKey('owner'));
  assert.equal(raw.includes('targets'), false);
  assert.equal(raw.includes('status'), false);
  const current = { ...blankPost(), id: 'saved-post', text: 'Server text', status: 'published', targets: [{ network: 'telegram', status: 'published', remoteUrl: 'https://t.me/fixture/1' }] };
  const restored = restoreRecovery(readRecovery(storage, 'owner').editor, [current], [{ id: 'A' }, { id: 'B' }]);
  assert.equal(restored.draft.id, 'saved-post');
  assert.equal(restored.draft.text, changed.text);
  assert.equal(restored.draft.status, 'published');
  assert.deepEqual(restored.draft.targets, current.targets);
});

test('deleted post becomes new draft and stale media ids are removed without losing text', () => {
  const recovered = restoreRecovery({ ...editorFields(editor()), id: 'deleted-post' }, [], [{ id: 'A' }]);
  assert.equal(recovered.missingPost, true);
  assert.equal(recovered.missingMediaCount, 1);
  assert.equal(recovered.draft.id, '');
  assert.equal(recovered.draft.status, 'draft');
  assert.deepEqual(recovered.draft.mediaIds, ['A']);
  assert.equal(recovered.draft.text, editor().text);
});

test('malformed, unsupported-version and oversized recovery is ignored', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, editor: editorFields(editor()) }), 'x'.repeat(150_001), JSON.stringify({ version: 1, editor: { ...editorFields(editor()), networks: ['instagram'] } })]) {
    const storage = memoryStorage(); storage.setItem(editorKey('owner'), raw);
    assert.deepEqual(readRecovery(storage, 'owner'), { editor: null, unavailable: false, invalid: true });
  }
});

test('storage read, write, and removal exceptions report failure without crashing editor', () => {
  const storage = { getItem() { throw Error('Blocked'); }, setItem() { throw Error('Quota'); }, removeItem() { throw Error('Blocked'); } };
  assert.equal(readRecovery(storage, 'owner').unavailable, true);
  assert.equal(writeRecovery(storage, 'owner', editor()), false);
  assert.equal(clearSavedRecovery(storage, 'owner', editor()), false);
});

test('successful save clears only matching submission; switching or editing while pending retains new work', () => {
  const storage = memoryStorage(), submitted = editor();
  writeRecovery(storage, 'owner', submitted);
  assert.equal(clearSavedRecovery(storage, 'owner', submitted), true);
  assert.equal(readRecovery(storage, 'owner').editor, null);
  const next = { ...editor(), text: 'Другой незавершённый пост' };
  writeRecovery(storage, 'owner', next);
  assert.equal(clearSavedRecovery(storage, 'owner', submitted), false);
  assert.equal(readRecovery(storage, 'owner').editor.text, next.text);
});

test('temporarily exceeding submission media and text limits still restores the editor', () => {
  const storage = memoryStorage();
  const draft = { ...editor(), mediaIds: Array.from({ length: 21 }, (_, index) => `media-${index}`),
    text: 'x'.repeat(20_000) + '\n#недвижимость #сочи', overrides: { max: 'y'.repeat(20_050) } };
  assert.equal(writeRecovery(storage, 'owner', draft), true);
  const restored = readRecovery(storage, 'owner').editor;
  assert.equal(restored.mediaIds.length, 21);
  assert.equal(restored.text.length, 20_020);
  assert.equal(restored.overrides.max.length, 20_050);
});

test('recovery raw-size rejection keeps the previous usable copy and reports failure', () => {
  const storage = memoryStorage();
  writeRecovery(storage, 'owner', editor());
  assert.equal(writeRecovery(storage, 'owner', { ...editor(), text: 'x'.repeat(150_000) }), false);
  assert.equal(readRecovery(storage, 'owner').editor.text, 'Несохранённая идея');
});

test('replacement guard protects meaningful changes, ignores pristine editor and unchanged saved post', () => {
  assert.equal(shouldReplaceEditor(blankPost(), editor(), []), false);
  assert.equal(shouldReplaceEditor(editor(), blankPost(), []), true);
  assert.equal(shouldReplaceEditor(editor(), editor(), []), false);
  assert.equal(shouldReplaceEditor(editor(), { ...editor(), overrides: { max: 'MAX текст', telegram: 'Telegram текст' } }, []), false);
  const saved = { ...editor(), id: 'saved' };
  assert.equal(shouldReplaceEditor(saved, blankPost(), [saved]), false);
  assert.equal(shouldReplaceEditor({ ...saved, text: 'Changed' }, blankPost(), [saved]), true);
  assert.equal(shouldReplaceEditor({ ...blankPost(), overrides: { max: 'Override only' } }, blankPost(), []), true);
});

test('Library Composer source round-trips in v1 editor recovery with stale media filtering', () => {
  const storage = memoryStorage();
  const draft = { ...editor(), sourceLibraryItemId:'library-source' };
  assert.equal(writeRecovery(storage, 'owner', draft), true);
  const raw = JSON.parse(storage.getItem(editorKey('owner')));
  assert.equal(raw.version, 1);
  assert.equal(raw.editor.sourceLibraryItemId, 'library-source');
  const recovered = restoreRecovery(readRecovery(storage, 'owner').editor, [], [{ id:'A' }]);
  assert.equal(recovered.draft.sourceLibraryItemId, 'library-source');
  assert.equal(recovered.missingMediaCount, 1);
  assert.deepEqual(recovered.draft.mediaIds, ['A']);
});

test('old v1 editor without source restores and existing Post recovery clears stale source', () => {
  const storage = memoryStorage();
  const legacy = { id:'', text:'Legacy', networks:['telegram'], date:'2030-01-01', time:'10:00', mediaIds:[], overrides:{} };
  storage.setItem(editorKey('owner'), JSON.stringify({ version:1, editor:legacy }));
  const read = readRecovery(storage, 'owner');
  assert.equal(read.invalid, false);
  assert.equal(read.editor.text, 'Legacy');
  assert.equal(restoreRecovery(read.editor, [], []).draft.sourceLibraryItemId, null);
  const existing = { ...blankPost(), id:'saved', text:'Server' };
  assert.equal(restoreRecovery({ ...legacy, id:'saved', sourceLibraryItemId:'stale-library' }, [existing], []).draft.sourceLibraryItemId, null);
  assert.equal(restoreRecovery({ ...legacy, id:'deleted', sourceLibraryItemId:'stale-library' }, [], []).draft.sourceLibraryItemId, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { LibraryEditorFields } from '../lib/client/library-editor-recovery.ts';
// An absent new helper is a capability RED, not a loader configuration error.
const recovery = await import('../lib/client/library-editor-recovery.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});
function api() { assert.ok(recovery, 'Library recovery capability must exist'); return recovery; }
const key = 'planly:library-editor:v1:owner';
const token = '01234567-1234-4123-8123-0123456789ab';
const other = '01234567-1234-4123-8123-0123456789ac';
const snapshot = (editor: LibraryEditorFields = { title: '  title  ', text: '\n raw text \n', mediaIds: ['B', 'A'] }, revision = 2) =>
  ({ version: 1 as const, token, revision, editor });
function storage() {
  const values = new Map<string, string>();
  return { values, failRead: false, failWrite: false, failRemove: false,
    getItem(name: string) { if (this.failRead) throw Error('read denied'); return values.get(name) ?? null; },
    setItem(name: string, value: string) { if (this.failWrite) throw Error('quota'); values.set(name, value); },
    removeItem(name: string) { if (this.failRemove) throw Error('remove denied'); values.delete(name); } };
}
test('Library recovery round-trips raw fields and ordered IDs without leaking lifecycle', () => {
  const r = api(), cache = storage();
  const full = { ...snapshot().editor, id: 'existing', status: 'USED', sourcePostId: 'post', updatedAt: 'old' };
  assert.equal(r.writeLibraryEditorRecovery(cache, 'owner', snapshot(full)), true);
  assert.deepEqual(JSON.parse(cache.values.get(key)!), { version: 1, token, revision: 2,
    editor: { id: 'existing', title: '  title  ', text: '\n raw text \n', mediaIds: ['B', 'A'] } });
  assert.deepEqual(r.readLibraryEditorRecovery(cache, 'owner'), { snapshot: snapshot(r.libraryEditorFields(full)), unavailable: false, invalid: false });
  const projected = r.libraryEditorFields(full); projected.mediaIds.reverse(); assert.deepEqual(full.mediaIds, ['B', 'A']);
});
for (const [name, editor] of [
  ['empty', { title: '', text: '', mediaIds: [] }],
  ['title only', { title: 'Idea', text: '', mediaIds: [] }],
  ['media only', { title: '', text: '', mediaIds: ['A'] }],
  ['whitespace', { title: ' ', text: '\n ', mediaIds: [] }],
] as const) test(`Library recovery keeps ${name} work without submission validation`, () => {
  const r = api(), cache = storage(), value = snapshot({ ...editor, mediaIds: [...editor.mediaIds] });
  assert.equal(r.writeLibraryEditorRecovery(cache, 'owner', value), true);
  assert.deepEqual(r.readLibraryEditorRecovery(cache, 'owner').snapshot, value);
});
test('Library keys isolate owners, tabs and Composer recovery', () => {
  const r = api(), cache = storage(); r.writeLibraryEditorRecovery(cache, 'owner', snapshot());
  assert.equal(r.libraryEditorKey('a/b'), 'planly:library-editor:v1:a%2Fb');
  assert.equal(r.readLibraryEditorRecovery(cache, 'another').snapshot, null);
  assert.equal(r.readLibraryEditorRecovery(storage(), 'owner').snapshot, null);
  cache.values.set('planly:editor:v1:owner', 'composer');
  assert.equal(r.discardLibraryEditorRecovery(cache, 'owner', token), true);
  assert.equal(cache.values.get('planly:editor:v1:owner'), 'composer');
});
test('Library recovery rejects corrupt envelopes without overwriting older work', () => {
  const r = api(), cache = storage();
  const invalid = [ { ...snapshot(), version: 2 }, { ...snapshot(), token: 'bad' },
    { ...snapshot(), revision: -1 }, { ...snapshot(), revision: 1.5 },
    snapshot({ title: '', text: '', mediaIds: ['A', 'A'] }),
    snapshot({ title: '', text: '', mediaIds: Array.from({ length: 21 }, (_, i) => String(i)) }),
    snapshot({ title: '', text: 'x'.repeat(150000), mediaIds: [] }),
    { ...snapshot(), editor: { ...snapshot().editor, id: '' } } ];
  for (const value of invalid) {
    cache.values.set(key, 'older');
    assert.equal(r.writeLibraryEditorRecovery(cache, 'owner', value as never), false);
    assert.equal(cache.values.get(key), 'older');
    cache.values.set(key, JSON.stringify(value));
    assert.deepEqual(r.readLibraryEditorRecovery(cache, 'owner'), { snapshot: null, unavailable: false, invalid: true });
  }
  for (const raw of ['{', 'x'.repeat(150001)]) {
    cache.values.set(key, raw); assert.equal(r.readLibraryEditorRecovery(cache, 'owner').invalid, true);
  }
});
test('Missing Library source keeps existing ID while absent media alone are filtered', () => {
  const r = api(), value = snapshot({ ...snapshot().editor, id: 'deleted', mediaIds: ['B', 'gone', 'A'] });
  const restored = r.restoreLibraryEditorRecovery(value, [], [{ id: 'A' }, { id: 'B' }]);
  assert.deepEqual(restored, { snapshot: { ...value, editor: { id: 'deleted', title: '  title  ', text: '\n raw text \n', mediaIds: ['B', 'A'] } }, missingItem: true, missingMediaCount: 1 });
  assert.deepEqual(value.editor.mediaIds, ['B', 'gone', 'A']);
});
test('Known source and available media restore without a conflict', () => {
  const r = api(), value = snapshot({ ...snapshot().editor, id: 'existing' });
  assert.deepEqual(r.restoreLibraryEditorRecovery(value, [{ id: 'existing' }], [{ id: 'A' }, { id: 'B' }]),
    { snapshot: value, missingItem: false, missingMediaCount: 0 });
});
test('Saved cleanup requires exact token revision raw content and attachment order', () => {
  const r = api(), cache = storage(), value = snapshot();
  for (const changed of [ { ...value, token: other }, { ...value, revision: 3 },
    snapshot({ ...value.editor, title: 'title' }), snapshot({ ...value.editor, text: 'new' }),
    snapshot({ ...value.editor, mediaIds: ['A', 'B'] }) ]) {
    r.writeLibraryEditorRecovery(cache, 'owner', changed);
    assert.equal(r.clearSavedLibraryEditorRecovery(cache, 'owner', value), false);
    assert.equal(cache.values.has(key), true);
  }
  r.writeLibraryEditorRecovery(cache, 'owner', value);
  assert.equal(r.clearSavedLibraryEditorRecovery(cache, 'owner', value), true);
  assert.equal(cache.values.has(key), false);
  assert.equal(r.clearSavedLibraryEditorRecovery(cache, 'owner', value), false, 'missing cache is not saved durability');
});
test('Explicit Cancel may discard older same-token cache after a failed write', () => {
  const r = api(), cache = storage(); r.writeLibraryEditorRecovery(cache, 'owner', snapshot());
  cache.failWrite = true; assert.equal(r.writeLibraryEditorRecovery(cache, 'owner', snapshot({ title: 'new', text: 'new', mediaIds: [] }, 3)), false);
  assert.equal(r.discardLibraryEditorRecovery(cache, 'owner', token), true);
  assert.equal(cache.values.has(key), false);
  assert.equal(r.discardLibraryEditorRecovery(cache, 'owner', token), true, 'absent cache allows explicit discard');
});
test('Explicit Cancel cannot discard another token or invalid record', () => {
  const r = api(), cache = storage();
  for (const raw of [JSON.stringify({ ...snapshot(), token: other }), '{']) {
    cache.values.set(key, raw); assert.equal(r.discardLibraryEditorRecovery(cache, 'owner', token), false);
    assert.equal(cache.values.get(key), raw);
  }
});
test('Storage denial and removal failure never report Library durability success', () => {
  const r = api(), cache = storage(); r.writeLibraryEditorRecovery(cache, 'owner', snapshot());
  const old = cache.values.get(key); cache.failWrite = true;
  assert.equal(r.writeLibraryEditorRecovery(cache, 'owner', snapshot()), false); assert.equal(cache.values.get(key), old);
  cache.failRemove = true;
  assert.equal(r.clearSavedLibraryEditorRecovery(cache, 'owner', snapshot()), false);
  assert.equal(r.discardLibraryEditorRecovery(cache, 'owner', token), false); assert.equal(cache.values.get(key), old);
  cache.failRead = true;
  assert.deepEqual(r.readLibraryEditorRecovery(cache, 'owner'), { snapshot: null, unavailable: true, invalid: false });
  assert.equal(r.discardLibraryEditorRecovery(cache, 'owner', token), false);
});

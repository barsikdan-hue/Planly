import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPost } from '../lib/planner.ts';
import * as recovery from '../lib/client/editor-recovery.ts';

function storage() {
  const items = new Map<string, string>();
  return { items, getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
}
const draft = () => ({ ...blankPost(), text: 'Unsaved intent', date: '2099-10-04', time: '18:00', mediaIds: ['A'] });

for (const publishMode of ['now', 'scheduled'] as const) test(`atomic recovery round-trips ${publishMode} separately from Draft lifecycle`, () => {
  const cache = storage(), post = draft(), ui = { publishMode };
  assert.equal(recovery.writeRecovery(cache, 'owner', post, ui), true);
  const read = recovery.readRecovery(cache, 'owner');
  assert.deepEqual(read.editor, recovery.editorFields(post));
  assert.deepEqual(read.ui, ui);
  const raw = JSON.parse(cache.getItem(recovery.editorKey('owner'))!);
  assert.equal(raw.version, 1); assert.deepEqual(raw.ui, ui);
  assert.equal('status' in raw.editor, false); assert.equal('targets' in raw.editor, false);
  assert.equal('publishMode' in raw.editor, false);
  assert.equal(recovery.restoreRecovery(read.editor!, [], [{ id: 'A' }]).draft.status, 'draft');
});

test('stored Now UI never replaces authoritative scheduled server lifecycle or targets', () => {
  const cache = storage(), server = { ...draft(), id: 'saved', status: 'scheduled' as const,
    targets: [{ network: 'telegram' as const, status: 'scheduled' as const }] };
  recovery.writeRecovery(cache, 'owner', server, { publishMode: 'now' });
  const read = recovery.readRecovery(cache, 'owner');
  const restored = recovery.restoreRecovery(read.editor!, [server], [{ id: 'A' }]);
  assert.equal(restored.draft.status, 'scheduled'); assert.deepEqual(restored.draft.targets, server.targets);
  assert.deepEqual(read.ui, { publishMode: 'now' });
});

test('legacy v1 content remains valid without optional UI metadata', () => {
  const cache = storage(); cache.setItem(recovery.editorKey('owner'), JSON.stringify({ version: 1, editor: recovery.editorFields(draft()) }));
  const read = recovery.readRecovery(cache, 'owner');
  assert.equal(read.invalid, false); assert.deepEqual(read.editor, recovery.editorFields(draft()));
  assert.equal(read.ui, undefined);
});

test('malformed optional UI under the envelope size limit salvages valid text and media', () => {
  for (const ui of [null, 42, [], {}, { publishMode: 'later' }, { publishMode: 'x'.repeat(1000) }, { publishMode: 'scheduled', unrelated: true }]) {
    const cache = storage(); cache.setItem(recovery.editorKey('owner'), JSON.stringify({ version: 1, editor: recovery.editorFields(draft()), ui }));
    const read = recovery.readRecovery(cache, 'owner');
    assert.equal(read.invalid, false); assert.equal(read.ui, undefined);
    assert.deepEqual(read.editor, recovery.editorFields(draft()));
  }
});

test('valid optional UI does not bypass invalid content, version or whole-envelope size rejection', () => {
  for (const raw of [JSON.stringify({ version: 1, editor: { ...recovery.editorFields(draft()), networks: ['vk'] }, ui: { publishMode: 'now' } }),
    JSON.stringify({ version: 2, editor: recovery.editorFields(draft()), ui: { publishMode: 'now' } }), 'x'.repeat(150001)]) {
    const cache = storage(); cache.setItem(recovery.editorKey('owner'), raw);
    assert.deepEqual(recovery.readRecovery(cache, 'owner'), { editor: null, unavailable: false, invalid: true });
  }
});

test('cleanup cannot discard a newer UI-only choice with identical content', () => {
  const cache = storage(), post = draft(); recovery.writeRecovery(cache, 'owner', post, { publishMode: 'scheduled' });
  assert.equal(recovery.clearSavedRecovery(cache, 'owner', post, { publishMode: 'now' }), false);
  assert.ok(cache.getItem(recovery.editorKey('owner')));
  assert.equal(recovery.clearSavedRecovery(cache, 'owner', post, { publishMode: 'scheduled' }), true);
  assert.equal(cache.getItem(recovery.editorKey('owner')), null);
});

test('legacy content-only cleanup remains compatible with optional metadata', () => {
  const cache = storage(), post = draft(); recovery.writeRecovery(cache, 'owner', post, { publishMode: 'scheduled' });
  assert.equal(recovery.clearSavedRecovery(cache, 'owner', post), true);
});

test('failed atomic write retains the older usable content/UI pair; owner and tab remain isolated', () => {
  const cache = storage(), post = draft(); recovery.writeRecovery(cache, 'owner', post, { publishMode: 'now' });
  const before = cache.getItem(recovery.editorKey('owner'));
  const blocked = { ...cache, setItem() { throw Error('Quota'); } };
  assert.equal(recovery.writeRecovery(blocked, 'owner', { ...post, text: 'Newer' }, { publishMode: 'scheduled' }), false);
  assert.equal(cache.getItem(recovery.editorKey('owner')), before);
  assert.equal(recovery.readRecovery(cache, 'other-owner').editor, null);
  assert.equal(recovery.readRecovery(storage(), 'owner').editor, null);
});

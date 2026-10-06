import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { blankPost } from '../lib/planner.ts';
import { editorFields, type EditorUiIntent } from '../lib/client/editor-recovery.ts';
import { pendingCreationKey, readPendingCreation, submitPendingCreation } from '../lib/client/pending-creation.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function storage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
}
const token = 'bec6f2d4-9ee5-44c2-9c9f-e7b347ac19e3';
const key = '6ef09690-e21c-4073-a579-87215f49b8df';
const editor = () => ({ ...blankPost(), text: 'Once' });
const input = { baseText: 'Once', status: 'DRAFT' as const, targets: [], mediaIds: [] };

test('new Composer request captures a separate UI snapshot before fetch and retains it after acknowledgement', async () => {
  const cache = storage(), post = editor();
  const ui: EditorUiIntent = { publishMode: 'scheduled' };
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(readPendingCreation(cache, 'owner')?.editorUi, { publishMode: 'scheduled' });
    assert.equal('editorUi' in JSON.parse(String(init?.body)), false);
    ui.publishMode = 'now'; // Mutable caller state cannot rewrite the captured pending UI.
    return Response.json({ id: 'ack' });
  };
  const result = await submitPendingCreation(cache, 'owner', token, post, () => input, 'draft', { editorUi: ui });
  assert.equal(result.saved.id, 'ack');
  assert.deepEqual(readPendingCreation(cache, 'owner')?.editorUi, { publishMode: 'scheduled' });
  assert.deepEqual(readPendingCreation(cache, 'owner')?.input, input);
});

test('UI-only retry change preserves captured metadata and frozen request key/body/time with no PATCH', async () => {
  const cache = storage(), post = editor(), requests: { url: string; method: string | undefined; key: string | null; body: string }[] = [];
  const frozen = { ...input, status: 'READY' as const, targets: [{ provider: 'telegram' as const, textOverride: null, scheduledAt: '2030-01-01T00:00:00Z' }] };
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), method: init?.method, key: new Headers(init?.headers).get('idempotency-key'), body: String(init?.body) });
    if (requests.length === 1) throw Error('Lost response');
    return Response.json({ id: 'ack' });
  };
  await assert.rejects(submitPendingCreation(cache, 'owner', token, post, () => frozen, 'now', { editorUi: { publishMode: 'scheduled' } }), /Lost response/);
  const before = readPendingCreation(cache, 'owner')!;
  const result = await submitPendingCreation(cache, 'owner', token, post, () => { throw Error('Fresh timestamp must not be built'); }, 'now', { editorUi: { publishMode: 'now' } });
  assert.equal(result.updateError, undefined);
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[0].method, 'POST');
  const after = readPendingCreation(cache, 'owner')!;
  assert.equal(after.key, before.key); assert.equal(after.intent, before.intent);
  assert.equal(after.editorToken, before.editorToken); assert.equal(after.activeEditorToken, before.activeEditorToken);
  assert.deepEqual(after.input, before.input);
  assert.deepEqual(after.editorUi, { publishMode: 'scheduled' });
});

test('valid optional UI is read separately from shared editor content', () => {
  const cache = storage(); cache.setItem(pendingCreationKey('owner'), JSON.stringify({ version: 1, key, input,
    editor: editorFields(editor()), editorUi: { publishMode: 'now' }, intent: 'draft', editorToken: token, activeEditorToken: token }));
  const pending = readPendingCreation(cache, 'owner')!;
  assert.deepEqual(pending.editorUi, { publishMode: 'now' });
  assert.equal('publishMode' in pending.editor, false);
});

test('malformed optional pending UI never invalidates the valid frozen request', async () => {
  for (const editorUi of [null, {}, [], { publishMode: 'later' }, { publishMode: 'scheduled', unrelated: true }]) {
    const cache = storage(); cache.setItem(pendingCreationKey('owner'), JSON.stringify({ version: 1, key, input,
      editor: editorFields(editor()), editorUi, intent: 'draft', editorToken: token, activeEditorToken: token }));
    const pending = readPendingCreation(cache, 'owner')!;
    assert.equal(pending.key, key); assert.equal(pending.editorUi, undefined); assert.deepEqual(pending.input, input);
    globalThis.fetch = async (_url, init) => {
      assert.equal(new Headers(init?.headers).get('idempotency-key'), key);
      assert.deepEqual(JSON.parse(String(init?.body)), input);
      return Response.json({ id: 'ack' });
    };
    const result = await submitPendingCreation(cache, 'owner', token, pending.editor, () => input, 'draft');
    assert.equal(result.saved.id, 'ack'); assert.equal(result.pending.key, key);
  }
});

test('legacy pending request without UI remains exactly replayable', async () => {
  const cache = storage(); cache.setItem(pendingCreationKey('owner'), JSON.stringify({ version: 1, key, input,
    editor: editorFields(editor()), intent: 'draft', editorToken: token, activeEditorToken: token }));
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('idempotency-key'), key);
    assert.deepEqual(JSON.parse(String(init?.body)), input); return Response.json({ id: 'ack' });
  };
  const result = await submitPendingCreation(cache, 'owner', token, editor(), () => input, 'draft', { editorUi: { publishMode: 'scheduled' } });
  assert.equal(result.pending.key, key); assert.equal(result.pending.editorUi, undefined);
});

test('Swipe origin never captures Composer UI intent', async () => {
  const cache = storage(); globalThis.fetch = async () => Response.json({ id: 'ack' });
  const result = await submitPendingCreation(cache, 'owner', token, editor(), () => input, 'draft', { origin: 'swipe-planner', editorUi: { publishMode: 'scheduled' } });
  assert.equal(result.pending.origin, 'swipe-planner'); assert.equal(result.pending.editorUi, undefined);
  assert.equal('editorUi' in JSON.parse(cache.getItem(pendingCreationKey('owner'))!), false);
});

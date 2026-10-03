import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { blankPost } from '../lib/planner.ts';
import { completePendingCreation, readPendingCreation, submitPendingCreation } from '../lib/client/pending-creation.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function storage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
}
const editorToken = 'bec6f2d4-9ee5-44c2-9c9f-e7b347ac19e3';
const input = { baseText: 'Once', status: 'DRAFT' as const, targets: [], mediaIds: [] };

test('oversized durable request is rejected before dispatch and cannot become self-unreadable', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ id: 'ack' }); };
  const cache = storage();
  const text = '\\'.repeat(20_000);
  const editor = { ...blankPost(), text, overrides: { telegram: text, max: text } };
  await assert.rejects(submitPendingCreation(cache, 'owner', editorToken, editor, () => ({ ...input, baseText: text,
    targets: [{ provider: 'telegram', textOverride: text, scheduledAt: null }, { provider: 'max', textOverride: text, scheduledAt: null }] }), 'draft'), /слишком большой/);
  assert.equal(calls, 0);
  assert.equal(readPendingCreation(cache, 'owner'), null);
});

test('malformed success acknowledgement retains the exact creation key for manual retry', async () => {
  const requests: { key: string | null; body: string }[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push({ key: new Headers(init?.headers).get('idempotency-key'), body: String(init?.body) });
    return Response.json(requests.length === 1 ? {} : { id: 'ack' });
  };
  const cache = storage(); const editor = { ...blankPost(), text: 'Once' };
  await assert.rejects(submitPendingCreation(cache, 'owner', editorToken, editor, () => input, 'draft'));
  assert.ok(readPendingCreation(cache, 'owner'));
  const result = await submitPendingCreation(cache, 'owner', editorToken, editor, () => input, 'draft');
  assert.equal(result.saved.id, 'ack');
  assert.deepEqual(requests[1], requests[0]);
});

test('acknowledged editor ID alone does not refresh the frozen publish-now timestamp', async () => {
  const requests: { url: string; body: string }[] = [];
  globalThis.fetch = async (url, init) => { requests.push({ url: String(url), body: String(init?.body) }); return Response.json({ id: 'ack' }); };
  const cache = storage(); const editor = { ...blankPost(), text: 'Once' };
  const frozen = { ...input, status: 'READY' as const, targets: [{ provider: 'telegram' as const, textOverride: null, scheduledAt: '2030-01-01T00:00:00Z' }] };
  await submitPendingCreation(cache, 'owner', editorToken, editor, () => frozen, 'now');
  const retried = await submitPendingCreation(cache, 'owner', editorToken, { ...editor, id: 'ack' }, () => { throw Error('Fresh now payload must not be built'); }, 'now');
  assert.equal(retried.updateError, undefined);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, '/api/posts');
  assert.equal(requests[1].body, requests[0].body);
  completePendingCreation(cache, 'owner', readPendingCreation(cache, 'owner')!.key);
});

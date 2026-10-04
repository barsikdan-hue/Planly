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

test('Library source is durable before fetch and lost retry keeps the original source and key', async () => {
  const cache = storage();
  const editor = { ...blankPost(), text:'Once', sourceLibraryItemId:'original-library' };
  const requests: {key:string|null; body:Record<string,unknown>}[] = [];
  globalThis.fetch = async (_url, init) => {
    const pending = readPendingCreation(cache, 'owner');
    assert.equal(pending?.input.sourceLibraryItemId, 'original-library', 'source must already be durable at dispatch');
    requests.push({ key:new Headers(init?.headers).get('idempotency-key'), body:JSON.parse(String(init?.body)) });
    if (requests.length === 1) throw Error('Lost response');
    return Response.json({ id:'ack' });
  };
  await assert.rejects(submitPendingCreation(cache, 'owner', editorToken, editor, () => ({ ...input, sourceLibraryItemId:'original-library' }), 'draft'), /Lost response/);
  const changed = { ...editor, sourceLibraryItemId:'different-library' };
  await submitPendingCreation(cache, 'owner', editorToken, changed, () => ({ ...input, sourceLibraryItemId:'different-library' }), 'draft');
  assert.equal(requests.length, 2, 'a changed source must never mutate provenance of the acknowledged Post');
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[0].body.sourceLibraryItemId, 'original-library');
});

test('old v1 pending request without a source remains replayable', async () => {
  const cache = storage();
  cache.setItem('planly:pending-create:v1:owner', JSON.stringify({ version:1, key:'6ef09690-e21c-4073-a579-87215f49b8df', input,
    editor:{ id:'', text:'Once', networks:['telegram'], date:'2030-01-01', time:'10:00', mediaIds:[], overrides:{} },
    intent:'draft', editorToken, activeEditorToken:editorToken }));
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('idempotency-key'), '6ef09690-e21c-4073-a579-87215f49b8df');
    assert.equal('sourceLibraryItemId' in JSON.parse(String(init?.body)), false);
    return Response.json({ id:'legacy-ack' });
  };
  const pending = readPendingCreation(cache, 'owner')!;
  const result = await submitPendingCreation(cache, 'owner', editorToken, pending.editor, () => input, 'draft');
  assert.equal(result.saved.id, 'legacy-ack');
});

test('cleared Library provenance plus acknowledged ID does not rebuild frozen publish-now time', async () => {
  const requests:string[] = [];
  const cache = storage();
  const editor = { ...blankPost(), text:'Once', sourceLibraryItemId:'library' };
  const frozen = { ...input, sourceLibraryItemId:'library', status:'READY' as const,
    targets:[{ provider:'telegram' as const, textOverride:null, scheduledAt:'2030-01-01T00:00:00Z' }] };
  globalThis.fetch = async (_url, init) => { requests.push(String(init?.body)); return Response.json({ id:'ack' }); };
  await submitPendingCreation(cache, 'owner', editorToken, editor, () => frozen, 'now');
  const retry = await submitPendingCreation(cache, 'owner', editorToken, { ...editor, id:'ack', sourceLibraryItemId:null },
    () => { throw Error('Fresh timestamp must not be built'); }, 'now');
  assert.equal(retry.updateError, undefined);
  assert.equal(requests.length, 2);
  assert.equal(requests[1], requests[0]);
  assert.equal(JSON.parse(requests[1]).sourceLibraryItemId, 'library');
});

test('definitive Library source conflict clears only pending request and permits an explicit source retry', async () => {
  const cache = storage();
  const editor = { ...blankPost(), text:'Keep rejected content', sourceLibraryItemId:'archived-source' };
  const requests: {key:string|null; body:Record<string,unknown>}[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push({ key:new Headers(init?.headers).get('idempotency-key'), body:JSON.parse(String(init?.body)) });
    return requests.length === 1
      ? Response.json({ error:'Archived library item cannot create a Post', code:'LIBRARY_SOURCE_CONFLICT' }, { status:409 })
      : Response.json({ id:'restored-source-post' });
  };
  await assert.rejects(submitPendingCreation(cache, 'owner', editorToken, editor,
    () => ({ ...input, baseText:editor.text, sourceLibraryItemId:'archived-source' }), 'draft'), error => {
    assert.equal((error as {status?:number}).status, 409); return true;
  });
  assert.equal(readPendingCreation(cache, 'owner'), null, 'definitive no-creation response must release replacement/save lock');
  assert.equal(editor.text, 'Keep rejected content');
  assert.equal(editor.sourceLibraryItemId, 'archived-source');
  const result = await submitPendingCreation(cache, 'owner', editorToken, editor,
    () => ({ ...input, baseText:editor.text, sourceLibraryItemId:'archived-source' }), 'draft');
  assert.equal(result.saved.id, 'restored-source-post');
  assert.equal(requests[1].body.sourceLibraryItemId, 'archived-source');
  assert.notEqual(requests[1].key, requests[0].key, 'explicit retry after definitive rejection starts a fresh request');
});

for (const scenario of [
  { name:'creation key conflict', status:409, body:{ error:'Conflict', code:'CREATION_KEY_CONFLICT' } },
  { name:'generic conflict', status:409, body:{ error:'Conflict' } },
  { name:'server failure', status:500, body:{ error:'Internal server error' } },
  { name:'source code with wrong status', status:500, body:{ error:'Server failure', code:'LIBRARY_SOURCE_CONFLICT' } },
  { name:'transport failure', status:0, body:null },
]) test(`uncertain ${scenario.name} retains exact pending source and original creation key`, async () => {
  const cache = storage(); const editor = { ...blankPost(), text:'Once', sourceLibraryItemId:'library' };
  const requests: {key:string|null; body:string}[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push({ key:new Headers(init?.headers).get('idempotency-key'), body:String(init?.body) });
    if (requests.length > 1) return Response.json({ id:'ack' });
    if (!scenario.status) throw Error('Lost response');
    return Response.json(scenario.body, { status:scenario.status });
  };
  await assert.rejects(submitPendingCreation(cache, 'owner', editorToken, editor, () => ({ ...input, sourceLibraryItemId:'library' }), 'draft'));
  const pending = readPendingCreation(cache, 'owner');
  assert.equal(pending?.key, requests[0].key);
  assert.equal(pending?.input.sourceLibraryItemId, 'library');
  await submitPendingCreation(cache, 'owner', editorToken, editor, () => { throw Error('Frozen input must be replayed'); }, 'draft');
  assert.deepEqual(requests[1], requests[0]);
});

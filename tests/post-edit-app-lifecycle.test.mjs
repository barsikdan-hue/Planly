// Actual PlannerApp callback/effect paths, with the existing non-DOM hook harness.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
import { editorFields, writeRecovery } from '../lib/client/editor-recovery.ts';
import { pendingCreationKey, writePendingCreation } from '../lib/client/pending-creation.ts';
import { blankPost, fromServerPost, toPublishNowInput } from '../lib/planner.ts';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../components/planner/app.tsx');
const originalGlobals = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
const reason = 'Оригинал опубликован. Создай копию.';
const original = { id: 'original', title: null, baseText: 'Confirmed original text', status: 'READY',
  editBlockedReason: reason, mediaIds: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  targets: [{ id: 'tg', socialAccountId: 'tg', provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00Z',
    publication: { status: 'PUBLISHED', remoteId: 'remote-1', remoteUrl: 'https://fixture.invalid/1', error: null } }] };
let harness;
afterEach(() => { harness?.unmount(); harness = null; Object.assign(globalThis, originalGlobals); });
function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}
function fixture({ draft, posts = [original], mutation, cache: providedCache } = {}) {
  const items = new Map(), handlers = new Map(), requests = [];
  const cache = providedCache ?? { getItem(key) { return items.get(key) ?? null; }, setItem(key, value) { items.set(key, value); }, removeItem(key) { items.delete(key); } };
  if (draft) writeRecovery(cache, 'owner', draft);
  globalThis.window = { sessionStorage: cache, location: { hash: '#create', assign() {} }, history: { replaceState() {} },
    scrollTo() {}, confirm() { return true; }, addEventListener(name, fn) { handlers.set(name, fn); }, removeEventListener(name) { handlers.delete(name); } };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json({ profile: { id: 'owner', displayName: 'Owner' }, posts,
      media: ['A', 'B'].map(id => ({ id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 1, previewUrl: `/${id}` })),
      socialAccounts: [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }] });
    requests.push({ url, method: init.method, key: new Headers(init.headers).get('idempotency-key'), body: init.body && JSON.parse(init.body) });
    if (!mutation) throw Error('Unexpected mutation');
    return mutation(requests.at(-1), requests.length);
  };
  harness = createHarness(PlannerApp);
  const navigate = async view => { window.location.hash = `#${view}`; handlers.get('hashchange')(); await harness.settle(); };
  return { requests, cache, navigate };
}

test('restored blocked original copies current local work into an editable new identity', async () => {
  const draft = { ...fromServerPost(original), text: 'Newer local text', mediaIds: ['B', 'A'], overrides: { telegram: 'Newer local variant' } };
  const { requests } = fixture({ draft }); await harness.settle();
  assert.equal(harness.composer().editBlockedReason, reason);
  await harness.composer().save(harness.composer().draft, 'draft');
  await harness.composer().publishNow(harness.composer().draft);
  assert.equal(requests.length, 0);
  window.confirm = () => { assert.fail('copying current text does not discard it and needs no replacement prompt'); };
  harness.composer().duplicatePost(harness.composer().draft); await harness.settle();
  const copy = harness.composer().draft;
  assert.equal(copy.id, ''); assert.equal(copy.text, 'Newer local text');
  assert.deepEqual(copy.mediaIds, ['B', 'A']); assert.deepEqual(copy.overrides, { telegram: 'Newer local variant' });
  assert.equal(copy.status, 'draft'); assert.deepEqual(copy.targets, []);
  assert.equal(copy.editBlockedReason, null); assert.equal(harness.composer().editBlockedReason, null);
  assert.equal(requests.length, 0, 'copy action alone must not create or publish');
});

test('blocked edit entry preserves another dirty editor rather than replacing it with server text', async () => {
  const { navigate, requests } = fixture({ draft: { ...blankPost(), text: 'Another unfinished post' } }); await harness.settle();
  await navigate('content'); harness.find('Content').props.editPost(fromServerPost(original)); await harness.settle();
  await navigate('create');
  assert.equal(harness.composer().draft.text, 'Another unfinished post');
  assert.equal(harness.composer().draft.id, ''); assert.equal(requests.length, 0);
});

test('lost POST retry attaches published identity, preserves newer text on 409 and copies using a fresh key', async () => {
  const { requests, navigate } = fixture({ posts: [], mutation: (request, count) => {
    if (count === 1) throw Error('Response lost after committed publish');
    if (count === 2) return Response.json(original, { status: 201 });
    if (count === 3) return Response.json({ error: reason, code: 'POST_EDIT_BLOCKED' }, { status: 409 });
    return Response.json({ ...original, id: 'copy', baseText: request.body.baseText, status: 'DRAFT', targets: [], editBlockedReason: null }, { status: 201 });
  } }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Confirmed original text' })); await harness.settle();
  await harness.composer().publishNow(harness.composer().draft); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Newer after lost response', overrides: { telegram: 'New local variant' } })); await harness.settle();
  await harness.composer().publishNow(harness.composer().draft); await harness.settle();
  assert.equal(harness.composer().draft.id, 'original');
  assert.equal(harness.composer().draft.text, 'Newer after lost response');
  assert.equal(harness.composer().editBlockedReason, reason);
  harness.composer().duplicatePost(harness.composer().draft); await harness.settle();
  assert.equal(harness.composer().draft.id, '');
  await harness.composer().save(harness.composer().draft, 'draft'); await harness.settle();
  assert.equal(requests.length, 4);
  assert.equal(requests[0].key, requests[1].key);
  assert.equal(requests[2].url, '/api/posts/original');
  assert.equal(requests[3].url, '/api/posts'); assert.notEqual(requests[3].key, requests[0].key);
  assert.equal(requests[3].body.baseText, 'Newer after lost response');
  assert.equal(requests[3].body.targets[0].textOverride, 'New local variant');
  await navigate('content');
  assert.equal(harness.find('Content').props.posts.find(post => post.id === 'original').text, 'Confirmed original text');
});

test('409 on an already-open stale editor changes it to read-only while preserving local content', async () => {
  const stale = { ...original, status: 'DRAFT', targets: [], editBlockedReason: null };
  const { requests } = fixture({ posts: [stale], draft: { ...fromServerPost(stale), text: 'Local unsaved changes' },
    mutation: () => Response.json({ error: reason, code: 'POST_EDIT_BLOCKED' }, { status: 409 }) });
  await harness.settle();
  await harness.composer().save(harness.composer().draft, 'draft'); await harness.settle();
  assert.equal(requests.length, 1);
  assert.equal(harness.composer().draft.text, 'Local unsaved changes');
  assert.equal(harness.composer().editBlockedReason, reason);
  harness.composer().duplicatePost(harness.composer().draft); await harness.settle();
  assert.equal(harness.composer().draft.id, '');
  assert.equal(harness.composer().draft.text, 'Local unsaved changes');
});

test('published acknowledged identity does not block completing a pending same-key replay after storage cleanup failure', async () => {
  const allRequests = [];
  const mutation = request => { allRequests.push(request); return Response.json(original, { status: 201 }); };
  const first = fixture({ posts: [], mutation }); await harness.settle();
  const removeItem = first.cache.removeItem;
  first.cache.removeItem = key => {
    if (key.startsWith('planly:pending-create:')) throw Error('Pending removal denied');
    removeItem(key);
  };
  harness.composer().setDraft(current => ({ ...current, text: 'Confirmed original text' })); await harness.settle();
  await harness.composer().publishNow(harness.composer().draft); await harness.settle();
  harness.unmount(); first.cache.removeItem = removeItem;
  const second = fixture({ cache: first.cache, posts: [original], mutation }); await harness.settle();
  assert.equal(harness.composer().draft.id, 'original');
  assert.equal(harness.composer().editBlockedReason, reason);
  // The global retry invokes this same callback even while Composer is read-only.
  await harness.composer().publishNow(harness.composer().draft); await harness.settle();
  assert.equal(allRequests.length, 2);
  assert.equal(allRequests[0].key, allRequests[1].key);
  assert.equal(allRequests[1].url, '/api/posts');
  assert.equal(first.cache.getItem('planly:pending-create:v1:owner'), null);
  await second.navigate('create');
  assert.equal(harness.composer().draft.id, '');
});

test('global retry outside the read-only Composer replays an acknowledged published creation without PATCH', async () => {
  const originalEditor = { ...blankPost(), text: 'Confirmed original text' };
  const frozenInput = toPublishNowInput(originalEditor, 1000);
  const key = '7dceac83-dc5d-4cf5-9da5-2dba88940d64';
  const token = '06d5d11f-5c80-41b9-a405-75d10b592b93';
  const { cache, requests } = fixture({ draft: { ...originalEditor, id: 'original' },
    mutation: () => Response.json(original, { status: 201 }) });
  writePendingCreation(cache, 'owner', { version: 1, key, input: frozenInput, editor: editorFields(originalEditor),
    intent: 'now', editorToken: token, activeEditorToken: token, acknowledgedId: 'original' });
  await harness.settle();
  assert.equal(harness.composer().editBlockedReason, reason);
  const retry = findElement(harness.tree, node => node.props?.children === 'Повторить сохранение');
  assert.ok(retry, 'global retry remains outside the read-only Composer');
  retry.props.onClick(); await harness.settle();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/posts'); assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].key, key); assert.deepEqual(requests[0].body, frozenInput);
  assert.equal(cache.getItem(pendingCreationKey('owner')), null);
});

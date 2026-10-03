import test, { afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
let PlannerApp;
before(async () => { ({ default: PlannerApp } = await import('../components/planner/app.tsx')); });
const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
let harness;
afterEach(() => {
  harness?.unmount(); harness = null;
  globalThis.fetch = original.fetch;
  globalThis.window = original.window;
  globalThis.document = original.document;
});
function storage() {
  const items = new Map();
  return { getItem(key) { return items.get(key) ?? null; }, setItem(key, value) { items.set(key, value); }, removeItem(key) { items.delete(key); }, items };
}
function fixture({ cache = storage(), snapshot, mutation } = {}) {
  const handlers = new Map();
  globalThis.window = {
    sessionStorage: cache, location: { hash: '#create', assign() {} }, history: { replaceState() {} },
    scrollTo() {}, confirm() { return false; },
    addEventListener(name, handler) { handlers.set(name, handler); }, removeEventListener(name) { handlers.delete(name); },
  };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json(snapshot ?? {
      profile: { id: 'owner', displayName: 'Owner', email: 'fixture@example.test' }, posts: [], media: [], socialAccounts: [],
    });
    if (mutation) return mutation(url, init);
    throw Error(`Unexpected fixture endpoint: ${url}`);
  };
  harness = createHarness(PlannerApp);
  return { cache, handlers };
}
const fields = { text: 'Не потерять этот текст', networks: ['max', 'telegram'], date: '2099-10-04', time: '19:45', overrides: { max: 'MAX версия', telegram: 'Telegram версия' } };
const savedPost = { id: 'saved', title: null, baseText: 'Server version', status: 'DRAFT', targets: [], mediaIds: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };

test('unsaved editor survives reload of actual PlannerApp after successful owner bootstrap', async () => {
  const { cache } = fixture();
  await harness.settle();
  harness.composer().setDraft(current => ({ ...current, ...fields }));
  await harness.settle();
  harness.unmount();
  fixture({ cache });
  await harness.settle();
  const recovered = harness.composer().draft;
  assert.equal(recovered.text, 'Не потерять этот текст');
  assert.deepEqual(recovered.networks, ['max', 'telegram']);
  assert.deepEqual(recovered.overrides, { max: 'MAX версия', telegram: 'Telegram версия' });
  assert.equal(recovered.time, '19:45');
});

test('failed API save keeps editor recovery after reload', async () => {
  const mutation = async () => Response.json({ error: 'Fixture unavailable' }, { status: 500 });
  const { cache } = fixture({ mutation });
  await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Остаться после ошибки' }));
  await harness.settle();
  await harness.composer().save(harness.composer().draft, 'draft');
  harness.unmount(); fixture({ cache }); await harness.settle();
  assert.equal(harness.composer().draft.text, 'Остаться после ошибки');
});

test('successful pending save cannot erase a new editor revision', async () => {
  let resolve;
  const mutation = () => new Promise(done => { resolve = done; });
  const { cache, handlers } = fixture({ mutation }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Submitted first' })); await harness.settle();
  const saving = harness.composer().save(harness.composer().draft, 'draft');
  harness.composer().setDraft(current => ({ ...current, text: 'New work while pending' })); await harness.settle();
  resolve(Response.json({ id: 'saved', title: null, baseText: 'Submitted first', status: 'DRAFT', targets: [], mediaIds: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }));
  await saving; await harness.settle();
  window.location.hash = '#create'; handlers.get('hashchange')(); await harness.settle();
  assert.equal(harness.composer().draft.text, 'New work while pending');
  harness.unmount(); fixture({ cache }); await harness.settle();
  assert.equal(harness.composer().draft.text, 'New work while pending');
});

test('successful save clears recovery without writing a fresh blank cache record', async () => {
  const { cache, handlers } = fixture({ mutation: async () => Response.json(savedPost) }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Saved work' })); await harness.settle();
  await harness.composer().save(harness.composer().draft, 'draft'); await harness.settle();
  window.location.hash = '#create'; handlers.get('hashchange')(); await harness.settle();
  assert.equal(harness.composer().draft.text, '');
  assert.equal(cache.items.size, 0);
  harness.unmount(); fixture({ cache }); await harness.settle();
  assert.equal(harness.composer().draft.text, '');
});

test('successful save clears older owned recovery when the latest cache write failed', async () => {
  const { cache } = fixture({ mutation: async () => Response.json(savedPost) }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Older cached A' })); await harness.settle();
  const setItem = cache.setItem;
  cache.setItem = () => { throw Error('Quota'); };
  harness.composer().setDraft(current => ({ ...current, text: 'Latest saved B' })); await harness.settle();
  await harness.composer().save(harness.composer().draft, 'draft'); await harness.settle();
  cache.setItem = setItem;
  harness.unmount(); fixture({ cache }); await harness.settle();
  assert.equal(harness.composer().draft.text, '');
  assert.equal(cache.items.size, 0);
});

test('owner bootstrap failure does not hydrate cache into the unauthenticated fallback editor', async () => {
  const cache = storage();
  fixture({ cache }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Private recovery' })); await harness.settle();
  harness.unmount(); fixture({ cache });
  globalThis.fetch = async () => Response.json({ error: 'Unauthorized' }, { status: 401 });
  await harness.settle();
  assert.equal(harness.composer().draft.text, '');
  assert.equal(cache.items.size, 1);
});

test('existing-post recovery retains current publication metadata and fresh signed media URLs', async () => {
  const snapshot = { profile: { id: 'owner', displayName: 'Owner' }, posts: [savedPost], media: [{ id: 'image', originalName: 'image.png', mimeType: 'image/png', byteSize: 10, previewUrl: 'https://fixture.invalid/fresh-signature' }], socialAccounts: [] };
  const { cache, handlers } = fixture({ snapshot }); await harness.settle();
  window.location.hash = '#content'; handlers.get('hashchange')(); await harness.settle();
  harness.find('Content').props.editPost({ id: 'saved', text: 'Server version', networks: [], date: '2099-10-04', time: '10:00', status: 'draft', targets: [], mediaIds: [], overrides: {} }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Edited locally', mediaIds: ['image'] })); await harness.settle();
  harness.unmount();
  fixture({ cache, snapshot: { ...snapshot, posts: [{ ...savedPost, status: 'READY', targets: [{ id: 'tg', socialAccountId: 'account', provider: 'telegram', textOverride: null, scheduledAt: '2099-10-04T07:00:00Z', publication: { status: 'PUBLISHED', remoteId: '1', remoteUrl: 'https://t.me/fixture/1', error: null } }] }] } }); await harness.settle();
  assert.equal(harness.composer().draft.id, 'saved');
  assert.equal(harness.composer().draft.text, 'Edited locally');
  assert.equal(harness.composer().draft.targets[0].status, 'published');
  assert.equal(harness.composer().media[0].url, 'https://fixture.invalid/fresh-signature');
});

test('New, Edit, Copy and Media share a cancelable replacement guard; direct editor reopening does not ask', async () => {
  const snapshot = { profile: { id: 'owner', displayName: 'Owner' }, posts: [savedPost], media: [{ id: 'image', originalName: 'image.png', mimeType: 'image/png', byteSize: 10, previewUrl: 'fixture' }], socialAccounts: [] };
  const { handlers } = fixture({ snapshot }); await harness.settle();
  let prompts = 0;
  window.confirm = () => { prompts++; return false; };
  harness.composer().setDraft(current => ({ ...current, text: 'Keep me' })); await harness.settle();
  window.location.hash = '#content'; handlers.get('hashchange')(); await harness.settle();
  const content = harness.find('Content').props;
  content.create(); content.editPost({ ...savedPost, id: 'saved', text: 'Different', networks: [], date: '2099-10-04', time: '10:00', mediaIds: [], overrides: {}, targets: [] });
  content.duplicatePost({ text: 'Duplicate', id: 'saved', networks: [], date: '2099-10-04', time: '10:00', mediaIds: [], overrides: {}, targets: [] });
  window.location.hash = '#media'; handlers.get('hashchange')(); await harness.settle();
  harness.find('MediaLibrary').props.useMedia({ id: 'image' });
  window.location.hash = '#dashboard'; handlers.get('hashchange')(); await harness.settle();
  harness.find('Dashboard').props.createPost();
  assert.equal(prompts, 5);
  harness.find('Dashboard').props.navigate('create'); await harness.settle();
  assert.equal(prompts, 5);
  assert.equal(harness.composer().draft.text, 'Keep me');
  window.confirm = () => { prompts++; return true; };
  window.location.hash = '#content'; handlers.get('hashchange')(); await harness.settle();
  harness.find('Content').props.create(); await harness.settle();
  assert.equal(harness.composer().draft.text, '');
});

test('sessionStorage access failure leaves actual editor usable', async () => {
  fixture();
  Object.defineProperty(window, 'sessionStorage', { get() { throw Error('Blocked'); } });
  await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Still editable' })); await harness.settle();
  assert.equal(harness.composer().draft.text, 'Still editable');
});

test('publish-now acknowledgement preserves a different draft opened while pending', async () => {
  let resolve;
  const snapshot = { profile: { id: 'owner', displayName: 'Owner' }, posts: [], media: [], socialAccounts: [{ id: 'account', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }] };
  const { cache, handlers } = fixture({ snapshot, mutation: () => new Promise(done => { resolve = done; }) }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Send first' })); await harness.settle();
  const publication = harness.composer().publishNow(harness.composer().draft);
  window.confirm = () => true;
  window.location.hash = '#content'; handlers.get('hashchange')(); await harness.settle();
  harness.find('Content').props.create(); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Keep second' })); await harness.settle();
  resolve(Response.json(savedPost)); await publication; await harness.settle();
  assert.equal(harness.composer().draft.text, 'Keep second');
  harness.unmount(); fixture({ cache }); await harness.settle();
  assert.equal(harness.composer().draft.text, 'Keep second');
});

test('successful publish-now acknowledgement clears the unchanged editor recovery', async () => {
  const snapshot = { profile: { id: 'owner', displayName: 'Owner' }, posts: [], media: [], socialAccounts: [{ id: 'account', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }] };
  const { cache } = fixture({ snapshot, mutation: async () => Response.json(savedPost) }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Send unchanged' })); await harness.settle();
  await harness.composer().publishNow(harness.composer().draft); await harness.settle();
  assert.equal(cache.items.size, 0);
  harness.unmount(); fixture({ cache }); await harness.settle();
  assert.equal(harness.composer().draft.text, '');
});

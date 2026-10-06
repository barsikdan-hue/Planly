// Actual App + ContentLibrary callbacks/effects; non-DOM lifecycle evidence.
// No library mutation, upload or provider request is dispatched in these probes.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../components/planner/app.tsx');
const { ContentLibrary } = await import('../components/planner/content-library.tsx');
const originals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
const mounted = [];
afterEach(() => { for (const value of mounted.splice(0)) value.unmount(); Object.assign(globalThis, originals); });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const value = find(child, predicate); if (value) return value; }
  return null;
}
function text(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join('');
}
function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
function fixture({ cache = storage(), items = [] } = {}) {
  const handlers = new Map(), requests = [];
  globalThis.window = { sessionStorage: cache, location: { hash: '#content', assign() {} },
    history: { replaceState() {} }, scrollTo() {}, confirm() { return true; },
    addEventListener(name, callback) { handlers.set(name, callback); }, removeEventListener(name) { handlers.delete(name); } };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json({ profile: { id: 'owner', displayName: 'Owner' }, posts: [], libraryItems: items,
      media: ['A', 'B'].map(id => ({ id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 1, previewUrl: `/${id}` })), socialAccounts: [] });
    requests.push({ url, method: init?.method }); throw Error('Editor navigation/reload must not mutate server data');
  };
  const app = createHarness(PlannerApp); let library;
  const value = { app, cache, requests,
    unmount() { app.unmount(); library?.unmount(); },
    async settle() {
      await app.settle();
      if (!app.find('ContentLibrary')) { library?.unmount(); library = null; return; }
      library ??= createHarness(() => ContentLibrary(app.find('ContentLibrary').props));
      library.render(); await library.settle();
    },
    button(label) { return find(library?.tree, node => (node.type?.name === 'Button' || node.type === 'button') && text(node) === label); },
    field(id) { return find(library?.tree, node => node.props?.id === id); },
    mediaIds() { return find(library?.tree, node => node.props?.className === 'attachment-chips')?.props.children.map(node => node.key) ?? []; },
    editorTitle() { return find(library?.tree, node => node.props?.className === 'library-editor')?.props.title; },
    async navigate(view) { window.location.hash = `#${view}`; handlers.get('hashchange')(); await value.settle(); },
  };
  mounted.push(value); return value;
}
async function fill(value) {
  value.field('library-title').props.onChange({ target: { value: 'Unsaved title' } }); await value.settle();
  value.field('library-text').props.onChange({ target: { value: 'Unsaved library work' } }); await value.settle();
  value.button('B.png').props.onClick(); await value.settle();
  value.button('A.png').props.onClick(); await value.settle();
  assert.equal(value.field('library-title').props.value, 'Unsaved title');
  assert.equal(value.field('library-text').props.value, 'Unsaved library work');
  assert.deepEqual(value.mediaIds(), ['B', 'A']);
  assert.equal(value.requests.length, 0);
}
function assertRestored(value, existing = false) {
  assert.equal(value.field('library-title')?.props.value ?? null, 'Unsaved title', 'same Library editor title must survive');
  assert.equal(value.field('library-text')?.props.value ?? null, 'Unsaved library work');
  assert.equal(value.button('B.png').props['aria-pressed'], true); assert.equal(value.button('A.png').props['aria-pressed'], true);
  assert.deepEqual(value.mediaIds(), ['B', 'A']);
  assert.equal(value.editorTitle(), existing ? 'Редактировать заготовку' : 'Новая заготовка');
}

test('Library same-mount control retains local fields/media without saving', async () => {
  const value = fixture(); await value.settle(); value.button('Новая заготовка').props.onClick(); await value.settle();
  await fill(value); assertRestored(value);
});

test('unsaved new Library editor survives navigation away and back without mutation', async () => {
  const value = fixture(); await value.settle(); value.button('Новая заготовка').props.onClick(); await value.settle(); await fill(value);
  await value.navigate('calendar'); await value.navigate('content');
  assert.equal(value.requests.length, 0); assertRestored(value);
});

test('unsaved new Library editor survives same-tab App reload without mutation', async () => {
  const first = fixture(); await first.settle(); first.button('Новая заготовка').props.onClick(); await first.settle(); await fill(first);
  first.unmount(); const reload = fixture({ cache: first.cache }); await reload.settle();
  assert.equal(first.requests.length + reload.requests.length, 0); assertRestored(reload);
});

test('unsaved edits of an existing Library identity survive remount without submitting', async () => {
  const item = { id: 'existing', title: 'Server title', text: 'Server text', mediaIds: [], status: 'READY',
    sourcePostId: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
  const value = fixture({ items: [item] }); await value.settle(); value.button('Редактировать').props.onClick(); await value.settle(); await fill(value);
  await value.navigate('calendar'); await value.navigate('content');
  assert.equal(value.requests.length, 0); assertRestored(value, true);
});

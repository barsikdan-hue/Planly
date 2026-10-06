// Actual App/Library callbacks; only external HTTP, timers and sessionStorage are fixtures.
import { register } from 'node:module';
import { createHarness } from './planner-hook-harness.mjs';
register('./planner-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../../components/planner/app.tsx');
const { ContentLibrary } = await import('../../components/planner/content-library.tsx');
const originals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch,
  setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
const mounted = [];
export function cleanup() { mounted.splice(0).forEach(value => value.unmount()); Object.assign(globalThis, originals); }
export function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const value = find(child, predicate); if (value) return value; }
  return null;
}
export function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join('');
}
export function storage() {
  const values = new Map();
  return { values, failWrite: false, failRead: false, failRemove: false,
    failWriteKey: '', failRemoveKey: '', silentWriteKey: '', silentRemoveKey: '', onWrite: null, onRemove: null,
    getItem(key) { if (this.failRead) throw Error('read denied'); return values.get(key) ?? null; },
    setItem(key, value) { if (this.failWrite || this.failWriteKey === key) throw Error('quota'); if (this.silentWriteKey !== key) values.set(key, value); this.onWrite?.(key, value); },
    removeItem(key) { if (this.failRemove || this.failRemoveKey === key) throw Error('remove denied'); if (this.silentRemoveKey !== key) values.delete(key); this.onRemove?.(key); } };
}
export const libraryKey = owner => `planly:library-editor:v1:${owner}`;
export const item = (id = 'existing', status = 'READY') => ({ id, title: 'Server title', text: 'Server text', mediaIds: [], status,
  sourcePostId: status === 'USED' ? 'post' : null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() });
export const asset = id => ({ id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 1, previewUrl: `/${id}` });
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export function fixture({ cache = storage(), items = [], owner = 'owner', media = ['A', 'B'].map(asset), scheduled = false, mutation } = {}) {
  const handlers = new Map(), requests = [], timers = new Map(); let timerId = 0;
  const snapshot = { profile: { id: owner, displayName: 'Owner' }, libraryItems: items, media, socialAccounts: [], posts: scheduled ? [
    { id: 'post', title: null, baseText: 'Scheduled', status: 'READY', mediaIds: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      targets: [{ id: 'target', socialAccountId: 'tg', provider: 'telegram', textOverride: null, scheduledAt: '2099-01-01T09:00:00Z', publication: null }] }
  ] : [] };
  globalThis.window = { sessionStorage: cache, location: { hash: '#content', assign() {} }, history: { replaceState() {} }, scrollTo() {}, confirm() { return true; },
    addEventListener(name, fn) { handlers.set(name, fn); }, removeEventListener(name) { handlers.delete(name); } };
  globalThis.document = { hidden: false };
  globalThis.setInterval = callback => { const id = ++timerId; timers.set(id, callback); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json(snapshot);
    if (url === '/api/media' && !init) return Response.json(snapshot.media);
    const request = { url, method: init?.method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body, headers: new Headers(init?.headers) };
    requests.push(request);
    if (!mutation) throw Error('Unexpected mutation');
    return mutation(request, requests.length);
  };
  const app = createHarness(PlannerApp); let library;
  const value = { app, cache, requests, snapshot,
    unmount() { app.unmount(); library?.unmount(); },
    async settle() {
      await app.settle();
      if (!app.find('ContentLibrary')) { library?.unmount(); library = null; return; }
      library ??= createHarness(() => ContentLibrary(app.find('ContentLibrary').props));
      library.render(); await library.settle(); await app.settle(); library.render();
    },
    control() { return app.find('ContentLibrary')?.props.editorControl; },
    props() { return app.find('ContentLibrary')?.props; },
    button(label) { return find(library?.tree, node => (node.type?.name === 'Button' || node.type === 'button') && text(node) === label); },
    field(id) { return find(library?.tree, node => node.props?.id === id); },
    input(label) { return find(library?.tree, node => node.props?.['aria-label'] === label); },
    mediaIds() { return find(library?.tree, node => node.props?.className === 'attachment-chips')?.props.children.map(node => node.key) ?? []; },
    editorTitle() { return find(library?.tree, node => node.props?.className === 'library-editor')?.props.title; },
    errors() { return text(library?.tree); },
    cached(ownerId = owner) { const raw = cache.getItem(libraryKey(ownerId)); return raw && JSON.parse(raw); },
    async change(id, content) { value.field(id).props.onChange({ target: { value: content } }); await value.settle(); },
    async open() { value.button('Новая заготовка').props.onClick(); await value.settle(); },
    async navigate(view) { window.location.hash = `#${view}`; handlers.get('hashchange')(); await value.settle(); },
    async poll() { for (const callback of [...timers.values()]) callback(); await value.settle(); },
  };
  mounted.push(value); return value;
}

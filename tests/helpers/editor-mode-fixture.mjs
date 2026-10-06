// Actual App/Composer callback fixture; controlled hooks, no DOM or provider calls.
import { register } from 'node:module';
import { createHarness } from './planner-hook-harness.mjs';
register('./editor-mode-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../../components/planner/app.tsx');
const { Composer } = await import('../../components/planner/composer.tsx');
const originals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
const mounted = [];
export function cleanupEditors() { for (const h of mounted.splice(0)) h.unmount(); Object.assign(globalThis, originals); }
export function memoryStorage() {
  const items = new Map();
  return { items, getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
}
export function findAll(node, predicate, output = []) {
  if (!node || typeof node !== 'object') return output;
  if (predicate(node)) output.push(node);
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) findAll(child, predicate, output);
  return output;
}
export function mountEditor({ cache = memoryStorage(), posts = [], media = [], libraryItems = [], view = 'create', mutation } = {}) {
  const requests = [], handlers = new Map();
  globalThis.window = { sessionStorage: cache, location: { hash: `#${view}`, assign() {} }, history: { replaceState() {} },
    scrollTo() {}, confirm() { return true; }, addEventListener(name, callback) { handlers.set(name, callback); },
    removeEventListener(name) { handlers.delete(name); } };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json({ profile: { id: 'owner', displayName: 'Owner' }, posts, media, libraryItems,
      socialAccounts: [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }] });
    const request = { url, method: init?.method, key: new Headers(init?.headers).get('idempotency-key'), body: init?.body && JSON.parse(init.body) };
    requests.push(request);
    if (!mutation) throw Error('Mode toggle/reload must not mutate server data');
    return mutation(request, requests.length);
  };
  const app = createHarness(PlannerApp); mounted.push(app);
  let composer = createHarness(() => Composer(app.composer())); mounted.push(composer);
  function remove(h) { h.unmount(); const index = mounted.indexOf(h); if (index >= 0) mounted.splice(index, 1); }
  const value = { app, cache, requests, get composer() { return composer; },
    async settle() { await app.settle(); if (app.composer()) composer.render(); },
    mode() { return findAll(composer.tree, node => node.props?.className === 'when-line')[0]; },
    hasSchedule() { return findAll(composer.tree, node => node.type === 'input' && node.props.type === 'date').length > 0; },
    remountComposer() { remove(composer); composer = createHarness(() => Composer(app.composer())); mounted.push(composer); if (app.composer()) composer.render(); },
    async navigate(next) { window.location.hash = `#${next}`; handlers.get('hashchange')(); await app.settle(); value.remountComposer(); },
    unmount() { remove(app); remove(composer); },
  };
  return value;
}

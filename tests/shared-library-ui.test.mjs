import test, { before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
let SharedLibrary, useLibrarySharing;
before(async () => ({ SharedLibrary, useLibrarySharing } = await import('../components/planner/shared-library.tsx')));
const original = { fetch: globalThis.fetch, window: globalThis.window };
const harnesses = [];
afterEach(() => { harnesses.splice(0).forEach(h => h.unmount()); Object.assign(globalThis, original); });
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node) ? node : node.props?.children;
  return [...(predicate(node) ? [node] : []), ...(Array.isArray(children) ? children : [children]).flatMap(child => nodes(child, predicate))];
}
function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); if (!node || typeof node !== 'object') return ''; return (Array.isArray(node) ? node : [node.props?.children]).flat().map(text).join(''); }
function button(h, label) { const result = nodes(h.tree, n => typeof n.props?.onClick === 'function' && text(n) === label); assert.equal(result.length, 1, `One ${label} action`); return result[0]; }
const shared = id => ({ id, title: `Title ${id}`, text: `Text ${id}`, updatedAt: '2026-10-15T12:00:00.000Z', media: [{ name: 'image.png', mimeType: 'image/png', previewUrl: '/selected-preview' }] });
async function mount(onCopied = async () => {}) { const h = createHarness(() => SharedLibrary({ onCopied })); harnesses.push(h); await h.settle(); return h; }

test('shared selection never copies automatically; explicit batch copies only selected IDs', async () => {
  const writes = []; let refreshed = 0;
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ items: [shared('one'), shared('two')] });
    writes.push({ url, init }); return Response.json({ items: [{ id: 'owned-copy' }] }, { status: 201 });
  };
  const h = await mount(async () => { refreshed++; });
  assert.equal(writes.length, 0);
  assert.equal(nodes(h.tree, n => n.type === 'img' && n.props.src === '/selected-preview').length, 2);
  const boxes = nodes(h.tree, n => n.type === 'input' && n.props.type === 'checkbox');
  boxes[1].props.onChange({ target: { checked: true } }); await h.settle();
  await button(h, 'Добавить выбранные себе · 1').props.onClick(); await h.settle();
  assert.equal(writes.length, 1); assert.deepEqual(JSON.parse(writes[0].init.body), { ids: ['two'] });
  assert.match(writes[0].init.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.equal(refreshed, 1); assert.match(text(h.tree), /Добавлено в мои заготовки/);
});

test('ambiguous copy retains one key and frozen selection, double click does not send twice', async () => {
  const writes = []; let release;
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return Response.json({ items: [shared('one')] });
    writes.push(init);
    if (writes.length === 1) return new Promise(resolve => { release = () => resolve(Response.json({ error: 'Uncertain' }, { status: 503 })); });
    return Response.json({ items: [{ id: 'owned' }] });
  };
  const h = await mount(); const copy = button(h, 'Добавить себе');
  const pending = copy.props.onClick(); copy.props.onClick(); await h.settle(); assert.equal(writes.length, 1);
  release(); await pending; await h.settle();
  assert.equal(nodes(h.tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.disabled, true);
  await button(h, 'Проверить результат копирования').props.onClick(); await h.settle();
  assert.equal(writes.length, 2); assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']); assert.equal(writes[0].body, writes[1].body);
});

test('unmounted shared workspace ignores delayed responses and never refreshes another owner', async () => {
  let release; let refreshed = 0;
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return Response.json({ items: [shared('one')] });
    return new Promise(resolve => { release = () => resolve(Response.json({ items: [{ id: 'late' }] })); });
  };
  const h = await mount(async () => { refreshed++; }); const pending = button(h, 'Добавить себе').props.onClick();
  h.unmount(); release(); await pending; assert.equal(refreshed, 0);
});

test('USER receives no share controls; ADMIN changes only explicit owned source', async () => {
  let state; const writes = [];
  globalThis.fetch = async (_url, init) => init?.method ? (writes.push(init), Response.json({})) : Response.json({ sourceIds: [] });
  const h = createHarness(() => { state = useLibrarySharing(); return null; }); harnesses.push(h); await h.settle();
  assert.equal(state.admin, true); assert.equal(writes.length, 0);
  await state.toggle('my-ready-item'); await h.settle();
  assert.deepEqual(JSON.parse(writes[0].body), { shared: true }); assert.equal(state.sourceIds.includes('my-ready-item'), true);
  h.unmount(); globalThis.fetch = async () => Response.json({ error: 'Forbidden' }, { status: 403 });
  const user = createHarness(() => { state = useLibrarySharing(); return null; }); harnesses.push(user); await user.settle(); assert.equal(state.admin, false);
});

test('committed copy followed by refresh 404 retains the original key for safe replay', async () => {
  const writes = []; let refreshes = 0;
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return Response.json({ items: [shared('one')] });
    writes.push(init); return Response.json({ items: [{ id: 'committed-copy' }] });
  };
  const h = await mount(async () => { if (++refreshes === 1) throw Object.assign(new Error('Concurrent personal deletion'), { status: 404 }); });
  await button(h, 'Добавить себе').props.onClick(); await h.settle();
  await button(h, 'Проверить результат копирования').props.onClick(); await h.settle();
  assert.equal(writes.length, 2); assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']); assert.equal(writes[0].body, writes[1].body);
});

test('reload recovers an owner-scoped intent without automatic copy; another owner starts independently', async () => {
  const key = '38b329e2-5f25-4af1-a272-3e91d90b180f', cache = new Map([['planly.shared-copy.a', JSON.stringify({ key, ids: ['one'] })]]), writes = [];
  globalThis.window = { sessionStorage: { getItem: id => cache.get(id) ?? null, setItem: (id, value) => cache.set(id, value), removeItem: id => cache.delete(id) } };
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return Response.json({ items: [shared('one')] });
    writes.push(init); return Response.json({ items: [{ id: 'prior-copy' }] });
  };
  const a = createHarness(() => SharedLibrary({ ownerId: 'a', onCopied: async () => {} })); harnesses.push(a); await a.settle();
  assert.equal(writes.length, 0); button(a, 'Проверить результат копирования');
  const b = createHarness(() => SharedLibrary({ ownerId: 'b', onCopied: async () => {} })); harnesses.push(b); await b.settle();
  button(b, 'Добавить себе'); assert.equal(writes.length, 0);
  await button(a, 'Проверить результат копирования').props.onClick(); await a.settle();
  assert.equal(writes[0].headers['idempotency-key'], key); assert.equal(cache.has('planly.shared-copy.a'), false);
});

test('unreadable pending intent fails closed and never sends a replacement copy', async () => {
  let writes = 0;
  globalThis.window = { sessionStorage: { getItem() { throw Error('Access unavailable'); } } };
  globalThis.fetch = async (_url, init) => { if (init?.method) writes++; return Response.json({ items: [shared('one')] }); };
  const h = createHarness(() => SharedLibrary({ ownerId: 'a', onCopied: async () => {} })); harnesses.push(h); await h.settle();
  assert.equal(button(h, 'Добавить себе').props.disabled, true); await button(h, 'Добавить себе').props.onClick();
  assert.equal(writes, 0); assert.match(text(h.tree), /Не удалось восстановить/);
});

test('aggregate rejection explains both limits and permits a smaller explicit selection', async () => {
  const writes=[];
  globalThis.fetch=async (_url,init)=>{
    if(!init?.method)return Response.json({items:[shared('one')]});
    writes.push(init);return Response.json({code:'SHARED_COPY_LIMIT_EXCEEDED',error:'private/internal/storage-key'},{status:422});
  };
  const h=await mount();await button(h,'Добавить себе').props.onClick();await h.settle();
  assert.match(text(h.tree),/20.*100 MiB/);assert.doesNotMatch(text(h.tree),/private\/internal/);
  assert.equal(nodes(h.tree,n=>n.type==='input' && n.props.type==='checkbox')[0].props.disabled,false);
  assert.equal(writes.length,1);
});

test('storage timeout explains safe same-key retry without starting another copy', async () => {
  const writes=[];
  globalThis.fetch=async (_url,init)=>{
    if(!init?.method)return Response.json({items:[shared('one')]});
    writes.push(init);return Response.json({code:'SHARED_COPY_TIMEOUT',error:'internal failure'},{status:504});
  };
  const h=await mount();await button(h,'Добавить себе').props.onClick();await h.settle();
  assert.match(text(h.tree),/60 секунд/);assert.doesNotMatch(text(h.tree),/internal failure/);
  await button(h,'Проверить результат копирования').props.onClick();await h.settle();
  assert.equal(writes[0].headers['idempotency-key'],writes[1].headers['idempotency-key']);
});

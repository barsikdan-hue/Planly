// Actual App -> Dashboard -> Composer callbacks. Deterministic lifecycle proof;
// this hook harness does not establish browser or deployed acceptance.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/composer-continuation-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../components/planner/app.tsx');
const { Composer } = await import('../components/planner/composer.tsx');
const { Dashboard } = await import('../components/planner/dashboard.tsx');
const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
let active;
afterEach(() => { active?.close(); active = null; Object.assign(globalThis, original); });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const result = find(child, predicate); if (result) return result;
  }
  if (node.props?.action) return find(node.props.action, predicate);
  return null;
}
function text(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join('');
}
async function fixture() {
  const cache = new Map(), requests = []; let complete;
  globalThis.window = { sessionStorage: {
    getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key),
  }, location: { hash: '#dashboard', assign() {} }, history: { replaceState() {} }, scrollTo() {}, confirm: () => false,
  addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false };
  const snapshot = { profile: { id: 'owner', displayName: 'Owner' }, posts: [], media: [], libraryItems: [],
    socialAccounts: [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED', providerAccountId: '-100123' }] };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json(snapshot);
    if (url === '/api/media' && !init) return Response.json(snapshot.media);
    requests.push({ url, method: init?.method });
    assert.equal(url, '/api/media'); assert.equal(init?.method, 'POST');
    return new Promise(resolve => { complete = resolve; });
  };
  const app = createHarness(PlannerApp); let child, childKey, props;
  const value = { app, cache, requests,
    close() { child?.unmount(); app.unmount(); },
    async settle() {
      await app.settle();
      const full = app.find('Composer');
      let descriptor = full;
      if (!full) {
        const dashboard = createHarness(() => Dashboard(app.find('Dashboard').props)); dashboard.render();
        descriptor = dashboard.find('Composer'); dashboard.unmount();
      }
      props = descriptor.props;
      const key = full ? `full:${descriptor.key}` : 'quick';
      if (key !== childKey) { child?.unmount(); child = createHarness(() => Composer(props)); childKey = key; }
      await child.settle(); child.render();
    },
    get props() { return props; },
    get tree() { return child.tree; },
    begin() { find(child.tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: {
      files: [new File([new Uint8Array([1])], 'late.png', { type: 'image/png' })], value: 'selected',
    } }); },
    async expand() {
      find(child.tree, node => text(node) === 'Открыть редактор' && typeof node.props?.onClick === 'function').props.onClick();
      await this.settle(); assert.equal(this.props.quick, undefined);
    },
    finish() {
      const asset = { id: 'late', originalName: 'late.png', mimeType: 'image/png', byteSize: 1, previewUrl: '/late' };
      snapshot.media.push(asset); complete(Response.json(asset, { status: 201 }));
    },
  };
  active = value;
  await value.settle(); value.props.setDraft(current => ({ ...current, text: 'Keep this text', networks: ['telegram'] }));
  await value.settle(); return value;
}
function publishAction(value) {
  return find(value.tree, node => node.type?.name === 'Action' && text(node) === 'Опубликовать сейчас');
}
test('same-mount upload retains raw draft, attaches received asset and persists recovery', async () => {
  const value = await fixture(); value.begin(); await value.settle();
  assert.equal(publishAction(value).props.disabled, true);
  value.finish(); await value.settle();
  assert.deepEqual(value.props.draft.mediaIds, ['late']);
  assert.equal(value.props.draft.text, 'Keep this text');
  assert.deepEqual(JSON.parse(value.cache.get('planly:editor:v1:owner')).editor.mediaIds, ['late']);
  assert.equal(value.requests.length, 1);
});
test('quick to full keeps publish disabled while its same-editor upload awaits', async () => {
  const value = await fixture(); value.begin(); await value.settle();
  assert.equal(publishAction(value).props.disabled, true);
  await value.expand();
  assert.equal(value.props.draft.text, 'Keep this text');
  assert.equal(value.requests.length, 1);
  assert.equal(publishAction(value).props.disabled, true, 'navigation must not release the originating editor upload lock');
});
test('quick to full attaches completed asset to the surviving draft and recovery', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.expand();
  value.finish(); await value.settle();
  assert.equal(value.props.draft.text, 'Keep this text');
  assert.ok(value.props.media.some(item => item.id === 'late'), 'asset reaches owner Media through actual App upload');
  assert.equal(value.requests.length, 1, 'upload performs no Post or publication mutation');
  assert.deepEqual(value.props.draft.mediaIds, ['late'], 'same editor survives child replacement and must receive the asset');
  assert.deepEqual(JSON.parse(value.cache.get('planly:editor:v1:owner')).editor.mediaIds, ['late']);
});

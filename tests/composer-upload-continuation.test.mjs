// Actual App -> Dashboard -> Composer callbacks. Deterministic lifecycle proof;
// this hook harness does not establish browser or deployed acceptance.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
import { toast } from 'sonner';
register('./helpers/composer-continuation-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../components/planner/app.tsx');
const { Composer } = await import('../components/planner/composer.tsx');
const { Dashboard } = await import('../components/planner/dashboard.tsx');
const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
const active = [], originalToast = { success: toast.success, error: toast.error, warning: toast.warning, info: toast.info };
afterEach(() => { for (const value of active.splice(0)) value.close(); Object.assign(toast, originalToast); Object.assign(globalThis, original); });
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
const file = name => new File([new Uint8Array([1])], name, { type: 'image/png' });
const asset = (id, name = `${id}.png`) => ({ id, originalName: name, mimeType: 'image/png', byteSize: 1, previewUrl: `/${id}` });
async function fixture({ owner = 'owner', media = [], mediaLookup, posts = [], libraryItems = [], seedCache = new Map(), mutation } = {}) {
  const cache = seedCache, requests = [], uploads = [], messages = []; let storageDenied = false, closed = false;
  for (const kind of Object.keys(originalToast)) toast[kind] = message => { messages.push({ kind, message }); };
  globalThis.window = { sessionStorage: {
    getItem: key => cache.get(key) ?? null, setItem: (key, value) => { if (storageDenied) throw Error('Storage denied'); cache.set(key, value); }, removeItem: key => cache.delete(key),
  }, location: { hash: '#dashboard', assign() {} }, history: { replaceState() {} }, scrollTo() {}, confirm: () => true,
  addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false };
  const snapshot = { profile: { id: owner, displayName: 'Owner' }, posts, media: [...media], libraryItems,
    socialAccounts: [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED', providerAccountId: '-100123' }] };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json(snapshot);
    if (url === '/api/media' && !init) return Response.json(mediaLookup ?? snapshot.media);
    const request = { url, method: init?.method, body: init?.body, key: new Headers(init?.headers).get('idempotency-key') };
    requests.push(request);
    if (url !== '/api/media') {
      if (mutation) return mutation(request, requests.filter(item => item.url !== '/api/media').length);
      throw Error(`Unexpected mutation: ${url}`);
    }
    assert.equal(init?.method, 'POST');
    return new Promise(resolve => { uploads.push({ name: init.body.get('file').name, resolve, finished: false }); });
  };
  const app = createHarness(PlannerApp); let child, childKey, props;
  const value = { app, cache, requests, uploads, messages,
    close() { if (closed) return; child?.unmount(); app.unmount(); closed = true; },
    denyStorage() { storageDenied = true; },
    async settle() {
      await app.settle();
      const full = app.find('Composer');
      let descriptor = full;
      if (!full && app.find('Dashboard')) {
        const dashboard = createHarness(() => Dashboard(app.find('Dashboard').props)); dashboard.render();
        descriptor = dashboard.find('Composer'); dashboard.unmount();
      }
      if (!descriptor) { child?.unmount(); child = null; childKey = null; props = null; return; }
      props = descriptor.props;
      const key = full ? `full:${descriptor.key}` : 'quick';
      if (key !== childKey) { child?.unmount(); child = createHarness(() => Composer(props)); childKey = key; }
      await child.settle(); child.render();
    },
    get props() { return props; },
    get tree() { return child?.tree; },
    begin(names = ['late.png']) { find(child.tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: {
      files: names.map(file), value: 'selected',
    } }); },
    drop(names) { find(child.tree, node => typeof node.props?.onDrop === 'function').props.onDrop({ preventDefault() {}, dataTransfer: { files: names.map(file) } }); },
    async navigate(view) { app.find('Navigation').props.navigate(view); await this.settle(); },
    async newEditor() { await this.navigate('dashboard'); app.find('Dashboard').props.createPost(); await this.settle(); },
    async expand() {
      find(child.tree, node => text(node) === 'Открыть редактор' && typeof node.props?.onClick === 'function').props.onClick();
      await this.settle(); assert.equal(this.props.quick, undefined);
    },
    finish(name = 'late.png', id = 'late', error) {
      const pending = uploads.find(item => item.name === name && !item.finished);
      assert.ok(pending, `Expected pending file ${name}`); pending.finished = true;
      const item = asset(id, name);
      if (!error) snapshot.media.push(item);
      pending.resolve(error ? Response.json({ error }, { status: 422 }) : Response.json(item, { status: 201 }));
    },
    get recovery() { return JSON.parse(cache.get(`planly:editor:v1:${owner}`)).editor; },
    get pending() { return cache.get(`planly:pending-create:v1:${owner}`); },
    get postRequests() { return requests.filter(item => item.url.startsWith('/api/posts')); },
  };
  active.push(value);
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
test('quick to full independently persists received asset in the surviving editor recovery', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.expand();
  value.finish(); await value.settle();
  assert.ok(value.props.media.some(item => item.id === 'late'), 'actual upload completed into owner Media');
  assert.equal(value.requests.length, 1, 'no Post or publication mutation');
  const recovered = JSON.parse(value.cache.get('planly:editor:v1:owner')).editor;
  assert.equal(recovered.text, 'Keep this text', 'same surviving editor recovery is read directly');
  assert.deepEqual(recovered.mediaIds, ['late'], 'received ID must reach durable recovery independently of the earlier draft assertion');
});

function action(value, label) {
  const result = find(value.tree, node => node.type?.name === 'Action' && text(node) === label);
  assert.ok(result, `Expected Composer action ${label}`); return result;
}
async function validSchedule(value) {
  value.props.setDraft(current => ({ ...current, date: '2099-10-06', time: '14:35' })); await value.settle();
}
for (const first of ['A', 'B']) {
  test(`overlapping remounted batches retain lock and append file order with ${first} completing first`, async () => {
    const value = await fixture({ media: [asset('M1'), asset('M2')] });
    value.props.setDraft(current => ({ ...current, mediaIds: ['M1'] })); await value.settle();
    value.begin(['A1.png', 'A2.png']); await value.settle(); await value.expand();
    value.drop(['B1.png', 'B2.png']); await value.settle();
    value.props.setDraft(current => ({ ...current, text: 'Latest raw text', overrides: { telegram: 'Latest variant' },
      networks: ['telegram', 'max'], date: '2099-11-12', time: '18:42', mediaIds: ['M2', 'M1'] })); await value.settle();
    for (const name of [`${first}1`, `${first}2`]) { value.finish(`${name}.png`, name); await value.settle(); }
    assert.equal(action(value, 'Сохранить черновик').props.disabled, true, 'another batch remains active');
    const other = first === 'A' ? 'B' : 'A';
    for (const name of [`${other}1`, `${other}2`]) { value.finish(`${name}.png`, name); await value.settle(); }
    assert.deepEqual(value.props.draft.mediaIds, first === 'A' ? ['M2', 'M1', 'A1', 'A2', 'B1', 'B2'] : ['M2', 'M1', 'B1', 'B2', 'A1', 'A2']);
    assert.equal(value.props.draft.text, 'Latest raw text'); assert.deepEqual(value.props.draft.overrides, { telegram: 'Latest variant' });
    assert.deepEqual(value.props.draft.networks, ['telegram', 'max']);
    assert.equal(value.props.draft.date, '2099-11-12'); assert.equal(value.props.draft.time, '18:42');
    assert.deepEqual(value.recovery.mediaIds, value.props.draft.mediaIds);
    assert.equal(action(value, 'Сохранить черновик').props.disabled, false);
    assert.equal(value.postRequests.length, 0);
  });
}
for (const intent of ['draft', 'scheduled', 'now']) {
  test(`captured direct ${intent} callback cannot create a Post or pending request during upload`, async () => {
    const value = await fixture(); await validSchedule(value); await value.expand();
    const captured = value.props, pending = value.pending;
    value.begin(); // Parent must reject the call immediately, before a busy render.
    if (intent === 'now') await captured.publishNow(captured.draft); else await captured.save(captured.draft, intent);
    await value.settle();
    assert.equal(value.postRequests.length, 0, 'parent callback must enforce the upload guard');
    assert.equal(value.pending, pending, 'guard runs before durable creation state is written');
  });
}
for (const intent of ['draft', 'scheduled', 'now']) {
  test(`previously enabled child ${intent} action cannot bypass a pending upload`, async () => {
    const value = await fixture(); await validSchedule(value);
    if (intent !== 'scheduled') await value.expand();
    const captured = action(value, intent === 'draft' ? 'Сохранить черновик' : intent === 'now' ? 'Опубликовать сейчас' : 'Запланировать');
    assert.equal(captured.props.disabled, false);
    value.begin(); await value.settle(); captured.props.onClick(); await value.settle();
    assert.equal(value.postRequests.length, 0); assert.equal(value.pending, undefined);
  });
}
for (const command of ['new', 'edit', 'duplicate']) {
  test(`${command} editor replacement rejects all captured submit callbacks even without a pending batch`, async () => {
    const post = { id: 'editable', title: null, baseText: 'Stored editable post', status: 'DRAFT', mediaIds: [], targets: [],
      editBlockedReason: null, createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' };
    const value = await fixture({ posts: [post] }); await validSchedule(value); const captured = value.props;
    if (command === 'new') await value.newEditor();
    else if (command === 'duplicate') { captured.duplicatePost(); await value.settle(); }
    else {
      await value.navigate('content'); const content = value.app.find('Content');
      content.props.editPost(content.props.posts[0]); await value.settle();
      assert.equal(value.props.draft.id, 'editable', 'actual server-listed edit command replaced the editor');
    }
    value.props.setDraft(current => ({ ...current, text: 'Different editor' })); await value.settle();
    const recovery = value.cache.get('planly:editor:v1:owner');
    await captured.save(captured.draft, 'draft'); await captured.save(captured.draft, 'scheduled'); await captured.publishNow(captured.draft);
    await value.settle();
    assert.equal(value.postRequests.length, 0, 'departed token cannot submit its stale content');
    assert.equal(value.pending, undefined); assert.equal(value.cache.get('planly:editor:v1:owner'), recovery);
  });
}
test('captured departed file-input callback cannot start an upload in another editor', async () => {
  const value = await fixture();
  const oldInput = find(value.tree, node => node.type === 'input' && node.props.type === 'file');
  await value.newEditor(); const recovery = value.cache.get('planly:editor:v1:owner');
  oldInput.props.onChange({ target: { files: [file('stale.png')], value: 'selected' } }); await value.settle();
  assert.equal(value.requests.length, 0); assert.equal(value.cache.get('planly:editor:v1:owner'), recovery);
});
for (const outcome of ['success', 'error']) {
  test(`old-token ${outcome} completion neither changes new editor nor releases its active batch`, async () => {
    const value = await fixture(); value.begin(); await value.settle(); await value.newEditor();
    assert.equal(publishAction(value).props.disabled, false, 'old editor batch must not hold the replacement editor');
    value.props.setDraft(current => ({ ...current, text: 'New editor text', networks: ['telegram'] })); await value.settle();
    assert.equal(publishAction(value).props.disabled, false, 'old editor batch must not hold the new editor');
    value.begin(['new.png']); await value.settle(); const recovery = value.cache.get('planly:editor:v1:owner');
    const messageCount = value.messages.length;
    value.finish('late.png', 'old', outcome === 'error' ? 'Rejected old file' : undefined); await value.settle();
    assert.equal(value.props.draft.text, 'New editor text'); assert.deepEqual(value.props.draft.mediaIds, []);
    assert.equal(value.cache.get('planly:editor:v1:owner'), recovery);
    assert.equal(value.messages.length, messageCount, 'stale token must not show completion or error messages');
    assert.equal(publishAction(value).props.disabled, true, 'old finally must not finish a different batch');
    assert.equal(value.props.media.some(item => item.id === 'old'), outcome === 'success', 'same-owner old asset may reach global Media');
    value.finish('new.png', 'new'); await value.settle();
    assert.deepEqual(value.props.draft.mediaIds, ['new']); assert.equal(publishAction(value).props.disabled, false);
  });
}
test('navigation away and back retains same-token upload lock and attachment continuation', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.navigate('settings');
  assert.equal(value.tree, undefined); await value.navigate('create');
  assert.equal(publishAction(value).props.disabled, true);
  value.finish(); await value.settle(); assert.deepEqual(value.props.draft.mediaIds, ['late']);
  assert.deepEqual(value.recovery.mediaIds, ['late']);
});
test('completion while editor is not rendered still updates its parent draft and recovery', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.navigate('media');
  value.finish(); await value.settle();
  assert.deepEqual(value.recovery.mediaIds, ['late']); await value.navigate('create');
  assert.deepEqual(value.props.draft.mediaIds, ['late']); assert.equal(publishAction(value).props.disabled, false);
});
test('full App unmount suppresses upload attachment, persistence, and completion messages', async () => {
  const value = await fixture(); value.begin(); await value.settle(); const recovery = value.cache.get('planly:editor:v1:owner');
  const messageCount = value.messages.length; value.close(); value.finish(); await value.app.settle();
  assert.equal(value.cache.get('planly:editor:v1:owner'), recovery);
  assert.equal(value.messages.length, messageCount, 'unmounted App must not notify the new screen');
  assert.equal(value.app.composer().media.some(item => item.id === 'late'), false, 'unmounted App cannot apply late global assets');
});
test('full App unmount prevents dispatch of subsequent files in its old batch', async () => {
  const value = await fixture(); value.begin(['late.png', 'next.png']); await value.settle();
  value.close(); value.finish(); await value.app.settle();
  assert.equal(value.requests.length, 1, 'owner lifecycle guard runs before starting another file');
});
test('same-owner departed token continues remaining files only into global Media', async () => {
  const value = await fixture(); value.begin(['late.png', 'second.png']); await value.settle(); await value.newEditor();
  const recovery = value.cache.get('planly:editor:v1:owner'), messageCount = value.messages.length;
  value.finish(); await value.settle(); assert.equal(value.requests.length, 2, 'token departure alone must not cancel owner upload');
  value.finish('second.png', 'second'); await value.settle();
  assert.deepEqual(value.props.media.map(item => item.id), ['late', 'second']); assert.deepEqual(value.props.draft.mediaIds, []);
  assert.equal(value.cache.get('planly:editor:v1:owner'), recovery); assert.equal(value.messages.length, messageCount);
  assert.equal(publishAction(value).props.disabled, false);
});
test('unmounted old-owner callbacks cannot mutate a replacement owner App or its recovery', async () => {
  const old = await fixture(); const captured = old.props; old.close();
  const next = await fixture({ owner: 'other' }); const recovery = next.cache.get('planly:editor:v1:other');
  await captured.save(captured.draft, 'draft'); await captured.publishNow(captured.draft); await next.settle();
  assert.equal(next.postRequests.length, 0); assert.equal(next.cache.get('planly:pending-create:v1:owner'), undefined);
  assert.equal(next.cache.get('planly:editor:v1:other'), recovery); assert.deepEqual(next.props.draft.mediaIds, []);
});
test('old-owner media response after replacement App cannot apply global assets or emit messages', async () => {
  const old = await fixture(); old.begin(); await old.settle(); old.close();
  // GET deliberately includes the acknowledged old file: the real client lookup
  // succeeds, so an absent lookup cannot accidentally prove ownership rejection.
  const next = await fixture({ owner: 'other', mediaLookup: [asset('late', 'late.png')] });
  const recovery = next.cache.get('planly:editor:v1:other'), messages = next.messages.length;
  old.finish(); await old.app.settle(); await next.settle();
  assert.equal(old.app.composer().media.some(item => item.id === 'late'), false, 'old App rejects late global application');
  assert.equal(next.props.media.some(item => item.id === 'late'), false);
  assert.equal(next.messages.length, messages); assert.equal(next.cache.get('planly:editor:v1:other'), recovery);
  assert.deepEqual(next.props.draft.mediaIds, []);
});
test('partial upload continues through per-file rejection and appends successful files in input order', async () => {
  const value = await fixture(); value.begin(['first.png', 'bad.png', 'last.png']); await value.settle(); await value.expand();
  value.finish('first.png', 'first'); await value.settle();
  value.finish('bad.png', 'bad', 'Unsupported image'); await value.settle();
  assert.equal(publishAction(value).props.disabled, true);
  value.finish('last.png', 'last'); await value.settle();
  assert.deepEqual(value.props.draft.mediaIds, ['first', 'last']); assert.deepEqual(value.recovery.mediaIds, ['first', 'last']);
  assert.ok(value.messages.some(item => item.kind === 'error' && item.message.includes('bad.png')));
  assert.equal(publishAction(value).props.disabled, false);
});
test('empty upload leaves pending batch locked and does not alter raw editor or recovery', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.expand();
  const recovery = value.cache.get('planly:editor:v1:owner'); value.drop([]); await value.settle();
  assert.equal(publishAction(value).props.disabled, true); assert.equal(value.requests.length, 1);
  assert.equal(value.cache.get('planly:editor:v1:owner'), recovery);
  value.finish(); await value.settle(); assert.deepEqual(value.props.draft.mediaIds, ['late']);
});
test('all-rejected same-editor batch releases its lock without creating attachments or pending Post', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.expand();
  const recovery = value.cache.get('planly:editor:v1:owner'); value.finish('late.png', 'late', 'Invalid media'); await value.settle();
  assert.deepEqual(value.props.draft.mediaIds, []); assert.equal(value.cache.get('planly:editor:v1:owner'), recovery);
  assert.equal(publishAction(value).props.disabled, false); assert.equal(value.pending, undefined); assert.equal(value.postRequests.length, 0);
  assert.ok(value.messages.some(item => item.kind === 'error' && item.message.includes('late.png')));
});
test('duplicate acknowledgement IDs retain first occurrence and existing manual order', async () => {
  const value = await fixture({ media: [asset('M1'), asset('shared')] });
  value.props.setDraft(current => ({ ...current, mediaIds: ['M1', 'shared'] })); await value.settle();
  await value.expand(); value.begin(['one.png', 'two.png']); await value.settle();
  value.finish('one.png', 'shared'); await value.settle(); value.finish('two.png', 'shared'); await value.settle();
  assert.deepEqual(value.props.draft.mediaIds, ['M1', 'shared']); assert.deepEqual(value.recovery.mediaIds, ['M1', 'shared']);
});
test('storage-denied completion retains visible latest attachment and recovery-unavailable warning', async () => {
  const value = await fixture(); value.begin(); await value.settle(); await value.expand(); value.denyStorage();
  value.props.setDraft(current => ({ ...current, text: 'Latest visible work' })); await value.settle();
  value.finish(); await value.settle(); assert.equal(value.props.draft.text, 'Latest visible work');
  assert.deepEqual(value.props.draft.mediaIds, ['late']);
  assert.ok(value.messages.some(item => item.kind === 'error' && item.message.includes('Восстановление')), 'existing storage warning remains visible');
  assert.deepEqual(value.recovery.mediaIds, [], 'denied persistence is not reported as durable recovery');
});
for (const view of ['content', 'media']) {
  test(`default ${view} shared upload returns partial assets and messages without attaching to Composer`, async () => {
    const value = await fixture(); const recovery = value.cache.get('planly:editor:v1:owner'); await value.navigate(view);
    const caller = value.app.find(view === 'content' ? 'ContentLibrary' : 'MediaLibrary');
    const completion = caller.props.upload([file('good.png'), file('bad.png')]); await value.settle();
    value.finish('good.png', 'good'); await value.settle(); value.finish('bad.png', 'bad', 'Rejected file');
    const added = await completion; await value.settle();
    assert.deepEqual(added.map(item => item.id), ['good']);
    assert.ok(value.messages.some(item => item.kind === 'success')); assert.ok(value.messages.some(item => item.kind === 'error'));
    assert.equal(value.cache.get('planly:editor:v1:owner'), recovery); await value.navigate('create');
    assert.deepEqual(value.props.draft.mediaIds, []); assert.ok(value.props.media.some(item => item.id === 'good'));
  });
}
test('standalone Composer without optional parent control retains single-upload attachment behavior', async () => {
  const value = await fixture(); const standalone = createHarness(() => Composer({ ...value.props, uploadControl: undefined }));
  try {
    await standalone.settle();
    find(standalone.tree, node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file('late.png')], value: 'selected' } });
    await standalone.settle();
    assert.equal(find(standalone.tree, node => node.type?.name === 'Action' && text(node) === 'Опубликовать сейчас').props.disabled, true);
    value.finish(); await standalone.settle(); await value.settle();
    assert.deepEqual(value.props.draft.mediaIds, ['late']); assert.deepEqual(value.recovery.mediaIds, ['late']);
  } finally { standalone.unmount(); }
});
for (const origin of ['composer', 'swipe-planner']) {
  test(`global ${origin} retry entrypoint cannot replay a Post while current editor upload is pending`, async () => {
    const item = { id: 'source', title: null, text: 'Library source', mediaIds: [], status: 'READY', sourcePostId: null,
      createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' };
    const value = await fixture({ libraryItems: [item], mutation: () => { throw Error('Response lost after commit'); } });
    if (origin === 'composer') { await value.props.save(value.props.draft, 'draft'); await value.settle(); }
    else {
      await value.navigate('content'); value.app.find('ContentLibrary').props.startReview(); await value.settle();
      await assert.rejects(value.app.find('SwipePlanner').props.onApprove(item, { mode: 'draft', providers: [], scheduledAt: null }), /Response lost/);
      await value.settle(); await value.navigate('create');
    }
    assert.equal(value.postRequests.length, 1); assert.ok(value.pending);
    const capturedRetry = find(value.app.tree, node => text(node) === 'Повторить сохранение' && typeof node.props?.onClick === 'function');
    assert.ok(capturedRetry); assert.equal(capturedRetry.props.disabled, false, 'retry is available before upload');
    value.begin(); await value.settle(); const pending = value.pending;
    const retry = find(value.app.tree, node => text(node) === 'Повторить сохранение' && typeof node.props?.onClick === 'function');
    assert.ok(retry); assert.equal(retry.props.disabled, true, 'active editor upload disables the real retry button');
    capturedRetry.props.onClick(); await value.settle();
    assert.equal(value.postRequests.length, 1, 'retry must check parent upload state before replay dispatch');
    assert.equal(value.pending, pending);
    value.finish(); await value.settle(); assert.deepEqual(value.props.draft.mediaIds, ['late']);
  });
}

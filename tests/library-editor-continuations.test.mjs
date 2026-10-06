import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, cleanup, item, asset, deferred, libraryKey, find } from './helpers/library-editor-fixture.mjs';
afterEach(cleanup);
const response = request => Response.json({ ...item(request.method === 'POST' ? 'created' : decodeURIComponent(request.url.split('/').at(-1))), ...request.body });
async function open(value, content = 'raw work') { await value.settle(); await value.open(); await value.change('library-text', content); }
async function startSave(value) { value.button('Сохранить').props.onClick(); await value.settle(); }

for (const content of ['', ' ', '\n raw work \n']) test(`Library reload retains raw text ${JSON.stringify(content)} and title-only/empty editor`, async () => {
  const first = fixture(); await open(first, content); await first.change('library-title', '  idea  ');
  first.unmount(); const reload = fixture({ cache: first.cache }); await reload.settle();
  assert.equal(reload.field('library-title')?.props.value, '  idea  ');
  assert.equal(reload.field('library-text')?.props.value, content); assert.equal(reload.requests.length, 0);
});
test('Library empty and media-only forms survive Swipe remount independently of Composer key', async () => {
  const value = fixture(); await value.settle();
  const startReview = value.props().startReview; await value.open();
  startReview(); await value.settle(); value.app.find('SwipePlanner').props.onClose(); await value.settle();
  assert.equal(value.field('library-text')?.props.value, '');
  value.button('B.png').props.onClick(); await value.settle(); value.button('A.png').props.onClick(); await value.settle();
  value.cache.setItem('planly:editor:v1:owner', 'independent');
  await value.navigate('calendar'); await value.navigate('content'); assert.deepEqual(value.mediaIds(), ['B', 'A']);
  value.button('Отмена').props.onClick(); await value.settle();
  assert.equal(value.cache.getItem(libraryKey('owner')), null); assert.equal(value.cache.getItem('planly:editor:v1:owner'), 'independent');
});
for (const status of ['READY', 'ARCHIVED', 'USED']) test(`Recovered existing Library Save uses PATCH and current ${status} server authority`, async () => {
  const first = fixture({ items: [item()] }); await first.settle(); first.button('Редактировать').props.onClick(); await first.settle();
  await first.change('library-text', '  changed raw  '); first.unmount();
  const reload = fixture({ cache: first.cache, items: [item('existing', status)], mutation: response }); await reload.settle(); await startSave(reload);
  assert.equal(reload.requests.length, 1); assert.equal(reload.requests[0].url, '/api/library-items/existing');
  assert.equal(reload.requests[0].method, 'PATCH'); assert.deepEqual(reload.requests[0].body,
    { title: 'Server title', text: 'changed raw', mediaIds: [], status: status === 'ARCHIVED' ? 'ARCHIVED' : 'READY' });
  assert.equal('sourcePostId' in reload.requests[0].body, false); assert.equal(reload.cached(), null);
});
test('Missing recovered Library item retains ID, shows conflict and cannot become POST', async () => {
  const first = fixture({ items: [item()] }); await first.settle(); first.button('Редактировать').props.onClick(); await first.settle(); first.unmount();
  const reload = fixture({ cache: first.cache }); await reload.settle();
  assert.equal(reload.cached()?.editor.id, 'existing'); assert.equal(reload.button('Сохранить')?.props.disabled, true);
  reload.button('Сохранить').props.onClick(); await reload.settle(); assert.equal(reload.requests.length, 0);
  assert.ok(reload.control().blockedReason); assert.equal(reload.field('library-text').props.value, 'Server text');
});
test('Missing recovered media filter only absent IDs, preserve raw fields/order and show notice', async () => {
  const first = fixture(); await open(first); first.button('B.png').props.onClick(); await first.settle(); first.button('A.png').props.onClick(); await first.settle(); first.unmount();
  const reload = fixture({ cache: first.cache, media: [asset('A')] }); await reload.settle();
  assert.equal(reload.field('library-text')?.props.value, 'raw work'); assert.deepEqual(reload.mediaIds(), ['A']);
  assert.match(reload.errors(), /исключены.*1/); assert.equal(reload.requests.length, 0);
});
test('Deferred successful Save survives child remount, holds parent lock, clears matching cache only', async () => {
  const pending = deferred(), value = fixture({ mutation: () => pending.promise }); await open(value);
  const staleSave = value.button('Сохранить').props.onClick; staleSave(); await value.settle();
  await value.navigate('calendar'); await value.navigate('content');
  assert.equal(value.button('Сохранить')?.props.disabled, true, 'remount must retain operation lock');
  value.button('Сохранить').props.onClick(); staleSave(); await value.settle(); assert.equal(value.requests.length, 1);
  await value.navigate('calendar'); pending.resolve(Response.json({ ...item('created'), title: null, text: 'raw work' })); await value.settle(); await value.navigate('content');
  assert.equal(value.cached(), null); assert.equal(value.field('library-text'), null);
  assert.equal(value.props().items.some(i => i.id === 'created'), true);
});
test('Known create acknowledgement preserves newer same-token work and next Save PATCHes', async () => {
  const pending = deferred(), value = fixture({ mutation: (request, count) => count === 1 ? pending.promise : response(request) }); await open(value);
  const queuedChange = value.field('library-text').props.onChange; await startSave(value);
  queuedChange({ target: { value: 'newer work' } }); await value.settle();
  pending.resolve(Response.json(item('created'))); await value.settle();
  assert.equal(value.field('library-text').props.value, 'newer work'); assert.equal(value.cached().editor.id, 'created');
  await startSave(value); assert.equal(value.requests.length, 2); assert.equal(value.requests[1].method, 'PATCH');
  assert.equal(value.requests[1].url, '/api/library-items/created'); assert.equal(value.requests[1].body.text, 'newer work');
});
test('Old cache is not current Save durability after write failure; explicit Cancel can remove same token', async () => {
  const value = fixture({ mutation: response }); await open(value, 'old'); value.cache.failWriteKey = libraryKey('owner');
  await value.change('library-text', 'new work'); await startSave(value);
  assert.equal(value.field('library-text')?.props.value, 'new work'); assert.equal(value.control().editor.id, 'created');
  assert.equal(value.cached().editor.text, 'old');
  value.button('Отмена').props.onClick(); await value.settle(); assert.equal(value.field('library-text'), null);
  value.cache.failWriteKey = ''; assert.equal(value.cached(), null);
});
test('Failed saved cache removal keeps acknowledged ID and form; failed Cancel keeps error', async () => {
  const value = fixture({ mutation: response }); await open(value); value.cache.failRemove = true; await startSave(value);
  assert.equal(value.field('library-text')?.props.value, 'raw work'); assert.equal(value.cached().editor.id, 'created');
  value.button('Отмена').props.onClick(); await value.settle(); assert.equal(value.field('library-text').props.value, 'raw work');
  assert.ok(value.control().error); value.cache.failRemove = false; value.button('Отмена').props.onClick(); await value.settle();
  assert.equal(value.field('library-text'), null); assert.equal(value.cached(), null);
});
test('Lost Save response retains raw work without automatic second POST after navigation/reload', async () => {
  const value = fixture({ mutation: () => { throw Error('Response lost'); } }); await open(value, ' raw '); await startSave(value);
  await value.navigate('calendar'); await value.navigate('content'); assert.equal(value.field('library-text')?.props.value, ' raw ');
  assert.equal(value.requests.length, 1); value.unmount(); const reload = fixture({ cache: value.cache }); await reload.settle();
  assert.equal(reload.requests.length, 0); assert.equal(reload.field('library-text')?.props.value, ' raw ');
});
test('Token replacement rejects old Save cleanup/error and old finally cannot unlock new Save', async () => {
  const old = deferred(), newer = deferred(), value = fixture({ items: [item()], mutation: (_request, count) => count === 1 ? old.promise : newer.promise }); await open(value);
  // Ordinary known-item PATCH can be superseded while unresolved CREATE must be resolved first (covered by CR06).
  value.control().onChange({ id: 'existing', title: 'Server title', text: 'raw work', mediaIds: [] }); await value.settle();
  const oldControl = value.control(); assert.ok(oldControl, 'parent owns editor'); await startSave(value);
  oldControl.onChange({ title: 'another', text: 'another', mediaIds: [] }); await value.settle();
  const before = value.cached(); await startSave(value); assert.equal(value.requests.length, 2);
  old.reject(Error('old failure')); await value.settle();
  assert.deepEqual(value.cached(), before); assert.equal(value.control().error, null); assert.equal(value.control().busy, true);
  newer.resolve(Response.json({ ...item('newer'), title: 'another', text: 'another' })); await value.settle(); assert.equal(value.cached(), null);
});
test('Old Save after full App unmount cannot alter replacement owner cache or server list', async () => {
  const old = deferred(), first = fixture({ mutation: () => old.promise }); await open(first); await startSave(first); first.unmount();
  const next = fixture({ cache: first.cache, owner: 'other' }); await open(next, 'other work'); const before = next.cached('other');
  old.resolve(Response.json(item('old-created'))); await next.settle();
  assert.deepEqual(next.cached('other'), before); assert.equal(next.control().editor.text, 'other work');
  assert.equal(next.props().items.some(i => i.id === 'old-created'), false);
});
test('Deferred upload attaches after navigation and remount cannot dispatch duplicate upload or Save', async () => {
  const pending = deferred(), value = fixture({ mutation: () => pending.promise }); await open(value);
  const control = value.control(); assert.ok(control, 'parent upload owner');
  const uploading = value.input('Загрузить медиа заготовки').props.onChange({ target: {
    files: [new File(['x'], 'C.png', { type: 'image/png' })], value: 'selected' } }); await value.settle();
  await value.navigate('calendar'); await value.navigate('content'); assert.equal(value.control().busy, true);
  await value.control().upload([new File(['x'], 'duplicate.png')]); value.button('Сохранить').props.onClick(); await value.settle();
  assert.equal(value.requests.length, 1); await value.navigate('calendar');
  value.snapshot.media.push(asset('C')); pending.resolve(Response.json(asset('C'))); await uploading; await value.settle(); await value.navigate('content');
  assert.deepEqual(value.mediaIds(), ['C']); assert.equal(value.cached().editor.mediaIds[0], 'C'); assert.equal(value.control().busy, false);
});
test('Cancelled upload token only adds asset to same-owner Media, never a newer editor', async () => {
  const pending = deferred(), value = fixture({ mutation: () => pending.promise }); await open(value);
  const control = value.control(); assert.ok(control); const uploading = control.upload([new File(['x'], 'C.png')]); await value.settle();
  control.cancel(); await value.settle(); await value.open(); await value.change('library-text', 'new');
  value.snapshot.media.push(asset('C')); pending.resolve(Response.json(asset('C'))); await uploading; await value.settle();
  assert.deepEqual(value.control().editor.mediaIds, []); assert.equal(value.props().media.some(i => i.id === 'C'), true);
});
test('Upload after App unmount cannot attach or persist into another owner', async () => {
  const pending = deferred(), first = fixture({ mutation: () => pending.promise }); await open(first);
  const control = first.control(); assert.ok(control); const uploading = control.upload([new File(['x'], 'C.png')]); await first.settle(); first.unmount();
  const next = fixture({ cache: first.cache, owner: 'other', media: [asset('C')] }); await open(next, 'other'); const before = next.cached('other');
  pending.resolve(Response.json(asset('C'))); await uploading; await next.settle(); assert.deepEqual(next.cached('other'), before);
  assert.deepEqual(next.control().editor.mediaIds, []);
});
test('Server poll changes Library authority without replacing editor and missing source blocks Save', async () => {
  const value = fixture({ items: [item()], scheduled: true }); await value.settle(); value.button('Редактировать').props.onClick(); await value.settle();
  await value.change('library-text', 'unsaved'); value.snapshot.libraryItems = []; await value.poll();
  assert.equal(value.field('library-text').props.value, 'unsaved'); assert.equal(value.button('Сохранить').props.disabled, true);
  value.button('Сохранить').props.onClick(); await value.settle(); assert.equal(value.requests.length, 0);
});
test('Generic card Save/Delete acknowledgement cannot clear an open Library editor', async () => {
  const value = fixture({ items: [item()], mutation: request => request.method === 'DELETE' ? new Response(null, { status: 204 }) : response(request) });
  await open(value); const before = value.cached(); await value.props().saveItem({ title: null, text: 'Server text', mediaIds: [], status: 'ARCHIVED' }, 'existing'); await value.settle();
  await value.props().deleteItem('existing'); await value.settle(); assert.deepEqual(value.cached(), before); assert.equal(value.field('library-text').props.value, 'raw work');
});
test('Owner replacement observed by poll rejects old Save and cannot unlock the new owner operation', async () => {
  const old = deferred(), newer = deferred(), value = fixture({ scheduled: true, mutation: (_request, count) => count === 1 ? old.promise : newer.promise });
  await open(value); await startSave(value);
  value.snapshot.profile.id = 'other'; value.snapshot.libraryItems = []; value.snapshot.media = [asset('other-media')]; await value.poll();
  assert.equal(value.field('library-text'), null, 'owner replacement must not expose previous owner editor');
  await value.open(); await value.change('library-text', 'other work'); await startSave(value); const before = value.cached('other');
  old.resolve(Response.json(item('old-created'))); await value.settle();
  assert.deepEqual(value.cached('other'), before); assert.equal(value.control().busy, true);
  assert.equal(value.props().items.some(i => i.id === 'old-created'), false);
  assert.deepEqual(value.props().media.map(m => m.id), ['other-media']);
  newer.resolve(Response.json({ ...item('other-created'), title: null, text: 'other work' })); await value.settle(); assert.equal(value.cached('other'), null);
});
test('Current poll lifecycle controls existing Save without replaying cached status or provenance', async () => {
  const value = fixture({ items: [item('existing', 'USED')], scheduled: true, mutation: response }); await value.settle();
  value.button('Редактировать').props.onClick(); await value.settle(); await value.change('library-text', 'unsaved');
  const before = value.cached(); value.snapshot.libraryItems = [item('existing', 'ARCHIVED')]; await value.poll();
  assert.deepEqual(value.cached(), before); await startSave(value);
  assert.equal(value.requests[0].body.status, 'ARCHIVED'); assert.equal('sourcePostId' in value.requests[0].body, false);
});
test('Invalid or unreadable recovery never hydrates or submits Library content', async () => {
  for (const failure of ['invalid', 'read']) {
    const value = fixture(); value.cache.setItem(libraryKey('owner'), '{'); value.cache.failRead = failure === 'read'; await value.settle();
    assert.equal(value.field('library-text'), null); assert.equal(value.requests.length, 0);
    assert.ok(value.control().error || value.control().notice);
  }
});
test('Library upload preserves ordered partial successes and enforces attachment cap before HTTP', async () => {
  const value = fixture({ mutation: request => {
    const file = request.body.get('file'); if (file.name === 'failed.png') throw Error('upload failed');
    const created = asset(file.name.split('.')[0]); value.snapshot.media.push(created); return Response.json(created);
  } }); await open(value); value.button('B.png').props.onClick(); await value.settle();
  assert.ok(value.control()); await value.control().upload(['C', 'failed', 'D'].map(id => new File(['x'], `${id}.png`))); await value.settle();
  assert.deepEqual(value.control().editor.mediaIds, ['B', 'C', 'D']);
  await value.control().upload(Array.from({ length: 18 }, () => new File(['x'], 'excess.png'))); await value.settle();
  assert.equal(value.requests.length, 3); assert.ok(value.control().error);
});
test('Deleted selected Media while Library is unmounted filters only vanished attachments', async () => {
  const value = fixture({ mutation: () => new Response(null, { status: 204 }) }); await open(value);
  value.button('B.png').props.onClick(); await value.settle(); value.button('A.png').props.onClick(); await value.settle();
  await value.navigate('media'); value.app.find('MediaLibrary').props.remove(value.app.find('MediaLibrary').props.media.find(m => m.id === 'B')); await value.settle();
  find(value.app.tree, node => node.type?.name === 'AlertDialogAction').props.onClick(); await value.settle(); await value.navigate('content');
  assert.deepEqual(value.mediaIds(), ['A']); assert.equal(value.field('library-text').props.value, 'raw work');
  assert.match(value.errors(), /исключены.*1/);
});
test('A closed-editor callback from the previous owner cannot open a form or set error in the new owner', async () => {
  const value = fixture({ scheduled: true }); await value.settle(); const old = value.control(); assert.ok(old);
  value.snapshot.profile.id = 'other'; await value.poll();
  old.onChange({ title: 'old owner', text: 'private old work', mediaIds: [] }); old.onError('old error'); await value.settle();
  assert.equal(value.field('library-text'), null); assert.equal(value.control().error, null);
  assert.equal(value.cached('other'), null);
});
test('Same-owner poll filters externally removed media while retaining Library raw work and order', async () => {
  const value = fixture({ scheduled: true }); await open(value); value.button('B.png').props.onClick(); await value.settle();
  value.button('A.png').props.onClick(); await value.settle(); await value.navigate('calendar');
  value.snapshot.media = [asset('A')]; await value.poll(); await value.navigate('content');
  assert.deepEqual(value.mediaIds(), ['A']); assert.equal(value.field('library-text').props.value, 'raw work');
  assert.match(value.errors(), /исключены.*1/); assert.equal(value.requests.length, 0);
});
test('A poll started before upload acknowledgement cannot remove its known asset or attachment', async () => {
  const value = fixture({ scheduled: true, mutation: () => {
    value.snapshot.media.push(asset('C')); return Response.json(asset('C'));
  } }); await open(value); const pending = deferred(), fetchCurrent = globalThis.fetch;
  globalThis.fetch = (url, init) => url === '/api/bootstrap' ? pending.promise : fetchCurrent(url, init);
  await value.poll(); await value.control().upload([new File(['x'], 'C.png')]); await value.settle();
  assert.deepEqual(value.mediaIds(), ['C']);
  pending.resolve(Response.json({ ...value.snapshot, media: [asset('A'), asset('B')] })); await value.settle();
  assert.deepEqual(value.mediaIds(), ['C']); assert.equal(value.props().media.some(m => m.id === 'C'), true);
});

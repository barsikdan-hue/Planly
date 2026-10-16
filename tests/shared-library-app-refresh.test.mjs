import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, cleanup, item, asset, deferred, find } from './helpers/library-editor-fixture.mjs';
afterEach(cleanup);

function holdLibraryRefresh(value) {
  const pending = deferred(), fetchCurrent = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = (url, init) => url === '/api/library-items' && !init?.method
    ? ++reads === 1 ? pending.promise : Promise.resolve(Response.json(value.snapshot.libraryItems))
    : fetchCurrent(url, init);
  return pending;
}

test('shared-copy refresh uses current personal records and media rather than an older replay receipt', async () => {
  const value = fixture({ items: [item('private')] }); await value.settle();
  const current = { ...item('copied'), text: 'Current server text', mediaIds: ['C'] };
  value.snapshot.libraryItems = [item('private'), current]; value.snapshot.media.push(asset('C'));
  const fetchCurrent = globalThis.fetch;
  globalThis.fetch = (url, init) => url === '/api/library-items' && !init?.method
    ? Promise.resolve(Response.json(value.snapshot.libraryItems)) : fetchCurrent(url, init);
  await value.props().onSharedCopied([{ ...item('copied'), text: 'Old receipt text', mediaIds: ['B'] }]); await value.settle();
  assert.deepEqual(value.props().items, [item('private'), current]);
  assert.deepEqual(value.props().media.map(media => media.id), ['A', 'B', 'C']);
});

test('shared-copy refresh cannot resurrect a copied item after its deletion is acknowledged', async () => {
  const value = fixture({ items: [item('copied')], mutation: request => {
    assert.equal(request.method, 'DELETE'); value.snapshot.libraryItems = []; return new Response(null, { status: 204 });
  } }); await value.settle();
  const pending = holdLibraryRefresh(value), refreshing = value.props().onSharedCopied([item('copied')]);
  await value.props().deleteItem('copied'); await value.settle();
  assert.deepEqual(value.props().items, []);
  pending.resolve(Response.json([item('copied')])); await refreshing; await value.settle();
  assert.deepEqual(value.props().items, []);
});

test('shared-copy refresh cannot overwrite a newer acknowledged edit of the same copied item', async () => {
  const value = fixture({ items: [item('copied')], mutation: request => {
    assert.equal(request.method, 'PATCH'); const saved = { ...item('copied'), ...request.body };
    value.snapshot.libraryItems = [saved]; return Response.json(saved);
  } }); await value.settle();
  const pending = holdLibraryRefresh(value), refreshing = value.props().onSharedCopied([item('copied')]);
  await value.props().saveItem({ title: 'New title', text: 'New saved text', mediaIds: ['B'], status: 'READY' }, 'copied'); await value.settle();
  pending.resolve(Response.json([item('copied')])); await refreshing; await value.settle();
  assert.equal(value.props().items[0].title, 'New title');
  assert.equal(value.props().items[0].text, 'New saved text');
  assert.deepEqual(value.props().items[0].mediaIds, ['B']);
});

test('shared-copy refresh cannot restore media deleted after an older copy receipt detached it', async () => {
  const value = fixture({ items: [item('copied')], mutation: request => {
    assert.equal(request.method, 'DELETE'); assert.equal(request.url, '/api/media/B');
    value.snapshot.media = [asset('A')]; return new Response(null, { status: 204 });
  } }); await value.settle();
  const pending = deferred(), fetchCurrent = globalThis.fetch; let mediaReads = 0;
  globalThis.fetch = (url, init) => {
    if (url === '/api/library-items' && !init?.method) return Promise.resolve(Response.json(value.snapshot.libraryItems));
    if (url === '/api/media' && !init?.method && ++mediaReads === 1) return pending.promise;
    return fetchCurrent(url, init);
  };
  const refreshing = value.props().onSharedCopied([{ ...item('copied'), mediaIds: ['B'] }]);
  await value.navigate('media'); const mediaLibrary = value.app.find('MediaLibrary');
  mediaLibrary.props.remove(mediaLibrary.props.media.find(media => media.id === 'B')); await value.settle();
  find(value.app.tree, node => node.type?.name === 'AlertDialogAction').props.onClick(); await value.settle();
  await value.navigate('content'); assert.deepEqual(value.props().media.map(media => media.id), ['A']);
  pending.resolve(Response.json([asset('A'), asset('B')])); await refreshing; await value.settle();
  assert.deepEqual(value.props().media.map(media => media.id), ['A']);
  assert.deepEqual(value.props().items[0].mediaIds, []);
});

test('shared-copy refresh retains a later upload while loading the authoritative copied media', async () => {
  const value = fixture({ items: [], media: [asset('A')], mutation: request => {
    assert.equal(request.method, 'POST'); assert.equal(request.url, '/api/media');
    value.snapshot.media.push(asset('C')); return Response.json(asset('C'));
  } }); await value.settle();
  const copied = { ...item('copied'), mediaIds: ['B'] };
  value.snapshot.libraryItems = [copied]; value.snapshot.media.push(asset('B'));
  const pending = holdLibraryRefresh(value), refreshing = value.props().onSharedCopied([copied]);
  await value.props().upload([new File(['x'], 'C.png', { type: 'image/png' })]); await value.settle();
  pending.resolve(Response.json([copied])); await refreshing; await value.settle();
  assert.deepEqual(value.props().items, [copied]);
  assert.deepEqual(value.props().media.map(media => media.id).sort(), ['A', 'B', 'C']);
});

test('shared-copy refresh rejects a changed server owner before applying personal records', async () => {
  const value = fixture({ items: [item('private')] }); await value.settle();
  const pending = holdLibraryRefresh(value), redirects = []; window.location.assign = url => redirects.push(url);
  const refreshing = value.props().onSharedCopied([item('copied')]);
  value.snapshot.profile.id = 'other'; pending.resolve(Response.json([item('copied')]));
  await assert.rejects(refreshing, /Кабинет изменился/); await value.settle();
  assert.deepEqual(value.props().items, [item('private')]); assert.deepEqual(redirects, ['/']);
});

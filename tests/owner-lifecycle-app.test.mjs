// CR11 diagnosis on frozen PR17 alone: actual App callbacks/effects/client HTTP.
// Hooks, window, timers, HTTP and storage are modeled; no browser/live proof.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import { fixture, cleanup, storage, asset, deferred, find, text } from './helpers/library-editor-fixture.mjs';
import { blankPost } from '../lib/planner.ts';
import { writeRecovery, editorFields } from '../lib/client/editor-recovery.ts';
import { writePendingCreation } from '../lib/client/pending-creation.ts';
const originalToast = { success: toast.success, error: toast.error };
afterEach(() => { cleanup(); Object.assign(toast, originalToast); });
const editorKey = owner => `planly:editor:v1:${owner}`;
const pendingKey = owner => `planly:pending-create:v1:${owner}`;
const raw = (content, mediaIds = []) => ({ ...blankPost(), text: content, networks: ['telegram'],
  date: '2099-10-06', time: '14:30', mediaIds, overrides: { telegram: `${content} variant` } });
function pending(cache, owner, content, options = {}) {
  const token = crypto.randomUUID();
  writePendingCreation(cache, owner, { version: 1, key: crypto.randomUUID(),
    input: { baseText: content, status: 'DRAFT', targets: [], mediaIds: [] }, editor: editorFields(raw(content)),
    intent: 'draft', editorToken: token, activeEditorToken: token, origin: 'composer', ...options });
  return token;
}
async function openA(options = {}) {
  const value = fixture({ scheduled: true, media: [asset('A')], ...options });
  await value.settle(); await value.navigate('create');
  value.app.composer().setDraft(raw('A private raw', ['A'])); await value.settle();
  return value;
}
async function switchTo(value, owner = 'other') {
  value.snapshot.profile = { id: owner, displayName: owner === 'other' ? 'Owner B' : 'Owner A' };
  value.snapshot.media = [asset(owner === 'other' ? 'B' : 'A')];
  value.snapshot.libraryItems = [];
  await value.poll();
  const visibleMedia = value.app.composer()?.media ?? value.app.find('MediaLibrary')?.props.media ?? value.props()?.media;
  if (visibleMedia) assert.deepEqual(visibleMedia.map(item => item.id), [owner === 'other' ? 'B' : 'A'], 'actual scheduled poll applied destination Media');
  else assert.equal(value.app.find('Settings').props.name, value.snapshot.profile.displayName, 'actual scheduled poll applied destination profile');
}
const retry = value => find(value.app.tree, node => typeof node.props?.onClick === 'function' && text(node) === 'Повторить сохранение');

test('owner B without recovery sees a blank editor, never A raw content', async () => {
  const value = await openA(); await switchTo(value);
  assert.equal(value.app.composer().draft.text, '');
  assert.deepEqual(value.app.composer().draft.mediaIds, []);
});
test('valid owner B recovery takes priority over the active A editor', async () => {
  const cache = storage(); assert.equal(writeRecovery(cache, 'other', raw('B owned recovery', ['B'])), true);
  const value = await openA({ cache }); const aCache = cache.getItem(editorKey('owner'));
  await switchTo(value);
  assert.equal(value.app.composer().draft.text, 'B owned recovery');
  assert.deepEqual(value.app.composer().draft.mediaIds, ['B']);
  assert.equal(cache.getItem(editorKey('owner')), aCache);
});
test('owner transition rotates the actual full Composer descriptor key', async () => {
  const value = await openA(); const key = value.app.find('Composer').key;
  await switchTo(value); assert.notEqual(value.app.find('Composer').key, key);
});
test('poll transition alone preserves A durable recovery at its original key', async () => {
  const value = await openA(); const before = value.cache.getItem(editorKey('owner'));
  await switchTo(value); assert.equal(value.cache.getItem(editorKey('owner')), before);
});
test('new B edits persist only under B and cannot overwrite recovery A', async () => {
  const value = await openA(); const before = value.cache.getItem(editorKey('owner'));
  await switchTo(value); value.app.composer().setDraft(raw('B latest raw', ['B'])); await value.settle();
  assert.equal(value.cache.getItem(editorKey('owner')), before, 'A recovery must not become B raw work');
  assert.equal(JSON.parse(value.cache.getItem(editorKey('other'))).editor.text, 'B latest raw');
});
test('captured A change callback is rejected after the authoritative owner transition', async () => {
  const value = await openA(); const captured = value.app.composer(), aCache = value.cache.getItem(editorKey('owner'));
  await switchTo(value); captured.setDraft(raw('Late A change', ['A'])); await value.settle();
  assert.equal(value.cache.getItem(editorKey('owner')), aCache);
  assert.equal(value.app.composer().draft.text, '');
});
test('pending creation A never becomes the visible pending creation of owner B', async () => {
  const cache = storage(); pending(cache, 'owner', 'Pending A');
  const value = await openA({ cache }); assert.ok(retry(value)); const before = cache.getItem(pendingKey('owner'));
  await switchTo(value); assert.equal(retry(value), null);
  assert.equal(cache.getItem(pendingKey('owner')), before); assert.equal(value.requests.length, 0);
});
test('existing owner B pending state is hydrated on poll without automatic replay', async () => {
  const cache = storage(); pending(cache, 'other', 'Pending B');
  const value = await openA({ cache }); assert.equal(retry(value), null);
  await switchTo(value); assert.ok(retry(value), 'B own pending cache controls B UI');
  assert.equal(value.requests.length, 0);
});
test('B to A restores the durable A editor rather than retaining B work', async () => {
  const value = await openA(); await switchTo(value);
  value.app.composer().setDraft(raw('B raw', ['B'])); await value.settle(); await switchTo(value, 'owner');
  assert.equal(value.app.composer().draft.text, 'A private raw');
  assert.deepEqual(value.app.composer().draft.mediaIds, ['A']);
});
test('owner B does not retain an A media deletion confirmation', async () => {
  const value = await openA(); await value.navigate('media');
  const media = value.app.find('MediaLibrary'); media.props.remove(media.props.media[0]); await value.settle();
  assert.equal(value.app.find('AlertDialog').props.open, true);
  await switchTo(value); assert.equal(value.app.find('AlertDialog').props.open, false);
});
test('Library owner isolation still rejects a captured A form callback', async () => {
  const value = await openA(); await value.navigate('content'); const captured = value.control();
  await switchTo(value); captured.onChange({ title: 'Late A', text: 'Library A', mediaIds: ['A'] }); await value.settle();
  assert.equal(value.control().editor, null); assert.equal(value.cached('other'), null);
});
test('old-owner generic media upload cannot apply its delayed successful lookup to B', async () => {
  const lookup = deferred(); const value = await openA({ mutation: () => Response.json(asset('old-upload')) });
  await value.navigate('media'); const previousFetch = globalThis.fetch; let lookups = 0;
  globalThis.fetch = (url, init) => {
    if (url === '/api/media' && !init) { lookups += 1; return lookup.promise; }
    return previousFetch(url, init);
  };
  const operation = value.app.find('MediaLibrary').props.upload([new File(['x'], 'old-upload.png')]);
  await value.settle(); assert.equal(lookups, 1); await switchTo(value);
  lookup.resolve(Response.json([asset('old-upload')])); await operation; await value.settle();
  assert.deepEqual(value.app.find('MediaLibrary').props.media.map(item => item.id), ['B']);
});
test('old-owner generic media upload emits no completion or error message to B', async () => {
  const lookup = deferred(), messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = await openA({ mutation: () => Response.json(asset('old-upload')) }); await value.navigate('media');
  const previousFetch = globalThis.fetch; let lookups = 0;
  globalThis.fetch = (url, init) => {
    if (url === '/api/media' && !init) { lookups += 1; return lookup.promise; }
    return previousFetch(url, init);
  };
  const operation = value.app.find('MediaLibrary').props.upload([new File(['x'], 'old-upload.png')]);
  await value.settle(); assert.equal(lookups, 1); await switchTo(value); messages.length = 0;
  lookup.resolve(Response.json([asset('old-upload')])); await operation; await value.settle();
  assert.deepEqual(messages, []);
});

test('Library A durable work stays isolated across A to B to A', async () => {
  const value = await openA(); await value.navigate('content'); await value.open();
  await value.change('library-text', 'Library A raw'); const savedA = value.cached('owner');
  await switchTo(value); assert.equal(value.control().editor, null); await value.open();
  await value.change('library-text', 'Library B raw'); assert.deepEqual(value.cached('owner'), savedA);
  assert.equal(value.cached('other').editor.text, 'Library B raw'); await switchTo(value, 'owner');
  assert.equal(value.control().editor.text, 'Library A raw');
});
for (const outcome of ['success', 'error']) {
  test(`late A profile ${outcome} cannot change B visible profile or notify B`, async () => {
    const response = deferred(), messages = [];
    for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
    const value = await openA({ mutation: request => {
      assert.equal(request.url, '/api/profile'); assert.equal(request.method, 'PATCH'); return response.promise;
    } }); await value.navigate('settings');
    value.app.find('Settings').props.saveName('A changed'); await value.settle();
    assert.equal(value.requests.length, 1); await switchTo(value); messages.length = 0;
    response.resolve(outcome === 'success' ? Response.json({ id: 'owner', displayName: 'A changed' })
      : Response.json({ error: 'A update rejected' }, { status: 409 })); await value.settle();
    assert.equal(value.app.find('Settings').props.name, 'Owner B'); assert.deepEqual(messages, []);
  });
}
test('captured A submit cannot dispatch old raw content after the B owner transition', async () => {
  const value = await openA({ mutation: () => { throw Error('unexpected dispatch'); } });
  const captured = value.app.composer(); await switchTo(value); await captured.save(captured.draft, 'draft'); await value.settle();
  assert.equal(value.requests.length, 0, 'stale A callback must reject before any request or durable creation write');
  assert.equal(value.cache.getItem(pendingKey('owner')), null); assert.equal(value.cache.getItem(pendingKey('other')), null);
});

// These catch ID-only guards, missing admission checks and changed bootstrap precedence.
test('first A change remains stale after A to B to A, including a restored pending token', async () => {
  const cache = storage(); pending(cache, 'owner', 'Pending A');
  const value = await openA({ cache }); const captured = value.app.composer();
  await switchTo(value); await switchTo(value, 'owner');
  const preserved = cache.getItem(editorKey('owner'));
  captured.setDraft(raw('First A zombie', ['A'])); await value.settle();
  assert.equal(value.app.composer().draft.text, 'A private raw');
  assert.equal(cache.getItem(editorKey('owner')), preserved);
});
test('first A save remains stale after A to B to A', async () => {
  const value = await openA({ mutation: () => { throw Error('unexpected dispatch'); } });
  const captured = value.app.composer(); await switchTo(value); await switchTo(value, 'owner');
  await captured.save(captured.draft, 'draft'); await value.settle();
  assert.equal(value.requests.length, 0);
});
test('captured A publish rejects before network or validation messages in B', async () => {
  const messages = []; for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = await openA({ mutation: () => { throw Error('unexpected dispatch'); } });
  value.snapshot.socialAccounts = [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }];
  await value.poll(); const captured = value.app.composer(); await switchTo(value); messages.length = 0;
  await captured.publishNow(captured.draft); await value.settle();
  assert.equal(value.requests.length, 0); assert.deepEqual(messages, []);
});
test('first A publish remains stale after A to B to A', async () => {
  const value = await openA({ mutation: () => { throw Error('unexpected dispatch'); } });
  value.snapshot.socialAccounts = [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }];
  await value.poll(); const captured = value.app.composer(); await switchTo(value); await switchTo(value, 'owner');
  await captured.publishNow(captured.draft); await value.settle(); assert.equal(value.requests.length, 0);
});
test('actual captured A retry button cannot replay pending A after B transition', async () => {
  const cache = storage(); pending(cache, 'owner', 'Pending A'); pending(cache, 'other', 'Pending B');
  const value = await openA({ cache, mutation: () => { throw Error('unexpected retry'); } });
  const captured = retry(value), a = cache.getItem(pendingKey('owner')), b = cache.getItem(pendingKey('other'));
  await switchTo(value); captured.props.onClick(); await value.settle();
  assert.equal(value.requests.length, 0); assert.equal(cache.getItem(pendingKey('owner')), a); assert.equal(cache.getItem(pendingKey('other')), b);
});
test('B recovery and pending coexist using bootstrap recovery precedence', async () => {
  const cache = storage(); writeRecovery(cache, 'other', raw('B recovery first', ['B'])); pending(cache, 'other', 'B pending editor');
  const value = await openA({ cache }); await switchTo(value);
  assert.equal(value.app.composer().draft.text, 'B recovery first'); assert.ok(retry(value)); assert.equal(value.requests.length, 0);
});
test('B matching Composer pending fills absent B recovery without dispatch', async () => {
  const cache = storage(); pending(cache, 'other', 'B pending editor');
  const value = await openA({ cache }); await switchTo(value);
  assert.equal(value.app.composer().draft.text, 'B pending editor'); assert.ok(retry(value)); assert.equal(value.requests.length, 0);
});
test('B swipe pending blocks creation without replacing blank Composer', async () => {
  const cache = storage(); pending(cache, 'other', 'Swipe B', { origin: 'swipe-planner' });
  const value = await openA({ cache }); await switchTo(value);
  assert.equal(value.app.composer().draft.text, ''); assert.ok(retry(value)); assert.equal(value.requests.length, 0);
});
for (const matches of [true, false]) {
  test(`B acknowledged pending ID follows bootstrap token rules: match=${matches}`, async () => {
    const cache = storage(); writeRecovery(cache, 'other', raw('B recovery', ['B']));
    pending(cache, 'other', 'Pending B', { acknowledgedId: 'ack-B', ...(matches ? {} : { editorToken: crypto.randomUUID() }) });
    const value = await openA({ cache }); await switchTo(value);
    assert.equal(value.app.composer().draft.text, 'B recovery');
    assert.equal(value.app.composer().draft.id, matches ? 'ack-B' : ''); assert.ok(retry(value)); assert.equal(value.requests.length, 0);
  });
}
test('B corrupt recovery never falls back to A raw or deletes A recovery', async () => {
  const cache = storage(); cache.setItem(editorKey('other'), '{broken'); const value = await openA({ cache });
  const a = cache.getItem(editorKey('owner')); await switchTo(value);
  assert.equal(value.app.composer().draft.text, ''); assert.deepEqual(value.app.composer().draft.mediaIds, []);
  assert.equal(cache.getItem(editorKey('owner')), a); assert.equal(value.requests.length, 0);
});
test('B unreadable storage removes A raw and blocks fresh creation without fallback', async () => {
  const cache = storage(); const value = await openA({ cache, mutation: () => { throw Error('unexpected dispatch'); } });
  const a = cache.values.get(editorKey('owner')); cache.failRead = true; await switchTo(value);
  assert.equal(value.app.composer().draft.text, ''); assert.deepEqual(value.app.composer().draft.mediaIds, []);
  assert.ok(retry(value)); await value.app.composer().save(raw('B new'), 'draft'); await value.settle();
  assert.equal(value.requests.length, 0); assert.equal(cache.values.get(editorKey('owner')), a);
});
test('B corrupt pending remains blocked and never automatically dispatches', async () => {
  const cache = storage(); cache.setItem(pendingKey('other'), '{broken'); const value = await openA({ cache });
  await switchTo(value); assert.ok(retry(value)); assert.equal(value.requests.length, 0);
});
test('same-owner poll preserves raw editor, durable cache and actual Composer identity', async () => {
  const value = await openA(), captured = value.app.composer(), key = value.app.find('Composer').key;
  const a = value.cache.getItem(editorKey('owner')); await value.poll();
  assert.deepEqual(value.app.composer().draft, captured.draft); assert.equal(value.app.find('Composer').key, key);
  assert.equal(value.cache.getItem(editorKey('owner')), a);
});
test('late failed A upload is quiet in B and never dispatches a second A file', async () => {
  const lookup = deferred(), messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = await openA({ mutation: () => Response.json(asset('upload')) }); await value.navigate('media');
  const previousFetch = globalThis.fetch; let lookups = 0;
  globalThis.fetch = (url, init) => { if (url === '/api/media' && !init) { lookups += 1; return lookup.promise; } return previousFetch(url, init); };
  const operation = value.app.find('MediaLibrary').props.upload([new File(['x'], 'one.png'), new File(['x'], 'two.png')]);
  await value.settle(); assert.equal(lookups, 1); await switchTo(value); messages.length = 0;
  lookup.resolve(Response.json({ error: 'A lookup failed' }, { status: 500 })); await operation; await value.settle();
  assert.deepEqual(messages, []); assert.equal(value.requests.length, 1);
  assert.deepEqual(value.app.find('MediaLibrary').props.media.map(item => item.id), ['B']);
});
for (const success of [true, false]) {
  test(`same-owner generic upload preserves its ${success ? 'success' : 'error'} notification`, async () => {
    const messages = []; for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
    const value = await openA({ mutation: () => success ? Response.json(asset('upload')) : Response.json({ error: 'Rejected' }, { status: 409 }) });
    await value.navigate('media'); if (success) value.snapshot.media.push(asset('upload')); messages.length = 0;
    await value.app.find('MediaLibrary').props.upload([new File(['x'], 'upload.png')]); await value.settle();
    assert.equal(messages.length, 1); assert.equal(messages[0].kind, success ? 'success' : 'error');
  });
}
test('upload acknowledgement after App unmount emits no message or recovery write', async () => {
  const lookup = deferred(), messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = await openA({ mutation: () => Response.json(asset('upload')) }); await value.navigate('media');
  const previousFetch = globalThis.fetch; let lookups = 0;
  globalThis.fetch = (url, init) => { if (url === '/api/media' && !init) { lookups += 1; return lookup.promise; } return previousFetch(url, init); };
  const before = [...value.cache.values], operation = value.app.find('MediaLibrary').props.upload([new File(['x'], 'upload.png')]);
  await value.settle(); assert.equal(lookups, 1); value.unmount(); messages.length = 0;
  lookup.resolve(Response.json([asset('upload')])); await operation;
  assert.deepEqual(messages, []); assert.deepEqual([...value.cache.values], before);
});
test('profile acknowledgement after App unmount emits no success message', async () => {
  const response = deferred(), messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = await openA({ mutation: () => response.promise }); await value.navigate('settings');
  value.app.find('Settings').props.saveName('A changed'); await value.settle(); assert.equal(value.requests.length, 1);
  value.unmount(); messages.length = 0; response.resolve(Response.json({ id: 'owner', displayName: 'A changed' }));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(messages, []);
});

test('owner B recovery restores B publish mode during an owner transition', async () => {
  const cache = storage();
  assert.equal(writeRecovery(cache, 'other', raw('B scheduled recovery', ['B']), { publishMode: 'scheduled' }), true);
  const value = await openA({ cache }); await switchTo(value);
  assert.equal(value.app.composer().publishMode, 'scheduled');
});
test('captured A publish mode callback cannot mutate owner B editor intent', async () => {
  const value = await openA(); const captured = value.app.composer();
  assert.equal(captured.publishMode, 'now'); await switchTo(value);
  assert.equal(value.app.composer().publishMode, 'now');
  captured.onPublishModeChange('scheduled'); await value.settle();
  assert.equal(value.app.composer().publishMode, 'now');
});

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import { fixture, cleanup, asset, deferred } from './helpers/library-editor-fixture.mjs';

const originalToast = { success: toast.success, error: toast.error };
afterEach(() => { cleanup(); Object.assign(toast, originalToast); });

async function race() {
  const lookup = deferred(), messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = fixture({ scheduled: true, mutation: () => Response.json(asset('old-upload')) });
  await value.settle(); await value.navigate('dashboard');
  value.app.composer().setDraft(current => ({ ...current, text: 'old raw work', networks: ['telegram'] }));
  await value.settle();
  const beforeCache = value.cache.getItem('planly:editor:v1:owner');
  const currentFetch = globalThis.fetch; let lookups = 0;
  globalThis.fetch = (url, init) => {
    if (url === '/api/media' && !init) { lookups += 1; return lookup.promise; }
    return currentFetch(url, init);
  };
  const uploading = value.app.composer().uploadControl.addFiles([new File(['x'], 'old-upload.png')]);
  await value.settle(); assert.equal(lookups, 1, 'actual old-owner POST acknowledgement has begun GET lookup');
  assert.equal(value.app.composer().uploadControl.busy, true);
  value.snapshot.profile = { id: 'other', displayName: 'Other owner' };
  value.snapshot.media = [asset('other-media')];
  await value.poll();
  assert.deepEqual(value.app.composer().media.map(item => item.id), ['other-media'], 'real scheduled poll applies other-owner Media');
  messages.length = 0;
  lookup.resolve(Response.json([asset('old-upload')]));
  await uploading; await value.settle();
  assert.equal(value.requests.filter(request => request.url === '/api/media').length, 1);
  return { value, beforeCache, messages };
}

test('CR11 owner-poll rejects old Composer asset acknowledgement', async () => {
  const { value } = await race();
  assert.deepEqual(value.app.composer().media.map(item => item.id), ['other-media']);
});
test('CR11 owner-poll rejects old Composer attachment and recovery write', async () => {
  const { value, beforeCache } = await race();
  assert.equal(value.cache.getItem('planly:editor:v1:owner'), beforeCache);
  assert.deepEqual(value.app.composer().draft.mediaIds, []);
});
test('CR11 owner-poll rejects old Composer completion message', async () => {
  const { messages } = await race();
  assert.deepEqual(messages, []);
});

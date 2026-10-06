// Supplement the unchanged frozen owner-poll probes with current-owner control.
// Missing canNotify on the real App success branch must fail this assertion.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import { fixture, cleanup, asset } from './helpers/library-editor-fixture.mjs';
const originalToast = { success: toast.success, error: toast.error };
afterEach(() => { cleanup(); Object.assign(toast, originalToast); });

test('current owner receives completion after controlled Composer upload attaches media', async () => {
  const messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  const value = fixture({ mutation: () => Response.json(asset('current-upload')) });
  await value.settle(); await value.navigate('dashboard');
  value.snapshot.media = [asset('current-upload')];
  await value.app.composer().uploadControl.addFiles([new File(['x'], 'current-upload.png')]);
  await value.settle();
  assert.deepEqual(value.app.composer().draft.mediaIds, ['current-upload']);
  assert.equal(value.app.composer().uploadControl.busy, false);
  assert.equal(messages.filter(value => value.kind === 'success').length, 1,
    'current owner receives the existing PR18 completion notification');
  assert.deepEqual(messages.filter(value => value.kind === 'error'), []);
});

# CR09 / frozen PR17 owner-poll compatibility blocker

STATUS: STOP_SPLIT; PR18 remains DRAFT. Supporting isolated integration evidence, not a production or release build.

Source tuple: base95f53b7d18e656e0f8ceff5002b4c42af3d12251; PR18 runtime5475414f01e03d4be6294e0a77901c773c6cfb20; frozen PR14d0565436a17b32c731736923a8fa0ddf15544b5d + PR16ac4f66328014d9b820e2e4dfaaaa4e1e5d078453 + PR1789111873a6cda4ecceba545102911706eafc386c. Detached integration worktree holds uncommitted staged patches; no frozen/release branch commits or pushes. Shared Composer resolution retains PR14 pending counter/CR09 control/PR16 publishMode; shared App retains both controls. Upload retains third canNotify plus PR17 mediaRevision and canApply-only message suppression. No owner mitigation introduced. Integration patch SHA256B7F1712124817BFBB31CA06D9029C7BDD57A30C9255593EC5B367ACA2F825536.

Actual trace: old-owner Composer uploadControl.addFiles -> App batch captures owner/token/generation -> actual client media POST succeeds -> GET lookup deferred -> actual scheduled App poll receives other profile/media -> PR17 bindLibraryOwner changes Library owner/context and visible Media but does not bind Composer owner/generation/recoveryOwner -> deferred old GET resolves -> isCurrentComposerOwner still true -> stale asset appended globally; parent attachment/recovery and token-scoped success accepted.

FIRST_BROKEN_LAYER: App scheduled poll ownerChanged updates Library/data owner without rebinding Composer identity. Main95f53b7 has no profile-owner polling flow; this path is introduced only by frozen PR17. Bootstrap/new-App/unmount guards PASS in independent PR18, but do not cover this surviving-App owner replacement.

Ordinary combined compatibility:20 files245/245PASS/0FAIL/0SKIP, no-incremental typecheckPASS and diff checks clean. Separate adversarial three independent reached RED assertions:3tests/0PASS/3FAIL/0skip, all ERR_ASSERTION:

- Global Media expected [other-media], actual [other-media, old-upload].
- planly:editor:v1:owner snapshot changed from mediaIds[] to [old-upload]. Recovery assertion reached independently before draft assertion.
- Messages expected [], actual success "Добавлено файлов: 1".

Preconditions assert actual POST->GET lookup started, current batch busy, scheduled poll applied other-media, and exactly one media POST. GET intentionally succeeds; missing lookup cannot falsely prove rejection. Harness models hooks/timer/HTTP/storage, no private hook slot or invented editor identity. Logs preserved in ignored cr09-owner-poll-red.log and cr09-frozen-compatibility.log.

Decision options:

A. Approve bounded Composer owner lifecycle integration in App: authoritative profile binding for bootstrap/poll, invalidate old generation/callbacks before new-owner data application, explicitly define old raw-work/recovery versus new-owner editor behavior. Regression must cover actual polling; frozen PR17 untouched.
B. Separate owner-lifecycle task/PR with its own contract; leave PR18 DRAFT until dependent integration satisfies required compatibility.
C. Waive owner-poll case and release current candidate. Not recommended: violates approved owner/generation continuation guard.

Recommendation: A only with explicit raw-editor/cache ownership rule; otherwise B. No speculative owner rebind/reset implemented.

Reproduction: construct the isolated tuple above, save the following exact probe as .superpowers/customer-ready/cr09-owner-poll.test.mjs, run node --test --test-concurrency=1 --experimental-strip-types .superpowers/customer-ready/cr09-owner-poll.test.mjs. It imports the frozen PR17 fixture. The independent PR18 tree lacks that future polling route and fixture.

```javascript
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import { fixture, cleanup, asset, deferred } from '../../tests/helpers/library-editor-fixture.mjs';
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
test('PR17 owner-poll replacement must reject old Composer asset acknowledgement', async () => {
  const { value } = await race();
  assert.deepEqual(value.app.composer().media.map(item => item.id), ['other-media']);
});
test('PR17 owner-poll replacement must reject old Composer attachment and recovery write', async () => {
  const { value, beforeCache } = await race();
  assert.equal(value.cache.getItem('planly:editor:v1:owner'), beforeCache);
  assert.deepEqual(value.app.composer().draft.mediaIds, []);
});
test('PR17 owner-poll replacement must reject old Composer completion message', async () => {
  const { messages } = await race();
  assert.deepEqual(messages, []);
});

```

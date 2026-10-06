// CR-10 actual mode-toggle -> parent/recovery -> reload contract.
// Non-DOM lifecycle evidence, not browser or production acceptance.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { blankPost, day, fromServerPost } from '../lib/planner.ts';
import { writeRecovery } from '../lib/client/editor-recovery.ts';
import { mountEditor as mount, cleanupEditors, memoryStorage } from './helpers/editor-mode-fixture.mjs';
afterEach(cleanupEditors);

test('scheduled tab selection survives actual app reload without changing lifecycle or sending POST', async () => {
  const first = mount(); await first.settle();
  assert.equal(first.mode().props.value, 'now');
  first.app.composer().setDraft(current => ({ ...current, text: 'Unsaved work', date: day(2), time: '18:00' }));
  await first.settle();
  first.mode().props.onValueChange('scheduled'); await first.settle();
  assert.equal(first.mode().props.value, 'scheduled');
  assert.equal(first.app.composer().draft.status, 'draft', 'UI choice is not persisted Post lifecycle');
  first.unmount();
  const reload = mount({ cache: first.cache }); await reload.settle();
  assert.equal(first.requests.length + reload.requests.length, 0);
  assert.equal(reload.mode().props.value, 'scheduled', 'chosen UI mode must survive reload');
  assert.equal(reload.hasSchedule(), true);
  assert.equal(reload.app.composer().draft.date, day(2));
  assert.equal(reload.app.composer().draft.time, '18:00');
  assert.equal(reload.app.composer().draft.status, 'draft');
  assert.equal(first.requests.length + reload.requests.length, 0);
});

test('mode-only choice without content survives navigation and reload without becoming dirty content', async () => {
  const value = mount(); await value.settle();
  value.mode().props.onValueChange('scheduled'); await value.settle();
  await value.navigate('content'); await value.navigate('create');
  assert.equal(value.mode().props.value, 'scheduled');
  assert.equal(value.app.composer().draft.text, '');
  value.unmount(); const reload = mount({ cache: value.cache }); await reload.settle();
  assert.equal(reload.mode().props.value, 'scheduled');
  let confirmations = 0; window.confirm = () => { confirmations++; return false; };
  await reload.navigate('content'); reload.app.find('Content').props.create(); await reload.settle(); reload.remountComposer();
  assert.equal(confirmations, 0, 'mode-only selection does not expand content-based replacement policy');
  assert.equal(reload.mode().props.value, 'now');
  assert.equal(value.requests.length + reload.requests.length, 0);
});

for (const entry of ['generic', 'Library', 'media', 'copy']) test(`${entry} replacement initializes its own Now intent`, async () => {
  const item = { id: 'library', text: 'Library work', status: 'READY', mediaIds: [], updatedAt: new Date(0).toISOString() };
  const value = mount({ libraryItems: [item] }); await value.settle();
  value.mode().props.onValueChange('scheduled'); await value.settle();
  if (entry === 'copy') value.app.composer().duplicatePost(value.app.composer().draft);
  else {
    await value.navigate(entry === 'media' ? 'media' : 'content');
    if (entry === 'generic') value.app.find('Content').props.create();
    if (entry === 'Library') value.app.find('ContentLibrary').props.createPublication(item);
    if (entry === 'media') value.app.find('MediaLibrary').props.useMedia({ id: 'A' });
  }
  await value.settle(); value.remountComposer();
  assert.equal(value.mode().props.value, 'now'); assert.equal(value.app.composer().draft.status, 'draft');
  assert.equal(value.requests.length, 0);
});

test('declined dirty replacement retains original content and intent after remount', async () => {
  const value = mount(); await value.settle();
  value.app.composer().setDraft(current => ({ ...current, text: 'Original local work' })); await value.settle();
  value.mode().props.onValueChange('scheduled'); await value.settle();
  await value.navigate('content'); let confirmations = 0;
  window.confirm = () => { confirmations++; return false; };
  value.app.find('Content').props.create(); await value.settle();
  await value.navigate('create');
  assert.equal(confirmations, 1); assert.equal(value.app.composer().draft.text, 'Original local work');
  assert.equal(value.mode().props.value, 'scheduled'); assert.equal(value.requests.length, 0);
});

test('same-editor explicit UI survives missing Post/media fallback without resurrecting lifecycle', async () => {
  const cache = memoryStorage();
  writeRecovery(cache, 'owner', { ...blankPost(), id: 'deleted-post', text: 'Recovered work', mediaIds: ['deleted-media'] }, { publishMode: 'scheduled' });
  const value = mount({ cache }); await value.settle();
  assert.equal(value.app.composer().draft.id, ''); assert.equal(value.app.composer().draft.status, 'draft');
  assert.deepEqual(value.app.composer().draft.mediaIds, []);
  assert.equal(value.app.composer().draft.text, 'Recovered work');
  assert.equal(value.mode().props.value, 'scheduled'); assert.equal(value.requests.length, 0);
});

test('generic new editor and ordinary recovered draft remain Now despite default date/time', async () => {
  const first = mount(); await first.settle();
  assert.equal(first.mode().props.value, 'now');
  first.app.composer().setDraft(current => ({ ...current, text: 'Draft work' })); await first.settle();
  first.unmount();
  const reload = mount({ cache: first.cache }); await reload.settle();
  assert.equal(reload.mode().props.value, 'now');
  assert.equal(reload.hasSchedule(), false);
  assert.equal(reload.app.composer().draft.text, 'Draft work');
  assert.equal(first.requests.length + reload.requests.length, 0);
});

test('Now selection on a server-scheduled post survives reload while server lifecycle stays scheduled', async () => {
  const post = { id: 'scheduled-post', title: null, baseText: 'Scheduled server content', status: 'READY', mediaIds: [],
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    targets: [{ id: 'tg', socialAccountId: 'tg', provider: 'telegram', textOverride: null, scheduledAt: '2099-10-04T15:00:00Z',
      publication: { status: 'PENDING', remoteId: null, remoteUrl: null, error: null } }] };
  const cache = memoryStorage();
  assert.equal(writeRecovery(cache, 'owner', fromServerPost(post)), true);
  const first = mount({ cache, posts: [post] }); await first.settle();
  assert.equal(first.mode().props.value, 'scheduled');
  first.mode().props.onValueChange('now'); await first.settle();
  assert.equal(first.mode().props.value, 'now');
  assert.equal(first.app.composer().draft.status, 'scheduled');
  first.unmount();
  const reload = mount({ cache, posts: [post] }); await reload.settle();
  assert.equal(first.requests.length + reload.requests.length, 0);
  assert.equal(reload.mode().props.value, 'now', 'UI choice must override lifecycle-derived initial mode');
  assert.equal(reload.hasSchedule(), false);
  assert.equal(reload.app.composer().draft.status, 'scheduled', 'current server lifecycle remains authoritative');
  assert.equal(first.requests.length + reload.requests.length, 0);
});

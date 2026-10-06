import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { blankPost, day, fromServerPost } from '../lib/planner.ts';
import { editorFields, editorKey, readRecovery, writeRecovery } from '../lib/client/editor-recovery.ts';
import { pendingCreationKey, readPendingCreation, writePendingCreation } from '../lib/client/pending-creation.ts';
import { cleanupEditors, mountEditor, memoryStorage, findAll } from './helpers/editor-mode-fixture.mjs';
afterEach(cleanupEditors);
const token = 'bec6f2d4-9ee5-44c2-9c9f-e7b347ac19e3', key = '6ef09690-e21c-4073-a579-87215f49b8df';
const input = { baseText: 'Pending work', status: 'DRAFT', targets: [], mediaIds: [] };
function saved(request) { return { id: 'ack', title: null, baseText: request.body.baseText, status: request.body.status,
  mediaIds: request.body.mediaIds, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  targets: request.body.targets.map((target, index) => ({ ...target, id: `target${index}`, socialAccountId: 'tg', publication: null })) }; }
function text(node) { if (typeof node === 'string') return node; if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children; return (Array.isArray(children) ? children : [children]).map(text).join(''); }
async function prepare(value) { await value.settle(); value.app.composer().setDraft(current => ({ ...current, text: 'Submitted work', date: day(2) })); await value.settle(); }
function pending(ui, overrides = {}) { return { version: 1, key, input, editor: editorFields({ ...blankPost(), text: input.baseText }),
  editorToken: token, activeEditorToken: token, intent: 'draft', ...(ui ? { editorUi: ui } : {}), ...overrides }; }

test('mode-only change during Draft save is a newer revision and survives acknowledgement', async () => {
  let finish;
  const value = mountEditor({ mutation: request => new Promise(resolve => { finish = () => resolve(Response.json(saved(request))); }) });
  await prepare(value); const saving = value.app.composer().save(value.app.composer().draft, 'draft'); await value.settle();
  assert.equal(value.requests.length, 1); assert.equal(value.requests[0].body.status, 'DRAFT');
  assert.ok(value.requests[0].body.targets.every(target => target.scheduledAt === null));
  value.mode().props.onValueChange('scheduled'); await value.settle();
  assert.equal(value.requests.length, 1, 'tab selection cannot submit');
  finish(); await saving; await value.navigate('create');
  assert.equal(value.app.composer().draft.id, 'ack'); assert.equal(value.app.composer().draft.text, 'Submitted work');
  assert.equal(value.mode().props.value, 'scheduled');
  assert.deepEqual(readRecovery(value.cache, 'owner').ui, { publishMode: 'scheduled' });
});

test('unchanged Draft save from Scheduled tab clears its own pair and resets next editor Now', async () => {
  const value = mountEditor({ mutation: request => Response.json(saved(request)) }); await prepare(value);
  value.mode().props.onValueChange('scheduled'); await value.settle();
  await value.app.composer().save(value.app.composer().draft, 'draft'); await value.navigate('create');
  assert.equal(value.requests[0].body.status, 'DRAFT'); assert.ok(value.requests[0].body.targets.every(target => target.scheduledAt === null));
  assert.equal(value.app.composer().draft.text, ''); assert.equal(value.mode().props.value, 'now');
  assert.equal(readPendingCreation(value.cache, 'owner'), null);
});

for (const changeContent of [false, true]) test(`failed paired write after acknowledged ID keeps pending (${changeContent ? 'content+UI' : 'UI-only'})`, async () => {
  const cache = memoryStorage(); let blockRemoval = true, blockWrites = false, finish;
  const originalSet = cache.setItem, originalRemove = cache.removeItem;
  cache.setItem = (name, raw) => { if (name === editorKey('owner') && blockWrites) throw Error('Quota'); originalSet(name, raw); };
  cache.removeItem = name => { if (blockRemoval) throw Error('Removal blocked'); originalRemove(name); };
  const value = mountEditor({ cache, mutation: (request, count) => count === 1 ? Response.json(saved(request))
    : new Promise(resolve => { finish = () => resolve(Response.json(saved(request))); }) });
  await prepare(value); await value.app.composer().save(value.app.composer().draft, 'draft'); await value.settle();
  assert.equal(value.app.composer().draft.id, 'ack'); assert.ok(readPendingCreation(cache, 'owner'));
  const originalKey = readPendingCreation(cache, 'owner').key;
  const retry = value.app.composer().save(value.app.composer().draft, 'draft'); await value.settle();
  blockRemoval = false; blockWrites = true;
  value.mode().props.onValueChange('scheduled'); await value.settle();
  if (changeContent) { value.app.composer().setDraft(current => ({ ...current, text: 'Newer failed write' })); await value.settle(); }
  finish(); await retry; await value.settle();
  assert.ok(readPendingCreation(cache, 'owner'), 'ID alone cannot prove current content/UI durable');
  assert.equal(readPendingCreation(cache, 'owner').key, originalKey);
  assert.equal(value.mode().props.value, 'scheduled');
  assert.equal(value.requests.length, 2); assert.equal(value.requests[1].key, value.requests[0].key);
  if (!changeContent) {
    blockWrites = false;
    const recoveredRetry = value.app.composer().save(value.app.composer().draft, 'draft'); await value.settle();
    value.mode().props.onValueChange('now');
    value.mode().props.onValueChange('scheduled'); await value.settle();
    finish(); await recoveredRetry; await value.settle();
    assert.equal(value.requests.length, 3); assert.deepEqual(value.requests[2], value.requests[0]);
    assert.equal(readPendingCreation(cache, 'owner'), null);
    assert.equal(value.app.composer().draft.text, 'Submitted work');
    assert.deepEqual(readRecovery(cache, 'owner').ui, { publishMode: 'scheduled' });
  }
});

test('lost publish-now response reload then mode-only change replays global retry with original key/body/time and no PATCH', async () => {
  const cache = memoryStorage(); const requests = [];
  const mutation = request => { requests.push(request); if (requests.length === 1) throw Error('Lost response'); return Response.json(saved(request)); };
  const first = mountEditor({ cache, mutation }); await prepare(first);
  await first.app.composer().publishNow(first.app.composer().draft); await first.settle(); first.unmount();
  const reload = mountEditor({ cache, mutation }); await reload.settle();
  reload.mode().props.onValueChange('scheduled'); await reload.settle();
  assert.equal(requests.length, 1);
  const button = findAll(reload.app.tree, node => node.type?.name === 'Button' && text(node) === 'Повторить сохранение')[0];
  assert.ok(button); button.props.onClick(); await reload.settle();
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[1].method, 'POST'); assert.ok(requests[1].body.targets[0].scheduledAt);
});

for (const variant of ['fallback', 'cache-wins', 'wrong-token', 'swipe', 'malformed']) test(`pending hydration ${variant} retains proper UI/identity without sending`, async () => {
  const cache = memoryStorage();
  const record = pending({ publishMode: 'scheduled' });
  if (variant === 'cache-wins') writeRecovery(cache, 'owner', { ...blankPost(), text: 'Newer cached work' }, { publishMode: 'now' });
  if (variant === 'wrong-token') record.activeEditorToken = 'cf7ed0d2-cefb-4852-9bff-fc17a796657f';
  if (variant === 'swipe') record.origin = 'swipe-planner';
  if (variant === 'malformed') { record.editorUi = { publishMode: 'later' }; cache.setItem(pendingCreationKey('owner'), JSON.stringify(record)); }
  else writePendingCreation(cache, 'owner', record);
  const value = mountEditor({ cache }); await value.settle();
  assert.equal(value.requests.length, 0); assert.equal(readPendingCreation(cache, 'owner').key, key);
  assert.equal(value.mode().props.value, variant === 'fallback' ? 'scheduled' : 'now');
  assert.equal(value.app.composer().draft.text, variant === 'cache-wins' ? 'Newer cached work'
    : variant === 'wrong-token' || variant === 'swipe' ? '' : 'Pending work');
});

test('Scheduled action retains future-time validation; mode changes never mutate server', async () => {
  const value = mountEditor(); await prepare(value);
  value.app.composer().setDraft(current => ({ ...current, date: day(-1), time: '00:00' })); await value.settle();
  value.mode().props.onValueChange('scheduled'); await value.settle();
  const action = findAll(value.composer.tree, node => node.type?.name === 'Action' && text(node) === 'Запланировать')[0];
  assert.ok(action); action.props.onClick(); await value.settle(); assert.equal(value.requests.length, 0);
});

test('rapid Scheduled Now Scheduled callbacks during acknowledgement retain final choice', async () => {
  let finish;
  const value = mountEditor({ mutation: request => new Promise(resolve => { finish = () => resolve(Response.json(saved(request))); }) });
  await prepare(value);
  const saving = value.app.composer().save(value.app.composer().draft, 'draft'); await value.settle();
  const change = value.mode().props.onValueChange;
  change('scheduled'); change('now'); change('scheduled');
  finish(); await saving; await value.navigate('create');
  assert.equal(value.requests.length, 1); assert.equal(value.mode().props.value, 'scheduled');
  assert.equal(value.app.composer().draft.id, 'ack');
  assert.deepEqual(readRecovery(value.cache, 'owner').ui, { publishMode: 'scheduled' });
});

test('restored UI intent cannot unlock a server read-only post or expose submission actions', async () => {
  const reason = 'Original is published; create a copy.';
  const original = { ...saved({ body: input }), id: 'published', status: 'READY', editBlockedReason: reason,
    targets: [{ id: 'tg', provider: 'telegram', socialAccountId: 'tg', textOverride: null, scheduledAt: null,
      publication: { status: 'PUBLISHED', remoteId: 'remote', remoteUrl: null, error: null } }] };
  const cache = memoryStorage();
  writeRecovery(cache, 'owner', fromServerPost(original), { publishMode: 'scheduled' });
  const value = mountEditor({ cache, posts: [original] }); await value.settle();
  assert.equal(value.app.composer().publishMode, 'scheduled');
  assert.equal(value.app.composer().draft.status, 'published');
  assert.equal(value.app.composer().editBlockedReason, reason);
  assert.equal(findAll(value.composer.tree, node => node.props?.className === 'readonly-composer').length, 1);
  assert.equal(value.mode(), undefined);
  assert.equal(findAll(value.composer.tree, node => node.type?.name === 'Action' && /Сохранить|Запланировать|Опубликовать/.test(text(node))).length, 0);
  await value.app.composer().save(value.app.composer().draft, 'draft');
  await value.app.composer().publishNow(value.app.composer().draft); await value.settle();
  assert.equal(value.requests.length, 0); assert.deepEqual(readRecovery(cache, 'owner').ui, { publishMode: 'scheduled' });
});

// Actual Composer callbacks with the existing non-DOM hook harness.
// Deterministic lifecycle evidence; browser/production acceptance is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/post-edit-ui-loader.mjs', import.meta.url);
const { Composer } = await import('../components/planner/composer.tsx');
const { blankPost, day } = await import('../lib/planner.ts');

function findAll(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) findAll(child, predicate, result);
  return result;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function text(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join('');
}
function editor({ quick = false, scheduled = false, saving = false, accounts = { telegram: true, max: true } } = {}) {
  let draft = { ...blankPost(), text: 'Ready to publish', networks: ['telegram'], mediaIds: ['existing'],
    date: day(new Date(Date.now() + 86_400_000)), status: scheduled ? 'scheduled' : 'draft' };
  const uploads = [];
  const submissions = [];
  const harness = createHarness(() => Composer({ draft, quick, saving, accounts, media: [],
    upload(files) { const batch = deferred(); uploads.push({ ...batch, files }); return batch.promise; },
    setDraft(update) { draft = typeof update === 'function' ? update(draft) : update; },
    save(post, status) { submissions.push({ kind: status, mediaIds: [...post.mediaIds] }); },
    publishNow(post) { submissions.push({ kind: 'now', mediaIds: [...post.mediaIds] }); },
  }));
  harness.render();
  const input = () => findAll(harness.tree, node => node.type === 'input' && node.props.type === 'file')[0];
  const drop = () => findAll(harness.tree, node => !!node.props?.onDrop)[0];
  return { harness, uploads, submissions, get draft() { return draft; },
    change(update) { draft = { ...draft, ...update }; harness.render(); },
    input(files) { input().props.onChange({ target: { files, value: 'selected' } }); },
    drop(files) { drop().props.onDrop({ preventDefault() {}, dataTransfer: { files } }); },
    actions() { return findAll(harness.tree, node => node.type?.name === 'Action' && /^(Сохранить|Запланировать|Опубликовать)/u.test(text(node))); },
  };
}
function assertPending(value) {
  const actions = value.actions();
  assert.ok(actions.length >= 2);
  for (const action of actions) assert.equal(action.props.disabled, true, 'submit must wait for every pending upload batch');
}
function asset(id) { return { id }; }

for (const [quick, scheduled] of [[false, false], [false, true], [true, false]]) for (const first of [0, 1]) {
  test(`${quick ? 'quick' : scheduled ? 'full scheduled' : 'full now'} Composer waits for both same-render uploads, batch${first} finishes first`, async () => {
    const value = editor({ quick, scheduled });
    try {
      value.input([{ name: 'first.png' }]);
      if (quick) value.input([{ name: 'second.png' }]); else value.drop([{ name: 'second.png' }]);
      value.harness.render();
      assert.equal(value.uploads.length, 2);
      assertPending(value);
      value.change({ text: 'Latest edit', mediaIds: ['existing', 'manual'] });
      value.uploads[first].resolve([asset(`batch${first}`)]);
      await value.harness.settle();
      assertPending(value);
      value.uploads[1 - first].resolve([asset(`batch${1 - first}`)]);
      await value.harness.settle();
      assert.equal(value.draft.text, 'Latest edit');
      assert.deepEqual(value.draft.mediaIds, ['existing', 'manual', `batch${first}`, `batch${1 - first}`]);
      for (const action of value.actions()) {
        assert.ok(!action.props.disabled);
        action.props.onClick();
      }
      assert.equal(value.submissions.length, 2);
      for (const submission of value.submissions) assert.deepEqual(submission.mediaIds, value.draft.mediaIds);
    } finally { value.harness.unmount(); }
  });
}

test('empty failed batch result does not unlock another pending upload; partial success retains attachments', async () => {
  const value = editor();
  try {
    value.input([{ name: 'failed.png' }]);
    value.drop([{ name: 'good.png' }, { name: 'bad.png' }]);
    value.harness.render();
    value.uploads[0].resolve([]); // PlannerApp.upload catches per-file errors and returns successful assets only.
    await value.harness.settle();
    assertPending(value);
    value.uploads[1].resolve([asset('good')]);
    await value.harness.settle();
    assert.deepEqual(value.draft.mediaIds, ['existing', 'good']);
    for (const action of value.actions()) assert.ok(!action.props.disabled);
  } finally { value.harness.unmount(); }
});

test('single multi-file upload disables submissions until all returned assets attach', async () => {
  const value = editor();
  try {
    value.input([{ name: 'one.png' }, { name: 'two.png' }]);
    value.harness.render();
    assertPending(value);
    assert.equal(value.uploads[0].files.length, 2);
    value.uploads[0].resolve([asset('one'), asset('two')]);
    await value.harness.settle();
    assert.deepEqual(value.draft.mediaIds, ['existing', 'one', 'two']);
    for (const action of value.actions()) assert.ok(!action.props.disabled);
  } finally { value.harness.unmount(); }
});

test('completed uploads preserve existing saving and disconnected-account guards', async () => {
  for (const quick of [false, true]) {
    const saving = editor({ quick, saving: true });
    try {
      saving.input([{ name: 'one.png' }]); saving.uploads[0].resolve([]);
      await saving.harness.settle(); assertPending(saving);
    } finally { saving.harness.unmount(); }
    const disconnected = editor({ quick, accounts: { telegram: false, max: true } });
    try {
      disconnected.input([{ name: 'one.png' }]); disconnected.uploads[0].resolve([]);
      await disconnected.harness.settle();
      const actions = disconnected.actions();
      assert.equal(actions.at(-1).props.disabled, true);
      assert.ok(!actions[0].props.disabled);
    } finally { disconnected.harness.unmount(); }
  }
});

test('upload finishing after unmount does not attach media to the departed draft', async () => {
  const value = editor();
  value.input([{ name: 'late.png' }]);
  value.harness.unmount();
  value.uploads[0].resolve([asset('late')]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(value.draft.mediaIds, ['existing']);
  assert.equal(value.submissions.length, 0);
});

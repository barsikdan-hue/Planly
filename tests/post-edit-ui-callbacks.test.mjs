// Callback/data-flow coverage using the existing hook harness; actual React
// markup is checked separately. Neither file claims browser interaction proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/post-edit-ui-loader.mjs', import.meta.url);
const { Composer } = await import('../components/planner/composer.tsx');
const { Content } = await import('../components/planner/library.tsx');
const { Calendar } = await import('../components/planner/calendar.tsx');
const { blankPost, day } = await import('../lib/planner.ts');
const reason = 'Already published';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
function text(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join('');
}

test('copy action receives the current unsaved local draft, including its media and overrides', () => {
  const draft = { ...blankPost(), id: 'published', text: 'Local newer text', mediaIds: ['B', 'A'],
    overrides: { telegram: 'Local override' }, editBlockedReason: reason };
  let copied;
  const harness = createHarness(() => Composer({ draft, setDraft() { assert.fail('original must not mutate'); },
    media: [], upload: async () => [], save() { assert.fail('original must not submit'); }, publishNow() {},
    accounts: { telegram: true, max: true }, duplicatePost(post) { copied = post; } }));
  const tree = harness.render();
  const copy = find(tree, node => !!node.props?.onClick && text(node) === 'Дублировать в черновик');
  assert.ok(copy, 'blocked editor must expose a copy action');
  copy.props.onClick();
  assert.equal(copied.text, 'Local newer text');
  assert.deepEqual(copied.mediaIds, ['B', 'A']);
  assert.deepEqual(copied.overrides, { telegram: 'Local override' });
  harness.unmount();
});

test('blocked Content original keeps duplicate action and omits edit', () => {
  const post = { ...blankPost(), id: 'original', text: 'Original', editBlockedReason: reason };
  let copied;
  const harness = createHarness(() => Content({ posts: [post], media: [], query: '', setQuery() {}, openPost() {},
    editPost() { assert.fail('blocked original must not expose edit'); }, deletePost() {}, create() {},
    duplicatePost(value) { copied = value; } }));
  const tree = harness.render();
  assert.equal(find(tree, node => !!node.props?.onClick && text(node) === 'Редактировать'), null);
  const copy = find(tree, node => !!node.props?.onClick && text(node) === 'Дублировать в черновик');
  assert.ok(copy);
  copy.props.onClick();
  assert.equal(copied.id, 'original');
  harness.unmount();
});

test('calendar blocks dragging and direct drop of a partially published scheduled post', () => {
  for (const blocked of [true, false]) {
    const post = { ...blankPost(), id: 'scheduled', text: 'Calendar post', date: day(), status: 'scheduled',
      editBlockedReason: blocked ? reason : null };
    const moved = [];
    const harness = createHarness(() => Calendar({ posts: [post], openPost() {}, createPost() {},
      reschedule(...args) { moved.push(args); } }));
    const tree = harness.render();
    const event = find(tree, node => node.props?.className?.startsWith('calendar-event'));
    assert.equal(event.props.draggable, !blocked);
    const slot = find(tree, node => !!node.props?.onDrop);
    slot.props.onDrop({ preventDefault() {}, dataTransfer: { getData() { return 'scheduled'; } } });
    assert.equal(moved.length, blocked ? 0 : 1);
    harness.unmount();
  }
});

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
const { ManagedUserPosts } = await import('../components/planner/managed-user-posts.tsx');
const savedFetch = globalThis.fetch, savedTimezone = process.env.TZ;
let app;
afterEach(() => { app?.unmount(); globalThis.fetch = savedFetch; if (savedTimezone === undefined) delete process.env.TZ; else process.env.TZ = savedTimezone; });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children ?? node].flat(Infinity)) {
    if (child === node) continue;
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
const post = { id: 'scheduled', title: 'Scheduled', baseText: 'Body', status: 'READY', targets: [{ provider: 'max', scheduledAt: '2030-01-02T07:00:00.000Z', publication: { status: 'SCHEDULED' } }] };
async function setup(writes) {
  process.env.TZ = 'UTC';
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'PATCH') { writes.push(JSON.parse(init.body)); return Response.json({}); }
    return Response.json({ posts: [post] });
  };
  app = createHarness(() => ManagedUserPosts({ userId: 'agent', email: 'agent@example.test', displayName: 'Agent' }));
  await app.settle();
}
test('admin schedule displays Moscow time independently of browser timezone', async () => {
  await setup([]);
  const input = find(app.tree, n => n.type === 'input' && n.props.type === 'datetime-local');
  assert.equal(input.props.defaultValue ?? input.props.value, '2030-01-02T10:00');
});
test('admin reschedule sends Moscow input as UTC independently of browser timezone', async () => {
  const writes = []; await setup(writes);
  const input = find(app.tree, n => n.type === 'input' && n.props.type === 'datetime-local');
  input.props.onChange({ target: { value: '2030-01-03T10:00' } });
  await app.settle();
  assert.equal(writes[0].scheduledAt, '2030-01-03T07:00:00.000Z');
});

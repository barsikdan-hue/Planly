import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
const path = '../components/planner/managed-user-lifecycle.tsx';
const componentModule = await import(path).catch(() => null);
let app; const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
afterEach(() => { app?.unmount(); globalThis.fetch = originalFetch; globalThis.window = originalWindow; });
function find(node, predicate) { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; for (const child of [node.props?.children ?? node].flat(Infinity)) { if (child === node) continue; const match = find(child, predicate); if (match) return match; } return null; }
function text(node) { if (typeof node === 'string') return node; if (!node || typeof node !== 'object') return ''; return [node.props?.children ?? node].flat(Infinity).filter(n => n !== node).map(text).join(''); }
const button = label => find(app.tree, n => n.type === 'button' && text(n) === label);
async function setup(writes) {
  assert.ok(componentModule?.ManagedUserLifecycle, 'agent lifecycle controls must exist');
  globalThis.window = { location: { origin: 'https://planly.test', assign() {} } };
  globalThis.fetch = async (_url, init) => { writes.push(JSON.parse(init.body)); return Response.json({ deleted: true, cleanupPending: true }); };
  app = createHarness(() => componentModule.ManagedUserLifecycle({ user: { id: 'agent', email: 'agent@example.test', accessExpiresAt: null }, onChanged() {}, onDeleted() {} }));
  await app.settle();
}
test('agent deletion needs the exact displayed email and explicit confirmation', async () => {
  const writes = []; await setup(writes);
  button('Удалить агента').props.onClick(); await app.settle(); assert.equal(writes.length, 0);
  await button('Подтвердить удаление').props.onClick(); await app.settle(); assert.equal(writes.length, 0);
  const input = find(app.tree, n => n.type === 'input' && n.props['aria-label'] === 'Email для подтверждения удаления');
  input.props.onChange({ target: { value: 'agent@example.test' } }); await app.settle();
  await button('Подтвердить удаление').props.onClick(); await app.settle();
  assert.deepEqual(writes, [{ action: 'delete', confirmedEmail: 'agent@example.test' }]);
});
test('cancelling deletion does not mutate and unlimited is an explicit independent action', async () => {
  const writes = []; await setup(writes);
  button('Удалить агента').props.onClick(); await app.settle(); button('Отменить удаление').props.onClick(); await app.settle();
  assert.equal(writes.length, 0);
  await button('Бессрочный доступ').props.onClick(); await app.settle();
  assert.deepEqual(writes, [{ action: 'unlimited' }]);
});

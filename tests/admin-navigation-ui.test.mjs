import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';

register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);

const { AdminEntry } = await import('../components/planner/admin-entry.tsx');
const originalFetch = globalThis.fetch;
let app;

afterEach(() => {
  app?.unmount();
  globalThis.fetch = originalFetch;
});

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children ?? node].flat(Infinity)) {
    if (child === node) continue;
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

test('ADMIN sees one clear entry point for colleague administration', async () => {
  globalThis.fetch = async () => Response.json({ users: [] });
  app = createHarness(() => AdminEntry());
  await app.settle();
  const link = find(app.tree, node => node.type === 'a');
  assert.equal(link?.props.href, '/admin');
  assert.match(link?.props.children, /Администрирование/);
});

test('regular USER does not see the administration entry point', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Forbidden' }, { status: 403 });
  app = createHarness(() => AdminEntry());
  await app.settle();
  assert.equal(find(app.tree, node => node.type === 'a'), null);
});

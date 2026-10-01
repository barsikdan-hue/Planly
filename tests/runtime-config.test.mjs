import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('production runtime uses standard Next.js commands', () => {
  assert.equal(pkg.scripts.dev, 'next dev');
  assert.equal(pkg.scripts.build, 'next build');
  assert.equal(pkg.scripts.start, 'next start');
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.ok(typeof pkg.scripts.test === 'string' && pkg.scripts.test.includes('node --test'));
  assert.equal(pkg.packageManager, 'pnpm@11.25.0');
  assert.equal(pkg.engines.node, '>=22.13.0');
});

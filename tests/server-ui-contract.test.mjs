import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production planner app no longer imports IndexedDB workspace storage', async () => {
  const source = await read('components/planner/app.tsx');
  assert.doesNotMatch(source, /browser-store|readStore|writeStore|seedPosts/);
  assert.match(source, /planly-api/);
});

test('active MVP network model exposes Telegram and MAX only', async () => {
  const source = await read('lib/planner.ts');
  assert.match(source, /'telegram'\s*\|\s*'max'/);
  assert.doesNotMatch(source, /'vk'|'instagram'/);
});

test('composer cannot claim a fake immediate publication', async () => {
  const source = await read('components/planner/composer.tsx');
  assert.doesNotMatch(source, /Опубликовать \(демо\)|Демопубликация|value="published"/);
  assert.match(source, /Запланировать/);
});

test('social and calendar surfaces contain MAX instead of VK or Instagram', async () => {
  const settings = await read('components/planner/settings.tsx');
  const calendar = await read('components/planner/calendar.tsx');
  assert.doesNotMatch(`${settings}\n${calendar}`, /Instagram|\bVK\b|instagram|\bvk\b/);
  assert.match(`${settings}\n${calendar}`, /MAX/);
});

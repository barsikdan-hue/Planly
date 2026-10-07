import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production planner app no longer imports IndexedDB workspace storage', async () => {
  const source = await read('components/planner/app.tsx');
  assert.doesNotMatch(source, /browser-store|readStore|writeStore|seedPosts/);
  assert.match(source, /planly-api/);
});

test('active Phase 7A network model exposes Telegram, MAX and VK only', async () => {
  const source = await read('lib/planner.ts');
  assert.match(source, /export type Network = 'telegram'\s*\|\s*'max'\s*\|\s*'vk';/);
  assert.doesNotMatch(source, /'instagram'/);
});

test('composer cannot claim a fake immediate publication', async () => {
  const source = await read('components/planner/composer.tsx');
  assert.doesNotMatch(source, /Опубликовать \(демо\)|Демопубликация|value="published"/);
  assert.match(source, /Запланировать/);
});

test('social and calendar surfaces include approved VK and MAX while excluding Instagram', async () => {
  const settings = await read('components/planner/settings.tsx');
  const calendar = await read('components/planner/calendar.tsx');
  assert.doesNotMatch(`${settings}\n${calendar}`, /Instagram|instagram/);
  assert.match(`${settings}\n${calendar}`, /MAX/);
  assert.match(settings, /Подключить через VK ID/);
  assert.match(calendar, /legend-dot vk/);
});

test('planner UI no longer describes provider publishing as Telegram-only or future-only', async () => {
  const app = await read('components/planner/app.tsx');
  const composer = await read('components/planner/composer.tsx');
  const settings = await read('components/planner/settings.tsx');
  const source = `${app}\n${composer}\n${settings}`;

  assert.doesNotMatch(source, /Ждём подтверждения Telegram|Открыть в Telegram/);
  assert.doesNotMatch(source, /отправку подключим следующим milestone|Реальная отправка в соцсети будет подключена следующим этапом/);
  assert.match(source, /Telegram и MAX/);
});

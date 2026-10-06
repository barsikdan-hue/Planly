// APPROVE_OPTION_A: actual App recovery and real Composer SSR keep UI intent
// separate from lifecycle. Frozen PR15 oracle remains unchanged in that PR.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
import { day } from '../lib/planner.ts';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../components/planner/app.tsx');
const { Composer } = await import('../components/planner/composer.tsx');
const originals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
let harness;
afterEach(() => { harness?.unmount(); harness = null; Object.assign(globalThis, originals); });

function fixture(providedCache) {
  const items = new Map(), requests = [];
  const cache = providedCache ?? { getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  globalThis.window = { sessionStorage: cache, location: { hash: '#create', assign() {} },
    history: { replaceState() {} }, scrollTo() {}, confirm() { return true; }, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json({ profile: { id: 'owner', displayName: 'Owner' },
      posts: [], media: [], socialAccounts: [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }] });
    requests.push({ url, method: init?.method });
    throw Error('Mode/recovery must not mutate server data');
  };
  harness = createHarness(PlannerApp);
  return { cache, requests };
}

test('approved recovery oracle keeps Draft lifecycle, Scheduled UI and real Composer date/time controls without mutations', async () => {
  const first = fixture(); await harness.settle();
  const date = day(2), time = '18:00';
  harness.composer().setDraft(current => ({ ...current, text: 'Unsaved scheduled UI work', date, time }));
  await harness.settle();
  harness.composer().onPublishModeChange('scheduled'); await harness.settle();
  assert.equal(harness.composer().draft.status, 'draft');
  harness.unmount();
  const reload = fixture(first.cache); await harness.settle();
  const post = harness.composer().draft;
  assert.equal(post.id, ''); assert.equal(post.status, 'draft');
  assert.equal(harness.composer().publishMode, 'scheduled');
  assert.equal(post.date, date); assert.equal(post.time, time);
  const html = renderToStaticMarkup(React.createElement(Composer, harness.composer()));
  assert.ok(html.includes('type="date"') && html.includes(`value="${date}"`));
  assert.ok(html.includes('type="time"') && html.includes(`value="${time}"`));
  assert.ok(html.includes('Запланировать'));
  assert.equal(first.requests.length + reload.requests.length, 0);
});

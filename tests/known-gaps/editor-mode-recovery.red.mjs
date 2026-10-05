// CR-10 preserved reload oracle, explicitly split by Orchestrator APPROVE_SPLIT_A.
// Run separately: node --test --experimental-strip-types tests/known-gaps/editor-mode-recovery.red.mjs
// Deliberately outside tests/*.test.mjs; expected RED until reviewed CR-10 implementation.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { register } from 'node:module';
import { createHarness } from '../helpers/planner-hook-harness.mjs';
import { day } from '../../lib/planner.ts';
register('../helpers/planner-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../../components/planner/app.tsx');
const { Composer } = await import('../../components/planner/composer.tsx');
const originals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
let harness;
afterEach(() => { harness?.unmount(); harness = null; Object.assign(globalThis, originals); });

function fixture({ cache: providedCache, view = 'calendar' } = {}) {
  const items = new Map(), handlers = new Map(), requests = [];
  const cache = providedCache ?? { getItem(key) { return items.get(key) ?? null; },
    setItem(key, value) { items.set(key, value); }, removeItem(key) { items.delete(key); } };
  globalThis.window = { sessionStorage: cache, location: { hash: `#${view}`, assign() {} },
    history: { replaceState() {} }, scrollTo() {}, confirm() { return true; },
    addEventListener(name, callback) { handlers.set(name, callback); }, removeEventListener(name) { handlers.delete(name); } };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/bootstrap') return Response.json({ profile: { id: 'owner', displayName: 'Owner' },
      posts: [], media: [], socialAccounts: [{ id: 'tg', provider: 'telegram', enabled: true, connectionStatus: 'CONNECTED' }] });
    requests.push({ url, method: init?.method });
    throw Error('Opening an unsaved editor must not mutate server data');
  };
  harness = createHarness(PlannerApp);
  return { cache, requests };
}
function assertSchedule(date, time) {
  const post = harness.composer().draft;
  assert.equal(post.id, '');
  assert.equal(post.status, 'scheduled');
  assert.equal(post.date, date); assert.equal(post.time, time);
  const html = renderToStaticMarkup(React.createElement(Composer, harness.composer()));
  assert.ok(html.includes('type="date"') && html.includes(`value="${date}"`));
  assert.ok(html.includes('type="time"') && html.includes(`value="${time}"`));
  assert.ok(html.includes('Запланировать'));
}

test('calendar schedule recovery retains chosen mode/date/time after app reload', async () => {
  const { cache, requests } = fixture(); await harness.settle();
  const date = day(2);
  harness.find('Calendar').props.createPost(date, '18:00'); await harness.settle();
  harness.unmount();
  const reload = fixture({ cache, view: 'create' }); await harness.settle();
  assertSchedule(date, '18:00');
  assert.equal(requests.length + reload.requests.length, 0);
});

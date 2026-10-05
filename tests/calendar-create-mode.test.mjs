// Actual PlannerApp callback/effects + real React server-rendered Composer.
// Existing hook harness is lifecycle coverage, not browser/production proof.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
import { day, validatePost } from '../lib/planner.ts';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
const { default: PlannerApp } = await import('../components/planner/app.tsx');
const { Composer } = await import('../components/planner/composer.tsx');
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
  const navigate = async value => { window.location.hash = `#${value}`; handlers.get('hashchange')(); await harness.settle(); };
  return { cache, requests, navigate };
}
function markup() { return renderToStaticMarkup(React.createElement(Composer, harness.composer())); }
function assertSchedule(date, time) {
  const post = harness.composer().draft;
  assert.equal(post.id, '');
  assert.equal(post.status, 'scheduled');
  assert.equal(post.date, date); assert.equal(post.time, time);
  const html = markup();
  assert.ok(html.includes('type="date"') && html.includes(`value="${date}"`));
  assert.ok(html.includes('type="time"') && html.includes(`value="${time}"`));
  assert.ok(html.includes('Запланировать'));
}

for (const time of ['18:00', '10:00']) test(`Calendar chosen date and ${time} open visible scheduled Composer without POST`, async () => {
  const { requests } = fixture(); await harness.settle();
  const date = day(2);
  harness.find('Calendar').props.createPost(date, time); await harness.settle();
  assertSchedule(date, time);
  assert.equal(requests.length, 0);
});

test('generic Content new-post action keeps default Now despite default draft date/time', async () => {
  const { requests } = fixture({ view: 'content' }); await harness.settle();
  harness.find('Content').props.create(); await harness.settle();
  assert.equal(harness.composer().draft.status, 'draft');
  const html = markup();
  assert.ok(!html.includes('type="date"') && !html.includes('type="time"'));
  assert.ok(html.includes('Опубликовать сейчас'));
  assert.equal(requests.length, 0);
});

test('calendar schedule recovery retains chosen mode/date/time after app reload', async () => {
  const { cache, requests } = fixture(); await harness.settle();
  const date = day(2);
  harness.find('Calendar').props.createPost(date, '18:00'); await harness.settle();
  harness.unmount();
  const reload = fixture({ cache, view: 'create' }); await harness.settle();
  assertSchedule(date, '18:00');
  assert.equal(requests.length + reload.requests.length, 0);
});

test('declined Calendar replacement preserves another dirty editor without mutation', async () => {
  const { requests, navigate } = fixture({ view: 'create' }); await harness.settle();
  harness.composer().setDraft(current => ({ ...current, text: 'Unsaved local content', mediaIds: ['manual'] }));
  await harness.settle(); const before = harness.composer().draft;
  await navigate('calendar'); let confirms = 0; window.confirm = () => { confirms++; return false; };
  harness.find('Calendar').props.createPost(day(2), '18:00'); await harness.settle();
  assert.equal(confirms, 1);
  await navigate('create');
  assert.deepEqual(harness.composer().draft, before);
  assert.equal(requests.length, 0);
});

test('past Calendar selection stays explicit and existing future-time validation rejects scheduling', async () => {
  const { requests } = fixture(); await harness.settle();
  const date = day(-1);
  harness.find('Calendar').props.createPost(date, '00:00'); await harness.settle();
  assertSchedule(date, '00:00');
  assert.ok(validatePost({ ...harness.composer().draft, text: 'Valid text' }, 'scheduled'));
  assert.equal(requests.length, 0);
});

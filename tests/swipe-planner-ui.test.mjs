import test, { before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
let SwipePlanner;
before(async () => {
  if (existsSync(new URL('../components/planner/swipe-planner.tsx', import.meta.url)))
    ({ SwipePlanner } = await import('../components/planner/swipe-planner.tsx'));
});
const harnesses = [];
afterEach(() => harnesses.splice(0).forEach(h => h.unmount()));
const item = (id, createdAt = '2026-10-04T09:00:00.000Z', extra = {}) => ({ id, title: id, text: `Текст ${id}`, mediaIds: [], status: 'READY', sourcePostId: null, createdAt, updatedAt: createdAt, ...extra });
const account = (provider, extra = {}) => ({ id: provider, provider, providerAccountId: null, displayName: provider, enabled: true, connectionStatus: 'CONNECTED', ...extra });
const nodes = (node, predicate) => {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node) ? node : node.props?.children;
  return [...(predicate(node) ? [node] : []), ...(Array.isArray(children) ? children : [children]).flatMap(child => nodes(child, predicate))];
};
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node && typeof node === 'object' ? (Array.isArray(node) ? node : [node.props?.children]).flat(Infinity).map(text).join('') : '';
function button(h, label) { const n = nodes(h.tree, n => typeof n.props?.onClick === 'function' && text(n) === label)[0]; assert.ok(n, `Missing button ${label}`); return n; }
function field(h, label) { const n = nodes(h.tree, n => n.props?.['aria-label'] === label)[0]; assert.ok(n, `Missing field ${label}`); return n; }
const card = h => nodes(h.tree, n => n.type === 'article')[0];
async function click(h, label) { const n = button(h, label); assert.equal(!!n.props.disabled, false, `${label} disabled`); await n.props.onClick(); await h.settle(); }
async function change(h, label, value) { field(h, label).props.onChange({ target: { value } }); await h.settle(); }
function ui(props = {}) {
  assert.equal(typeof SwipePlanner, 'function', 'SwipePlanner is missing');
  const calls = { approve: [], reject: [], preview: [], edit: [] };
  const state = {
    items: [item('b'), item('a'), item('later', '2026-10-05T09:00:00.000Z')], media: [], socialAccounts: [account('telegram'), account('max')],
    onApprove: async (...args) => { calls.approve.push(args); return { id: 'created' }; },
    onReject: async value => { calls.reject.push(value); },
    onPreview: async query => { calls.preview.push(query); return { scheduledAt: '2099-10-04T07:00:00.000Z' }; },
    onEdit: value => calls.edit.push(value), onClose() {}, ...props,
  };
  const h = createHarness(() => SwipePlanner(state)); harnesses.push(h); h.render();
  return { h, state, calls };
}

test('READY unlinked cards are oldest first, ties by id; skip writes nothing and new session restores it', async () => {
  const { h, calls, state } = ui({ items: [item('later', '2026-10-05T09:00:00Z'), item('b'), item('a'), item('archived', undefined, { status: 'ARCHIVED' }), item('linked', undefined, { sourcePostId: 'post' })] });
  assert.match(text(card(h)), /Текст a/);
  await click(h, 'Пропустить');
  assert.match(text(card(h)), /Текст b/);
  assert.deepEqual(calls.approve, []); assert.deepEqual(calls.reject, []);
  assert.match(text(card(ui(state).h)), /Текст a/);
});
test('draft starts without selected providers and submits null schedule preserving source and media order', async () => {
  const source = item('a', undefined, { mediaIds: ['video', 'image'] });
  const { h, calls } = ui({ items: [source], media: [{ id: 'image', name: 'image', type: 'image/jpeg', url: '/i', size: 1 }, { id: 'video', name: 'video', type: 'video/webm', url: '/v', size: 1 }] });
  assert.equal(button(h, 'Telegram').props['aria-pressed'], false);
  assert.deepEqual(nodes(card(h), n => n.type === 'video' || n.type === 'img').map(n => n.props.src), ['/v', '/i']);
  await click(h, 'Одобрить');
  assert.deepEqual(calls.approve, [[source, { mode: 'draft', providers: [], scheduledAt: null }]]);
  assert.match(text(h.tree), /Одобрено: 1/); assert.match(text(h.tree), /created|Публикация создана/);
});
test('manual scheduling requires explicit connected provider and converts Moscow date/time to UTC', async () => {
  const { h, calls } = ui({ socialAccounts: [account('telegram'), account('max', { connectionStatus: 'DISCONNECTED' })] });
  await change(h, 'Режим одобрения', 'manual');
  assert.equal(button(h, 'Одобрить').props.disabled, true); assert.equal(button(h, 'MAX').props.disabled, true);
  await click(h, 'Telegram'); await change(h, 'Дата публикации', '2099-10-04'); await change(h, 'Время публикации', '10:00');
  await click(h, 'Одобрить');
  assert.deepEqual(calls.approve[0][1], { mode: 'manual', providers: ['telegram'], scheduledAt: '2099-10-04T07:00:00.000Z' });
});
test('manual Moscow midnight is valid even when its UTC date is the previous day', async () => {
  const { h, calls } = ui(); await change(h, 'Режим одобрения', 'manual'); await click(h, 'Telegram');
  await change(h, 'Дата публикации', '2099-10-04'); await change(h, 'Время публикации', '00:30');
  await click(h, 'Одобрить'); assert.equal(calls.approve[0][1].scheduledAt, '2099-10-03T21:30:00.000Z');
});
test('returning to next mode cannot approve stale preview while a new preview is loading', async () => {
  let count = 0; let resolve;
  const { h } = ui({ onPreview: async () => ++count === 1 ? { scheduledAt: '2099-10-04T07:00:00.000Z' } : new Promise(r => { resolve = r; }) });
  await change(h, 'Режим одобрения', 'next'); await click(h, 'Telegram');
  assert.equal(button(h, 'Одобрить').props.disabled, false);
  await change(h, 'Режим одобрения', 'draft'); await change(h, 'Режим одобрения', 'next');
  assert.equal(button(h, 'Одобрить').props.disabled, true);
  resolve({ scheduledAt: null }); await h.settle(); assert.equal(button(h, 'Одобрить').props.disabled, true);
});
test('a slot conflict refreshes preview but keeps the card for another explicit approval', async () => {
  const approvals = []; let previewCount = 0;
  const { h } = ui({ onPreview: async () => ({ scheduledAt: ++previewCount === 1 ? '2099-10-04T07:00:00.000Z' : '2099-10-05T07:00:00.000Z' }), onApprove: async (source, approval) => { approvals.push([source, approval]); if (approvals.length === 1) throw Error('Слот занят'); return { id: 'saved' }; } });
  await change(h, 'Режим одобрения', 'next'); await click(h, 'Telegram'); await click(h, 'Одобрить');
  assert.match(text(card(h)), /Текст a/); assert.equal(approvals.length, 1);
  await click(h, 'Одобрить'); assert.equal(approvals[1][1].scheduledAt, '2099-10-05T07:00:00.000Z');
});
test('next slot preview uses presets and inclusive 7/30 Moscow dates; no slot disables approval', async () => {
  const queries = [];
  const { h } = ui({ onPreview: async q => { queries.push(q); return { scheduledAt: null }; } });
  await change(h, 'Режим одобрения', 'next'); await click(h, 'Telegram');
  const first = queries.at(-1); assert.deepEqual(first.times, ['10:00']); assert.deepEqual(first.weekdays, [1,2,3,4,5,6,7]);
  assert.equal((Date.parse(first.endDate) - Date.parse(first.startDate)) / 86400000, 6);
  assert.equal(button(h, 'Одобрить').props.disabled, true);
  await change(h, 'Горизонт планирования', '30'); await change(h, 'Расписание', 'weekdays10');
  const last = queries.at(-1); assert.deepEqual(last.weekdays, [1,2,3,4,5]);
  assert.equal((Date.parse(last.endDate) - Date.parse(last.startDate)) / 86400000, 29);
});
test('custom schedule validates weekdays and 1–4 unique times before preview', async () => {
  const { h, calls } = ui(); await change(h, 'Режим одобрения', 'next'); await click(h, 'Telegram'); await change(h, 'Расписание', 'custom');
  await change(h, 'Время слота 1', '10:00'); await click(h, 'Добавить время');
  await change(h, 'Время слота 2', '10:00');
  assert.equal(button(h, 'Одобрить').props.disabled, true);
  await change(h, 'Время слота 2', '18:00');
  assert.deepEqual(calls.preview.at(-1).times, ['10:00', '18:00']);
  for (const label of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) await click(h, label);
  assert.equal(button(h, 'Одобрить').props.disabled, true);
});
test('equivalent preset switches refresh preview instead of leaving next-slot approval loading', async () => {
  const {h,calls}=ui(); await change(h,'Режим одобрения','next'); await click(h,'Telegram');
  const count=calls.preview.length; assert.equal(button(h,'Одобрить').props.disabled,false);
  await change(h,'Расписание','custom');
  assert.equal(calls.preview.length,count+1); assert.equal(button(h,'Одобрить').props.disabled,false);
  await change(h,'Расписание','daily10');
  assert.equal(calls.preview.length,count+2); assert.equal(button(h,'Одобрить').props.disabled,false);
});
test('approve failure retains card; in flight double click and skip cannot advance; success advances once', async () => {
  let resolve; let attempts = 0;
  const { h } = ui({ onApprove: async () => { attempts++; if (attempts === 1) throw Error('Не сохранено'); await new Promise(r => { resolve = r; }); return { id: 'saved' }; } });
  await click(h, 'Одобрить'); assert.match(text(card(h)), /Текст a/); assert.match(text(h.tree), /Не сохранено/);
  const approve = button(h, 'Одобрить').props.onClick; const promise = approve(); approve(); await h.settle();
  assert.equal(button(h, 'Пропустить').props.disabled, true); assert.equal(attempts, 2); assert.match(text(card(h)), /Текст a/);
  resolve(); await promise; await h.settle(); assert.match(text(card(h)), /Текст b/); assert.match(text(h.tree), /Одобрено: 1/);
});
test('reject invokes archive callback only, failure retains card and success does not increment approval', async () => {
  let attempts = 0; const sources = [];
  const { h, calls } = ui({ onReject: async value => { sources.push(value); if (++attempts === 1) throw Error('Изменена'); } });
  await click(h, 'Отклонить'); assert.match(text(card(h)), /Текст a/);
  await click(h, 'Отклонить'); assert.match(text(card(h)), /Текст b/);
  assert.equal(sources[0].updatedAt, '2026-10-04T09:00:00.000Z'); assert.deepEqual(calls.approve, []); assert.match(text(h.tree), /Одобрено: 0/);
});
test('global busy or unresolved pending blocks approval, rejection, skip and editing', async () => {
  for (const state of [{ busy: true }, { pending: true }]) {
    const { h, calls } = ui(state);
    for (const label of ['Одобрить','Отклонить','Пропустить','Открыть редактор']) { assert.equal(button(h, label).props.disabled, true); await button(h, label).props.onClick(); }
    assert.deepEqual(calls.approve, []); assert.deepEqual(calls.reject, []); assert.deepEqual(calls.edit, []); assert.match(text(card(h)), /Текст a/);
  }
});
test('pointer swipes require 80px horizontal travel; vertical, cancel, secondary and media controls do nothing', async () => {
  const { h, calls } = ui();
  const target = { closest: () => null };
  const swipe = async (dx, dy = 0, extra = {}, cancel = false) => {
    const n = card(h); n.props.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, target, ...extra });
    await (cancel ? n.props.onPointerCancel : n.props.onPointerUp)({ pointerId: 1, clientX: 100 + dx, clientY: 100 + dy, target }); await h.settle();
  };
  await swipe(79); await swipe(100, 120); await swipe(100, 0, {}, true); await swipe(100, 0, { button: 1 }); await swipe(100, 0, { target: { closest: () => ({}) } });
  assert.deepEqual(calls.approve, []); assert.deepEqual(calls.reject, []);
  await swipe(80); assert.equal(calls.approve.length, 1);
  await swipe(-80); assert.equal(calls.reject.length, 1);
});
test('arrow actions require card focus, and ignore input/media focus, repeats and modifiers', async () => {
  const { h, calls } = ui();
  const n = card(h); let prevented = 0; const event = { key: 'ArrowRight', currentTarget: n, target: n, preventDefault() { prevented++; } };
  for (const extra of [{ target: {} }, { repeat: true }, { ctrlKey: true }, { key: 'ArrowDown' }]) { await n.props.onKeyDown({ ...event, ...extra }); await h.settle(); }
  assert.deepEqual(calls.approve, []);
  await n.props.onKeyDown(event); await h.settle(); assert.equal(calls.approve.length, 1); assert.equal(prevented, 1);
});
test('empty start and exhausted review remain distinguishable', async () => {
  assert.match(text(ui({ items: [] }).h.tree), /Нет готовых заготовок/);
  const { h } = ui({ items: [item('only')] }); await click(h, 'Пропустить'); assert.match(text(h.tree), /Разбор завершён/); assert.match(text(h.tree), /Пропущено: 1/);
});

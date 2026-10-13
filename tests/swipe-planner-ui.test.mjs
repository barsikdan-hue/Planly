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
async function ui(props = {}, setup = true) {
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
  if(setup && state.items.some(i=>i.status==='READY'&&!i.sourcePostId)) {
    const blocked={busy:state.busy,pending:state.pending}; state.busy=false;state.pending=false;h.render();
    await click(h,'Telegram');await click(h,'Начать разбор');Object.assign(state,blocked);h.render();await h.settle();
  }
  return { h, state, calls };
}

test('explicit setup has next default, no selected networks or card before Start',async()=>{
 const {h,calls}=await ui({},false);assert.equal(field(h,'Режим одобрения').props.value,'next');
 assert.equal(card(h),undefined);assert.equal(button(h,'Начать разбор').props.disabled,false);
 assert.equal(button(h,'Telegram').props['aria-pressed'],false);
 await click(h,'Telegram');await click(h,'Начать разбор');
 assert.ok(card(h));assert.match(text(card(h)),/МСК/);assert.deepEqual(calls.approve,[]);
});

test('explicit setup without networks still permits skip/reject but never approval',async()=>{
 const {h,calls}=await ui({socialAccounts:[]},false);await click(h,'Начать разбор');
 assert.equal(button(h,'В календарь').props.disabled,true);await click(h,'Позже');await click(h,'Не нравится');
 assert.deepEqual(calls.approve,[]);assert.equal(calls.reject.length,1);assert.match(text(h.tree),/Одобрено: 0/);
});

test('no slot, API error, stale time and disconnected selected network produce zero right-gesture approvals',async()=>{
 for(const scenario of ['no-slot','error','elapsed','disconnect']){
  const {h,calls,state}=await ui({onPreview:async()=>{if(scenario==='error')throw Error('Preview unavailable');return{scheduledAt:scenario==='no-slot'?null:scenario==='elapsed'?new Date(Date.now()+59_000).toISOString():'2099-10-04T07:00:00Z'};}});
  if(scenario==='disconnect'){state.socialAccounts=[account('telegram',{connectionStatus:'DISCONNECTED'}),account('max')];h.render();await h.settle();}
  assert.equal(button(h,'В календарь').props.disabled,true);
  const target={closest:()=>null};const e={pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100,target};
  card(h).props.onPointerDown(e);card(h).props.onPointerMove({...e,clientX:200});await h.settle();assert.equal(card(h).props['data-motion'],'dragging');
  await card(h).props.onPointerUp({...e,clientX:200});await h.settle();assert.equal(card(h).props['data-motion'],'idle');assert.match(card(h).props.style.transform,/translateX\(0px\)/);assert.match(text(h.tree),/не раньше чем через минуту/);
  assert.deepEqual(calls.approve,[]);assert.match(text(card(h)),/Текст a/);assert.equal(button(h,'Позже').props.disabled,false);assert.equal(button(h,'Не нравится').props.disabled,false);
  if(scenario==='disconnect')assert.equal(button(h,'Telegram').props['aria-pressed'],true,'no silently replaced selection');
 }
});

test('READY unlinked cards are oldest first, ties by id; skip writes nothing and new session restores it', async () => {
  const { h, calls, state } = await ui({ items: [item('later', '2026-10-05T09:00:00Z'), item('b'), item('a'), item('archived', undefined, { status: 'ARCHIVED' }), item('linked', undefined, { sourcePostId: 'post' })] });
  assert.match(text(card(h)), /Текст a/);
  await click(h, 'Позже');
  assert.match(text(card(h)), /Текст b/);
  assert.deepEqual(calls.approve, []); assert.deepEqual(calls.reject, []);
  assert.match(text(card((await ui(state)).h)), /Текст a/);
});
test('next scheduled approval preserves source and media order', async () => {
  const source = item('a', undefined, { mediaIds: ['video', 'image'] });
  const { h, calls } = await ui({ items: [source], media: [{ id: 'image', name: 'image', type: 'image/jpeg', url: '/i', size: 1 }, { id: 'video', name: 'video', type: 'video/webm', url: '/v', size: 1 }] });
  assert.equal(button(h, 'Telegram').props['aria-pressed'], true);
  assert.deepEqual(nodes(card(h), n => n.type === 'video' || n.type === 'img').map(n => n.props.src), ['/v', '/i']);
  await click(h, 'В календарь');
  assert.deepEqual(calls.approve, [[source, { mode: 'next', providers: ['telegram'], scheduledAt: '2099-10-04T07:00:00.000Z', inputMethod: 'button' }]]);
  assert.match(text(h.tree), /Одобрено: 1/); assert.match(text(h.tree), /created|В календаре/);
});
test('manual scheduling requires explicit connected provider and converts Moscow date/time to UTC', async () => {
  const { h, calls } = await ui({ socialAccounts: [account('telegram'), account('max', { connectionStatus: 'DISCONNECTED' })] });
  await change(h, 'Режим одобрения', 'manual');
  assert.equal(button(h, 'MAX').props.disabled, true);
  await change(h,'Время публикации','');assert.equal(button(h,'В календарь').props.disabled,true);
  await change(h, 'Дата публикации', '2099-10-04'); await change(h, 'Время публикации', '10:00');
  await click(h, 'В календарь');
  assert.deepEqual(calls.approve[0][1], { mode: 'manual', providers: ['telegram'], scheduledAt: '2099-10-04T07:00:00.000Z', inputMethod: 'button' });
});
test('manual Moscow midnight is valid even when its UTC date is the previous day', async () => {
  const { h, calls } = await ui(); await change(h, 'Режим одобрения', 'manual');
  await change(h, 'Дата публикации', '2099-10-04'); await change(h, 'Время публикации', '00:30');
  await click(h, 'В календарь'); assert.equal(calls.approve[0][1].scheduledAt, '2099-10-03T21:30:00.000Z');
});
test('returning to next mode cannot approve stale preview while a new preview is loading', async () => {
  let count = 0; let resolve;
  const { h } = await ui({ onPreview: async () => ++count === 1 ? { scheduledAt: '2099-10-04T07:00:00.000Z' } : new Promise(r => { resolve = r; }) });

  assert.equal(button(h, 'В календарь').props.disabled, false);
  await change(h, 'Режим одобрения', 'manual'); await change(h, 'Режим одобрения', 'next');
  assert.equal(button(h, 'В календарь').props.disabled, true);
  resolve({ scheduledAt: null }); await h.settle(); assert.equal(button(h, 'В календарь').props.disabled, true);
});
test('a slot conflict preserves original slot until explicit refresh and confirmation', async () => {
  const approvals = []; let previewCount = 0;
  const { h } = await ui({ onPreview: async () => ({ scheduledAt: ++previewCount === 1 ? '2099-10-04T07:00:00.000Z' : '2099-10-05T07:00:00.000Z' }), onApprove: async (source, approval) => { approvals.push([source, approval]); if (approvals.length === 1) throw Error('Слот занят'); return { id: 'saved' }; } });
 await click(h, 'В календарь');
  assert.match(text(card(h)), /Текст a/); assert.equal(approvals.length, 1);
  assert.equal(approvals[0][1].scheduledAt, '2099-10-04T07:00:00.000Z'); await click(h, 'Обновить слот');
  await click(h, 'В календарь'); assert.equal(approvals[1][1].scheduledAt, '2099-10-05T07:00:00.000Z');
});
test('parent busy toggles after a failed approval cannot silently replace the original preview slot',async()=>{
 let count=0;const {h,state}=await ui({onPreview:async()=>({scheduledAt:++count===1?'2099-10-04T07:00:00Z':'2099-10-05T07:00:00Z'})});
 state.onApprove=async()=>{state.busy=true;h.render();await h.settle();state.busy=false;h.render();throw Error('Слот занят');};h.render();
 await click(h,'В календарь');assert.equal(count,1);assert.match(text(card(h)),/4 окт\./);assert.match(text(h.tree),/Слот занят/);
 await click(h,'Обновить слот');assert.equal(count,2);assert.match(text(card(h)),/5 окт\./);
});
test('Moscow midnight after conflict preserves query window and original slot until explicit refresh',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:Date.parse('2030-01-01T20:59:50Z')});
 const queries=[];const {h}=await ui({onPreview:async query=>{queries.push(query);return{scheduledAt:queries.length===1?'2030-01-02T07:00:00Z':'2030-01-03T07:00:00Z'};},onApprove:async()=>{throw Error('Слот занят');}});
 await click(h,'В календарь');assert.equal(queries.length,1);
 t.mock.timers.tick(15_000);await h.settle();assert.equal(queries.length,1);assert.match(text(card(h)),/2 янв\./);assert.equal(queries[0].startDate,'2030-01-01');
 await click(h,'Обновить слот');assert.equal(queries.length,2);assert.equal(queries[1].startDate,'2030-01-02');assert.match(text(card(h)),/3 янв\./);
});
test('selected disconnected network can only be removed explicitly, enabling selected connected replacement',async()=>{
 const {h,state,calls}=await ui();state.socialAccounts=[account('telegram',{connectionStatus:'DISCONNECTED'}),account('max')];h.render();await h.settle();
 assert.equal(button(h,'Telegram').props['aria-pressed'],true);assert.equal(button(h,'В календарь').props.disabled,true);
 await click(h,'Изменить расписание');await click(h,'MAX');assert.equal(button(h,'Telegram').props.disabled,false);
 await click(h,'Telegram');assert.equal(button(h,'Telegram').props['aria-pressed'],false);assert.equal(button(h,'Telegram').props.disabled,true);
 await click(h,'Начать разбор');await click(h,'В календарь');assert.deepEqual(calls.approve[0][1].providers,['max']);
});
test('next slot preview uses presets and inclusive 7/30 Moscow dates; no slot disables approval', async () => {
  const queries = [];
  const { h } = await ui({ onPreview: async q => { queries.push(q); return { scheduledAt: null }; } });

  const first = queries.at(-1); assert.deepEqual(first.times, ['10:00']); assert.deepEqual(first.weekdays, [1,2,3,4,5,6,7]);
  assert.equal((Date.parse(first.endDate) - Date.parse(first.startDate)) / 86400000, 6);
  assert.equal(button(h, 'В календарь').props.disabled, true);
  await change(h, 'Горизонт планирования', '30'); await change(h, 'Расписание', 'weekdays10');
  const last = queries.at(-1); assert.deepEqual(last.weekdays, [1,2,3,4,5]);
  assert.equal((Date.parse(last.endDate) - Date.parse(last.startDate)) / 86400000, 29);
});
test('custom schedule validates weekdays and 1–4 unique times before preview', async () => {
  const { h, calls } = await ui(); await change(h, 'Режим одобрения', 'next'); await change(h, 'Расписание', 'custom');
  await change(h, 'Время слота 1', '10:00'); await click(h, 'Добавить время');
  await change(h, 'Время слота 2', '10:00');
  assert.equal(button(h, 'В календарь').props.disabled, true);
  await change(h, 'Время слота 2', '18:00');
  assert.deepEqual(calls.preview.at(-1).times, ['10:00', '18:00']);
  for (const label of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) await click(h, label);
  assert.equal(button(h, 'В календарь').props.disabled, true);
});
test('equivalent preset switches refresh preview instead of leaving next-slot approval loading', async () => {
  const {h,calls}=await ui();
  const count=calls.preview.length; assert.equal(button(h,'В календарь').props.disabled,false);
  await change(h,'Расписание','custom');
  assert.equal(calls.preview.length,count+1); assert.equal(button(h,'В календарь').props.disabled,false);
  await change(h,'Расписание','daily10');
  assert.equal(calls.preview.length,count+2); assert.equal(button(h,'В календарь').props.disabled,false);
});
test('approve failure retains card; in flight double click and skip cannot advance; success advances once', async () => {
  let resolve; let attempts = 0;
  const { h } = await ui({ onApprove: async () => { attempts++; if (attempts === 1) throw Error('Не сохранено'); await new Promise(r => { resolve = r; }); return { id: 'saved' }; } });
  await click(h, 'В календарь'); assert.match(text(card(h)), /Текст a/); assert.match(text(h.tree), /Не сохранено/);
  const approve = button(h, 'В календарь').props.onClick; const promise = approve(); approve(); await h.settle();
  assert.equal(button(h, 'Позже').props.disabled, true); assert.equal(attempts, 2); assert.match(text(card(h)), /Текст a/);
  resolve(); await promise; await h.settle(); assert.match(text(card(h)), /Текст b/); assert.match(text(h.tree), /Одобрено: 1/);
});
test('reject invokes archive callback only, failure retains card and success does not increment approval', async () => {
  let attempts = 0; const sources = [];
  const { h, calls } = await ui({ onReject: async value => { sources.push(value); if (++attempts === 1) throw Error('Изменена'); } });
  await click(h, 'Не нравится'); assert.match(text(card(h)), /Текст a/);
  await click(h, 'Не нравится'); assert.match(text(card(h)), /Текст b/);
  assert.equal(sources[0].updatedAt, '2026-10-04T09:00:00.000Z'); assert.deepEqual(calls.approve, []); assert.match(text(h.tree), /Одобрено: 0/);
});
test('global busy or unresolved pending blocks approval, rejection, skip and editing', async () => {
  for (const state of [{ busy: true }, { pending: true }]) {
    const { h, calls } = await ui(state);
    for (const label of ['В календарь','Не нравится','Позже','Открыть редактор']) { assert.equal(button(h, label).props.disabled, true); await button(h, label).props.onClick(); }
    assert.deepEqual(calls.approve, []); assert.deepEqual(calls.reject, []); assert.deepEqual(calls.edit, []); assert.match(text(card(h)), /Текст a/);
  }
});
test('pointer swipes require 80px horizontal travel; vertical, cancel, secondary and media controls do nothing', async () => {
  const { h, calls } = await ui();
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
  const { h, calls } = await ui();
  const n = card(h); let prevented = 0; const event = { key: 'ArrowRight', currentTarget: n, target: n, preventDefault() { prevented++; } };
  for (const extra of [{ target: {} }, { repeat: true }, { ctrlKey: true }, { key: 'ArrowDown' }]) { await n.props.onKeyDown({ ...event, ...extra }); await h.settle(); }
  assert.deepEqual(calls.approve, []);
  await n.props.onKeyDown(event); await h.settle(); assert.equal(calls.approve.length, 1); assert.equal(prevented, 1);
});
test('empty start and exhausted review remain distinguishable', async () => {
  assert.match(text((await ui({ items: [] })).h.tree), /Пока нет готовых заготовок/);
  const { h } = await ui({ items: [item('only')] }); await click(h, 'Позже'); assert.match(text(h.tree), /Разбор завершён/); assert.match(text(h.tree), /Пропущено: 1/);
});

test('horizontal direction lock moves and tilts card; insufficient travel springs back without decision', async () => {
  const {h,calls}=await ui(); const target={closest:()=>null}; let captures=0;
  const e={pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100,target,currentTarget:{setPointerCapture(){captures++;}}};
  card(h).props.onPointerDown(e); assert.equal(captures,0,'capture only after horizontal direction lock');
  card(h).props.onPointerMove({...e,clientX:179}); await h.settle();
  assert.equal(card(h).props['data-motion'],'dragging'); assert.match(card(h).props.style.transform,/79px/); assert.equal(captures,1);
  await card(h).props.onPointerUp({...e,clientX:179}); await h.settle();
  assert.deepEqual(calls.approve,[]); assert.equal(card(h).props['data-motion'],'idle');
});
test('vertical lock and lost capture cancel the gesture with zero decisions', async () => {
 const {h,calls}=await ui(); const target={closest:()=>null}; const e={pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100,target};
 card(h).props.onPointerDown(e); card(h).props.onPointerMove({...e,clientY:112});
 await card(h).props.onPointerUp({...e,clientX:220}); await h.settle(); assert.deepEqual(calls.approve,[]);
 card(h).props.onPointerDown(e); card(h).props.onPointerMove({...e,clientX:180}); await h.settle();
 card(h).props.onLostPointerCapture({...e,currentTarget:target}); await card(h).props.onPointerUp({...e,clientX:220}); await h.settle(); assert.deepEqual(calls.approve,[]);
});

test('touch implicit capture transferring from text to card does not cancel the horizontal decision',async()=>{
 const {h,calls}=await ui(); const child={closest:()=>null},element={closest:()=>null,setPointerCapture(){}};
 const e={pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100,target:child,currentTarget:element};
 card(h).props.onPointerDown(e);card(h).props.onPointerMove({...e,clientX:130});await h.settle();
 card(h).props.onLostPointerCapture({...e});
 await card(h).props.onPointerUp({...e,target:element,clientX:200});await h.settle();assert.equal(calls.approve.length,1);
});

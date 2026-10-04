import test, { before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHarness } from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);
let ContentLibrary, PlannerApp, Content;
before(async () => {
  ({ default: PlannerApp } = await import('../components/planner/app.tsx'));
  ({ Content } = await import('../components/planner/library.tsx'));
  if (existsSync(new URL('../components/planner/content-library.tsx', import.meta.url)))
    ({ ContentLibrary } = await import('../components/planner/content-library.tsx'));
});
const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
const harnesses = [];
afterEach(() => {
  harnesses.splice(0).forEach(h => h.unmount());
  Object.assign(globalThis, original);
});
const timestamp = '2026-10-04T09:00:00.000Z';
const ready = { id: 'ready', title: 'Осенняя подборка', text: 'Текст о квартирах', mediaIds: ['b', 'a'], status: 'READY', sourcePostId: null, createdAt: timestamp, updatedAt: timestamp };
const used = { ...ready, id: 'used', title: 'Использованный материал', text: 'Уже опубликован', status: 'USED', sourcePostId: 'linked' };
const archived = { ...ready, id: 'archived', title: 'Архивный материал', text: 'На потом', status: 'ARCHIVED' };
const media = [
  { id: 'a', name: 'apartments.jpg', type: 'image/jpeg', size: 100, url: '/a.jpg' },
  { id: 'b', name: 'tour.webm', type: 'video/webm', size: 100, url: '/b.webm' },
];
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node) ? node : node.props?.children;
  return [...(predicate(node) ? [node] : []), ...(Array.isArray(children) ? children : [children]).flatMap(child => nodes(child, predicate))];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join('');
}
function button(h, label, scope = h.tree) {
  const matches = nodes(scope, n => typeof n.props?.onClick === 'function' && text(n) === label);
  assert.equal(matches.length, 1, `Expected one actionable ${label}`);
  return matches[0];
}
function card(h, title) {
  const result = nodes(h.tree, n => n.type === 'article' && text(n).includes(title))[0];
  assert.ok(result, `Missing card ${title}`); return result;
}
function field(h, label) {
  const result = nodes(h.tree, n => n.props?.['aria-label'] === label)[0];
  assert.ok(result, `Missing field ${label}`); return result;
}
function ui(props = {}) {
  assert.equal(typeof ContentLibrary, 'function', 'Task 5 ContentLibrary component is missing');
  const state = { items: [ready, used, archived], media, posts: [{ id: 'linked' }], ...props };
  const actual = createHarness(() => ContentLibrary({
    upload: async () => [], saveItem: async () => { throw Error('Unexpected save'); }, deleteItem: async () => {},
    createPublication() {}, openPublication() {}, ...state,
    children: React.createElement(Content, { posts: [], media, query: '', setQuery() {}, create() {}, editPost() {}, openPost() {}, deletePost() {}, duplicatePost() {} }),
  }));
  harnesses.push(actual); actual.render();
  return { h: actual, state };
}
async function click(h, label, scope) { await button(h, label, scope).props.onClick(); await h.settle(); }
async function change(h, label, value) { field(h, label).props.onChange({ target: { value } }); await h.settle(); }
function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }
async function app({ items = [ready, used, archived], mutation, cache = storage(), hash = '#content', scheduled = false } = {}) {
  const handlers = new Map(); const requests = [];
  globalThis.window = { sessionStorage: cache, location: { hash, assign() {} }, history: { replaceState() {} }, scrollTo() {}, confirm: () => true,
    addEventListener: (name, callback) => handlers.set(name, callback), removeEventListener: name => handlers.delete(name) };
  globalThis.document = { hidden: false };
  const post = { id: 'linked', title: null, baseText: 'Linked publication', status: 'DRAFT', targets: [], mediaIds: [], createdAt: timestamp, updatedAt: timestamp };
  if (scheduled) { post.status = 'READY'; post.targets = [{ id: 'target', socialAccountId: 'tg', provider: 'telegram', textOverride: null, scheduledAt: '2099-10-04T09:00:00.000Z', publication: null }]; }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    if (url === '/api/bootstrap') return Response.json({ profile: { id: 'owner', displayName: 'Owner', email: 'fixture@example.test' }, posts: [post], media: media.map(m => ({ id: m.id, originalName: m.name, mimeType: m.type, byteSize: m.size, previewUrl: m.url })), socialAccounts: [], libraryItems: items });
    if (mutation) return mutation(url, init);
    throw Error(`Unexpected endpoint ${url}`);
  };
  const h = createHarness(PlannerApp); harnesses.push(h); await h.settle();
  return { h, requests, handlers, cache, route: async next => { window.location.hash = next; handlers.get('hashchange')(); await h.settle(); } };
}
function library(h) { const node = h.find('ContentLibrary'); assert.ok(node, 'Library workspace must be wired into #content'); return node.props; }
function workspace(parent) {
  const h = createHarness(() => ContentLibrary(library(parent)));
  harnesses.push(h); h.render(); return h;
}
function selectedPanel(h) { return nodes(h.tree, node => node.props?.role === 'tabpanel')[0]?.props.id; }
async function globalSearch(h, query) {
  await change(h, 'Поиск по постам, медиа, хештегам', query);
  field(h, 'Поиск по постам, медиа, хештегам').props.onKeyDown({ key: 'Enter' }); await h.settle();
}

for (const hash of ['#dashboard', '#calendar', '#content']) test(`global Post search Enter from ${hash} shows existing Publications with its query`, async () => {
  const { h } = await app({ hash }); await globalSearch(h, 'Linked');
  const content = workspace(h);
  assert.equal(selectedPanel(content), 'publications-panel');
  const html = renderToStaticMarkup(content.tree);
  assert.ok(html.includes('Linked publication')); assert.ok(html.includes('value="Linked"'));
  assert.equal(window.location.hash, 'content');
});

test('global Post search reopens Publications after selecting Prepared with the same query', async () => {
  const { h, handlers } = await app(); const content = workspace(h);
  await globalSearch(h, 'Linked'); window.location.hash = '#content'; handlers.get('hashchange')(); await h.settle(); content.render();
  assert.equal(selectedPanel(content), 'publications-panel', 'Hash synchronization must preserve explicit search intent');
  await click(content, 'Заготовки'); await h.settle(); content.render(); assert.equal(selectedPanel(content), 'prepared-panel');
  await globalSearch(h, 'Linked'); content.render(); assert.equal(selectedPanel(content), 'publications-panel');
});

test('ordinary Library navigation defaults Prepared after a previous global Post search', async () => {
  const { h, route } = await app(); await globalSearch(h, 'Linked'); const content = workspace(h);
  assert.equal(selectedPanel(content), 'publications-panel');
  h.find('Navigation').props.navigate('content'); await h.settle(); content.render();
  assert.equal(selectedPanel(content), 'prepared-panel', 'Sidebar entry into the current route should retain the ordinary default');
  await globalSearch(h, 'Linked'); content.render(); assert.equal(selectedPanel(content), 'publications-panel');
  await route('#calendar'); await route('#content'); content.render();
  assert.equal(selectedPanel(content), 'prepared-panel', 'Returning through the saved #content route should default Prepared');
});

for (const fails of [false, true]) test(`linked Post deletion acknowledgement=${!fails} controls Library Open action without changing USED copy`, async () => {
  let release;
  const { h, requests } = await app({ mutation: (url, init) => {
    assert.equal(url, '/api/posts/linked'); assert.equal(init.method, 'DELETE');
    return new Promise(resolve => { release = resolve; });
  } });
  const content = workspace(h); await click(content, 'Открыть публикацию', card(content, used.title)); await h.settle();
  assert.equal(h.find('Sheet').props.open, true);
  library(h).children.props.deletePost(library(h).children.props.posts[0]); await h.settle();
  const confirm = h.find('AlertDialogAction'); assert.ok(confirm); confirm.props.onClick(); await h.settle(); content.render();
  assert.ok(button(content, 'Открыть публикацию', card(content, used.title)), 'Unacknowledged deletion must keep the link');
  release(fails ? Response.json({ error: 'Delete rejected' }, { status: 500 }) : new Response(null, { status: 204 }));
  await h.settle(); content.render();
  assert.equal(text(card(content, used.title)).includes('Открыть публикацию'), fails);
  assert.equal(library(h).children.props.posts.length, fails ? 1 : 0);
  assert.equal(h.find('Sheet').props.open, fails);
  assert.deepEqual(library(h).items.find(item => item.id === 'used'), used, 'Keep the server USED copy and provenance cache; derive link availability from Posts');
  assert.equal(text(card(content, used.title)).includes('Создать публикацию'), false);
  assert.ok(button(content, 'Редактировать', card(content, used.title))); assert.ok(button(content, 'Удалить', card(content, used.title)));
  library(h).createPublication(used); await h.settle(); assert.equal(window.location.hash, '#content');
  assert.equal(requests.filter(request => request.init?.method === 'DELETE').length, 1);
  assert.equal(requests.some(request => request.init?.method === 'POST'), false);
});

test('prepared tab defaults and shows persisted card status, date, text and ordered media', () => {
  const { h } = ui(); const html = renderToStaticMarkup(h.tree);
  assert.ok(html.includes('Заготовки')); assert.ok(html.includes('Публикации'));
  assert.ok(html.includes('Осенняя подборка')); assert.ok(html.includes('Текст о квартирах'));
  assert.ok(html.includes('Готово')); assert.ok(html.includes('<time')); assert.ok(html.indexOf('<video src="/b.webm"') < html.indexOf('<img src="/a.jpg"'));
});
test('Publications tab reuses Posts screen with original actions and filters', async () => {
  const { h } = ui(); await click(h, 'Публикации');
  assert.ok(h.find('Content')); const html = renderToStaticMarkup(h.tree);
  for (const label of ['Все', 'Черновики', 'В планах', 'Опубликовано', 'Ошибки', 'Поиск контента', 'network-filter', 'Новый пост']) assert.ok(html.includes(label), label);
  const instance = await app(); const props = library(instance.h).children.props;
  for (const action of ['openPost', 'editPost', 'deletePost', 'duplicatePost', 'create']) assert.equal(typeof props[action], 'function');
});
for (const [filter, titles] of [['Все', ['Осенняя подборка', 'Использованный материал', 'Архивный материал']], ['Готовые', ['Осенняя подборка']], ['Использованные', ['Использованный материал']], ['Архив', ['Архивный материал']]]) {
  test(`Library ${filter} filter selects matching server statuses`, async () => {
    const { h } = ui(); await click(h, filter);
    assert.deepEqual(nodes(h.tree, n => n.type === 'article').map(n => nodes(n, e => e.type === 'h2').map(text)[0]), titles);
  });
}
for (const query of ['ОСЕННЯЯ', 'КВАРТИРАХ', 'APARTMENTS.JPG']) {
  test(`Library search matches ${query} across title/text/media filename`, async () => {
    const { h } = ui(); await change(h, 'Поиск заготовок', query);
    assert.ok(text(h.tree).includes('Осенняя подборка'));
    if (query !== 'APARTMENTS.JPG') assert.equal(text(h.tree).includes('Использованный материал'), false);
  });
}
test('READY, USED and ARCHIVED expose only permitted actions', () => {
  const { h } = ui();
  assert.ok(button(h, 'Создать публикацию', card(h, ready.title)));
  assert.ok(button(h, 'Архивировать', card(h, ready.title)));
  assert.ok(button(h, 'Открыть публикацию', card(h, used.title)));
  assert.equal(text(card(h, used.title)).includes('Создать публикацию'), false);
  assert.equal(text(card(h, used.title)).includes('Архивировать'), false);
  assert.ok(button(h, 'Вернуть из архива', card(h, archived.title)));
  assert.equal(text(card(h, archived.title)).includes('Создать публикацию'), false);
});
test('editor validates empty content and bounds, supports cancel', async () => {
  let writes = 0; const { h } = ui({ saveItem: async () => { writes++; } });
  await click(h, 'Новая заготовка'); await click(h, 'Сохранить');
  assert.equal(writes, 0); assert.ok(nodes(h.tree, n => n.props?.role === 'alert').length);
  assert.equal(field(h, 'Название заготовки').props.maxLength, 200);
  assert.equal(field(h, 'Текст заготовки').props.maxLength, 20000);
  await change(h, 'Текст заготовки', 'x'.repeat(20001)); await click(h, 'Сохранить'); assert.equal(writes, 0);
  await click(h, 'Отмена'); assert.equal(nodes(h.tree, n => n.props?.['aria-label'] === 'Текст заготовки').length, 0);
});
test('editor selection/upload preserves media ID order with shared assets and media-only save', async () => {
  let submitted; const uploaded = { id: 'c', name: 'new.png', type: 'image/png', url: '/c.png', size: 20 };
  const { h } = ui({ upload: async files => { assert.equal(files[0].name, 'new.png'); return [uploaded]; }, saveItem: async input => { submitted = input; } });
  await click(h, 'Новая заготовка');
  await click(h, 'tour.webm'); await click(h, 'apartments.jpg');
  const input = nodes(h.tree, n => n.type === 'input' && n.props?.type === 'file')[0];
  await input.props.onChange({ target: { files: [{ name: 'new.png' }], value: 'selected' } }); await h.settle();
  await click(h, 'Сохранить'); assert.deepEqual(submitted.mediaIds, ['b', 'a', 'c']); assert.equal(submitted.text, '');
});
test('Library upload snapshots a native-style live FileList before input reset invalidates it', async () => {
  const selectedFile = { name: 'smoke.png' }; let selected = [selectedFile]; let observed; let submitted;
  const liveFiles = { get length() { return selected.length; }, [Symbol.iterator]() { return selected[Symbol.iterator](); } };
  const target = { files: liveFiles, get value() { return selected.length ? 'smoke.png' : ''; }, set value(value) { if (value === '') selected = []; } };
  const { h } = ui({ upload: async files => { observed = Array.from(files).map(file => file.name); return observed.map(name => ({ id: 'native-upload', name, type: 'image/png', size: 100, url: '/native.png' })); }, saveItem: async input => { submitted = input; } });
  await click(h, 'Новая заготовка');
  const input = nodes(h.tree, node => node.type === 'input' && node.props?.type === 'file')[0];
  await input.props.onChange({ target }); await h.settle();
  assert.equal(liveFiles.length, 0, 'The chooser reset invalidated the live selection');
  assert.deepEqual(observed, ['smoke.png'], 'Upload must receive the frozen selected file despite input reset');
  assert.equal(target.value, ''); await click(h, 'Сохранить'); assert.deepEqual(submitted.mediaIds, ['native-upload']);
});
test('media selection stops at twenty assets', async () => {
  const assets = Array.from({ length: 21 }, (_, index) => ({ ...media[0], id: String(index), name: `file-${index}.jpg` }));
  let submitted; const { h } = ui({ media: assets, saveItem: async input => { submitted = input; } });
  await click(h, 'Новая заготовка'); for (const asset of assets) await click(h, asset.name);
  await click(h, 'Сохранить'); assert.equal(submitted.mediaIds.length, 20);
});
test('failed editor save keeps entered content and displays the server error', async () => {
  const { h } = ui({ saveItem: async () => { throw Error('Server rejected change'); } });
  await click(h, 'Редактировать', card(h, ready.title)); await change(h, 'Текст заготовки', 'Keep me'); await click(h, 'Сохранить');
  assert.equal(field(h, 'Текст заготовки').props.value, 'Keep me'); assert.ok(text(h.tree).includes('Server rejected change'));
});
test('USED editor sends permitted READY status while server USED response remains authoritative', async () => {
  let submitted; const { h } = ui({ saveItem: async (input, id) => { submitted = { input, id }; } });
  await click(h, 'Редактировать', card(h, used.title)); await change(h, 'Название заготовки', 'Edited used'); await click(h, 'Сохранить');
  assert.equal(submitted.id, 'used'); assert.equal(submitted.input.status, 'READY');
  assert.equal(text(card(h, used.title)).includes('Создать публикацию'), false);
});
test('archive/restore and confirmed deletion use their item IDs; failures remain visible', async () => {
  const operations = []; const { h } = ui({ saveItem: async (input, id) => { operations.push([id, input.status]); }, deleteItem: async id => { operations.push(['delete', id]); throw Error('Cannot delete'); } });
  await click(h, 'Архивировать', card(h, ready.title)); await click(h, 'Вернуть из архива', card(h, archived.title));
  assert.deepEqual(operations, [['ready', 'ARCHIVED'], ['archived', 'READY']]);
  await click(h, 'Удалить', card(h, ready.title)); assert.equal(operations.length, 2);
  await click(h, 'Подтвердить удаление'); assert.deepEqual(operations[2], ['delete', 'ready']);
  assert.ok(text(h.tree).includes('Cannot delete')); assert.ok(card(h, ready.title));
});
test('USED without a linked Post offers no publication action', () => {
  const { h } = ui({ items: [{ ...used, sourcePostId: null }] });
  assert.equal(text(h.tree).includes('Открыть публикацию'), false);
  assert.equal(text(h.tree).includes('Создать публикацию'), false);
});
test('create updates Planner data only after server acknowledgement', async () => {
  let resolve; const { h } = await app({ mutation: () => new Promise(done => { resolve = done; }) });
  const pending = library(h).saveItem({ title: 'New', text: 'New text', mediaIds: [] }); await h.settle();
  assert.equal(library(h).items.length, 3);
  resolve(Response.json({ ...ready, id: 'new', title: 'New', text: 'New text' }, { status: 201 })); await pending; await h.settle();
  assert.equal(library(h).items.length, 4); assert.equal(library(h).items[0].id, 'new');
});
test('failed create/edit/delete leave Planner Library data intact', async () => {
  const { h } = await app({ mutation: async () => Response.json({ error: 'Server unavailable' }, { status: 500 }) });
  for (const operation of [() => library(h).saveItem({ text: 'New', mediaIds: [] }), () => library(h).saveItem({ ...ready, status: 'READY', text: 'Edited' }, 'ready'), () => library(h).deleteItem('ready')]) {
    await assert.rejects(operation, /Server unavailable/); await h.settle(); assert.deepEqual(library(h).items, [ready, used, archived]);
  }
});
test('edit/archive/restore/delete render acknowledged server state', async () => {
  const { h, requests } = await app({ mutation: async (url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ ...ready, ...JSON.parse(init.body) }) });
  await library(h).saveItem({ title: 'Updated', text: 'Updated body', mediaIds: ['a'], status: 'READY' }, 'ready'); await h.settle();
  assert.equal(library(h).items.find(i => i.id === 'ready').title, 'Updated');
  await library(h).saveItem({ ...ready, status: 'ARCHIVED' }, 'ready'); await h.settle(); assert.equal(library(h).items.find(i => i.id === 'ready').status, 'ARCHIVED');
  await library(h).saveItem({ ...ready, status: 'READY' }, 'ready'); await h.settle(); assert.equal(library(h).items.find(i => i.id === 'ready').status, 'READY');
  await library(h).deleteItem('ready'); await h.settle(); assert.equal(library(h).items.some(i => i.id === 'ready'), false);
  assert.equal(requests.filter(r => r.init?.method === 'DELETE').length, 1);
});
test('USED server response stays USED after editing its Library copy', async () => {
  const { h, requests } = await app({ mutation: async (url, init) => Response.json({ ...used, title: JSON.parse(init.body).title }) });
  await library(h).saveItem({ title: 'Edited copy', text: used.text, mediaIds: used.mediaIds, status: 'READY' }, 'used'); await h.settle();
  const saved = library(h).items.find(item => item.id === 'used'); assert.equal(saved.status, 'USED'); assert.equal(saved.sourcePostId, 'linked');
  assert.equal(JSON.parse(requests[1].init.body).status, 'READY');
  library(h).createPublication(saved); await h.settle(); assert.equal(window.location.hash, '#content');
});
test('in-flight bootstrap polling cannot overwrite acknowledged Library mutations with stale items', async () => {
  let poll; globalThis.setInterval = callback => { poll = callback; return 1; }; globalThis.clearInterval = () => {};
  const { h } = await app({ scheduled: true, mutation: async (url, init) => Response.json({ ...ready, title: JSON.parse(init.body).title }) });
  assert.equal(typeof poll, 'function');
  const fetchCurrent = globalThis.fetch; let release;
  globalThis.fetch = (url, init) => url === '/api/bootstrap' ? new Promise(resolve => { release = resolve; }) : fetchCurrent(url, init);
  poll(); await h.settle();
  await library(h).saveItem({ ...ready, status: 'READY', title: 'Acknowledged edit' }, 'ready'); await h.settle();
  release(Response.json({ posts: [], socialAccounts: [], libraryItems: [ready, used, archived] })); await h.settle();
  assert.equal(library(h).items.find(item => item.id === 'ready').title, 'Acknowledged edit');
  assert.equal(h.find('Content').props.posts.length, 0, 'Post status polling should still apply');
});
test('READY opens an unsaved Composer with source and ordered references, without POST', async () => {
  const { h, requests } = await app(); library(h).createPublication(ready); await h.settle();
  const draft = h.composer().draft;
  assert.equal(draft.id, ''); assert.equal(draft.text, ready.text); assert.deepEqual(draft.mediaIds, ['b', 'a']);
  assert.equal(draft.sourceLibraryItemId, 'ready'); assert.deepEqual(draft.networks, ['telegram']); assert.equal(draft.time, '10:00'); assert.match(draft.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(requests.length, 1); assert.equal(window.location.hash, 'create');
});
test('dirty Composer guard protects replacement and USED/ARCHIVED cannot convert', async () => {
  const { h, route } = await app(); await route('#create'); h.composer().setDraft(current => ({ ...current, text: 'Unsaved work' })); await h.settle(); await route('#content');
  let confirmations = 0; window.confirm = () => { confirmations++; return false; };
  library(h).createPublication(ready); await h.settle(); assert.equal(confirmations, 1); await route('#create'); assert.equal(h.composer().draft.text, 'Unsaved work');
  await route('#content'); library(h).createPublication(used); library(h).createPublication(archived); await h.settle(); assert.equal(window.location.hash, '#content');
});
test('USED opens the linked existing Post', async () => {
  const { h } = await app(); library(h).openPublication('linked'); await h.settle();
  const sheet = h.find('Sheet'); assert.equal(sheet.props.open, true); assert.ok(text(sheet).includes('Linked publication'));
});
test('pending uncertain creation blocks Library replacement without sending another Post', async () => {
  const { h, route, requests } = await app({ mutation: async () => { throw Error('Lost response'); } });
  await route('#create'); h.composer().setDraft(current => ({ ...current, text: 'Original pending draft' })); await h.settle();
  await h.composer().save(h.composer().draft, 'draft'); await h.settle(); await route('#content');
  library(h).createPublication(ready); await h.settle(); assert.equal(window.location.hash, '#content');
  await route('#create'); assert.equal(h.composer().draft.text, 'Original pending draft');
  assert.equal(requests.filter(r => r.url === '/api/posts').length, 1);
});
test('reload bootstrap renders persisted Library items again', async () => {
  const first = await app(); assert.deepEqual(library(first.h).items, [ready, used, archived]); first.h.unmount();
  const second = await app({ cache: first.cache }); assert.deepEqual(library(second.h).items, [ready, used, archived]);
});
for (const refreshFails of [false, true]) test(`source draft save refreshes server Library; refresh failure=${refreshFails} preserves acknowledged creation`, async () => {
  const { h, route, requests } = await app({ mutation: async url => {
    if (url === '/api/posts') return Response.json({ id: 'new-post', title: null, baseText: ready.text, status: 'DRAFT', targets: [], mediaIds: ['b', 'a'], createdAt: timestamp, updatedAt: timestamp });
    if (url === '/api/library-items') return refreshFails ? Response.json({ error: 'Refresh unavailable' }, { status: 500 }) : Response.json([{ ...ready, status: 'USED', sourcePostId: 'new-post' }]);
    throw Error(`Unexpected ${url}`);
  } });
  library(h).createPublication(ready); await h.settle(); await h.composer().save(h.composer().draft, 'draft'); await h.settle();
  assert.equal(requests.filter(r => r.url === '/api/library-items').length, 1);
  await route('#content'); assert.ok(h.find('Content').props.posts.some(p => p.id === 'new-post'));
  if (!refreshFails) assert.equal(library(h).items[0].status, 'USED');
  else assert.equal(library(h).items[0].status, 'READY');
  await route('#create'); assert.equal(h.composer().draft.text, '');
});
for (const refetchFails of [false, true]) test(`source refresh reconciles a concurrent different-item edit; refetch failure=${refetchFails} preserves Post acknowledgement`, async () => {
  let release; let listCalls = 0;
  const differentItem = { ...archived, title: 'Concurrent acknowledged edit' };
  const consumed = { ...ready, status: 'USED', sourcePostId: 'created-source-post' };
  const { h, route, cache, requests } = await app({ mutation: async (url, init) => {
    if (url === '/api/posts') return Response.json({ id: 'created-source-post', title: null, baseText: ready.text, status: 'DRAFT', targets: [], mediaIds: ['b', 'a'], createdAt: timestamp, updatedAt: timestamp });
    if (url === '/api/library-items/archived') return Response.json({ ...archived, ...JSON.parse(init.body) });
    if (url === '/api/library-items') {
      listCalls++;
      if (listCalls === 1) return new Promise(resolve => { release = resolve; });
      return refetchFails ? Response.json({ error: 'Refetch unavailable' }, { status: 500 }) : Response.json([consumed, used, differentItem]);
    }
    throw Error(`Unexpected ${url}`);
  } });
  library(h).createPublication(ready); await h.settle();
  const saving = h.composer().save(h.composer().draft, 'draft'); await h.settle();
  assert.equal(typeof release, 'function');
  await route('#content');
  await library(h).saveItem({ title: differentItem.title, text: archived.text, mediaIds: archived.mediaIds, status: 'ARCHIVED' }, 'archived'); await h.settle();
  release(Response.json([consumed, used, archived])); await saving; await h.settle(); await route('#content');
  assert.equal(listCalls, 2, 'Revision mismatch must fetch a current authoritative Library list');
  assert.equal(library(h).items.find(item => item.id === 'archived').title, 'Concurrent acknowledged edit');
  if (!refetchFails) {
    const source = library(h).items.find(item => item.id === 'ready'); assert.equal(source.status, 'USED'); assert.equal(source.sourcePostId, 'created-source-post');
  }
  assert.ok(h.find('Content').props.posts.some(post => post.id === 'created-source-post'));
  assert.equal(requests.filter(request => request.url === '/api/posts').length, 1);
  assert.equal(cache.getItem('planly:pending-create:v1:owner'), null);
  await route('#create'); assert.equal(h.composer().draft.text, '');
});

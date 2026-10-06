// Disposable actual PR17 App/Library callback evidence; server commits here are
// modeled, and native persistence is proved separately by the main-based suite.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, cleanup, item } from '../../tests/helpers/library-editor-fixture.mjs';
afterEach(cleanup);
async function open(value) { await value.settle(); await value.open(); await value.change('library-title', ' Original '); await value.change('library-text', ' Original copy '); }
async function save(value) { value.button('Сохранить').props.onClick(); await value.settle(); }
function boundary({ failBeforeCommit = false } = {}) {
  const rows = []; let attempts = 0;
  const mutation = request => {
    assert.equal(request.method, 'POST'); assert.equal(request.url, '/api/library-items');
    if (++attempts === 1 && failBeforeCommit) throw Error('CR06 precommit failure');
    const created = { ...item(`created-${rows.length + 1}`), ...request.body }; rows.push(created);
    if (attempts === 1) return new Response(new ReadableStream({ start(controller) { controller.error(Error('CR06 committed response lost')); } }), { status: 201 });
    return Response.json(created);
  };
  return { rows, mutation };
}
for (const continuity of ['same mount', 'navigation/remount', 'same-tab App reload']) test(`CR06 DECLARED RED: PR17 ${continuity} explicit retry must preserve one committed creation`, async () => {
  const server = boundary(); let value = fixture({ items: server.rows, mutation: server.mutation }); await open(value);
  const before = value.cached(); await save(value);
  assert.equal(server.rows.length, 1, 'modeled server committed before response loss');
  assert.match(value.control().error, /committed response lost/);
  assert.equal(value.cached().token, before.token); assert.equal(value.control().editor.id, undefined);
  assert.equal(value.requests.length, 1); assert.equal(value.control().busy, false);
  if (continuity === 'navigation/remount') { await value.navigate('calendar'); await value.navigate('content'); }
  if (continuity === 'same-tab App reload') {
    const cache = value.cache; value.unmount(); value = fixture({ cache, items: server.rows, mutation: server.mutation }); await value.settle();
    assert.equal(value.props().items[0].id, 'created-1', 'bootstrap already sees the committed item');
  }
  assert.equal(value.cached().token, before.token); assert.equal(value.field('library-text').props.value, ' Original copy ');
  assert.equal(value.control().editor.id, undefined, 'no guessed ID from matching bootstrap item');
  const countBeforeRetry = server.rows.length; await value.settle(); assert.equal(server.rows.length, countBeforeRetry, 'no automatic retry');
  await save(value); assert.equal(value.requests.at(-1).method, 'POST');
  assert.equal(server.rows.length, 1, `CR06 ${continuity}: explicit retry committed ${server.rows.length} items`);
});
test('CR06 PR17 control: failure before commit then explicit retry creates one item', async () => {
  const server = boundary({ failBeforeCommit: true }), value = fixture({ items: server.rows, mutation: server.mutation }); await open(value); await save(value);
  assert.equal(server.rows.length, 0); assert.match(value.control().error, /precommit/);
  await value.navigate('calendar'); await value.navigate('content'); await save(value);
  assert.equal(server.rows.length, 1); assert.equal(value.requests.length, 2); assert.equal(value.cached(), null);
});
test('CR06 PR17 observation: edited title/text/media after ambiguous response form a changed POST', async () => {
  const server = boundary(), value = fixture({ items: server.rows, mutation: server.mutation }); await open(value); await save(value);
  const token = value.cached().token;
  await value.change('library-title', 'Changed'); await value.change('library-text', 'Changed copy');
  value.button('B.png').props.onClick(); await value.settle(); value.button('A.png').props.onClick(); await value.settle();
  assert.equal(value.cached().token, token); await save(value);
  assert.equal(server.rows.length, 2); assert.equal(server.rows[0].text, 'Original copy'); assert.equal(server.rows[1].text, 'Changed copy');
  assert.deepEqual(server.rows[1].mediaIds, ['B', 'A']); assert.equal(value.cached(), null);
});
test('CR06 PR17 control: intentional second editor with identical content creates a second item', async () => {
  const rows = [], value = fixture({ items: rows, mutation: request => { const saved = { ...item(`created-${rows.length + 1}`), ...request.body }; rows.push(saved); return Response.json(saved); } });
  await open(value); const firstToken = value.cached().token; await save(value); assert.equal(value.cached(), null);
  await value.open(); await value.change('library-title', ' Original '); await value.change('library-text', ' Original copy ');
  assert.notEqual(value.cached().token, firstToken); await save(value);
  assert.equal(rows.length, 2); assert.equal(rows[0].text, rows[1].text);
});
test('CR06 PR17 control: ambiguous owner A recovery is not loaded for B; returning A restores raw work without POST', async () => {
  const server = boundary(), first = fixture({ items: server.rows, mutation: server.mutation }); await open(first); await save(first);
  const before = first.cached(); first.unmount();
  const other = fixture({ cache: first.cache, owner: 'other' }); await other.settle();
  assert.equal(other.field('library-text'), null); assert.deepEqual(other.cached('owner'), before); assert.equal(other.requests.length, 0);
  other.unmount(); const returned = fixture({ cache: first.cache, items: server.rows }); await returned.settle();
  assert.equal(returned.field('library-text').props.value, ' Original copy '); assert.equal(returned.requests.length, 0);
  assert.equal(returned.cached().token, before.token); assert.equal(returned.control().editor.id, undefined);
});

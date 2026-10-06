// Actual App callbacks; HTTP commit/loss is modeled here, native API tests prove DB commit.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, cleanup, item, deferred, libraryKey } from './helpers/library-editor-fixture.mjs';
afterEach(cleanup);
const attemptKey = owner => `planly:library-create:v1:${owner}`;
const attempt = value => JSON.parse(value.cache.getItem(attemptKey(value.snapshot.profile.id)) ?? 'null');
async function open(value, text = ' Original ') { await value.settle(); await value.open(); await value.change('library-text', text); }
async function save(value) { value.button('Сохранить').props.onClick(); await value.settle(); }
function server({ lose = true, changed = false } = {}) {
  const mappings = new Map(), rows = []; let loss = lose;
  return { rows, mutation(request) {
    if (request.method === 'PATCH') { const current = rows.find(row => row.id === request.url.split('/').at(-1)); Object.assign(current, request.body); return Response.json(current); }
    const key = request.headers.get('idempotency-key');
    let saved = key && mappings.get(key);
    if (!saved) { saved = { ...item(`created-${rows.length + 1}`), ...request.body }; rows.push(saved); if (key) mappings.set(key, saved); }
    if (loss) { loss = false; throw Error('Committed response lost'); }
    return Response.json(changed ? { ...saved, text: 'Server changed', status: 'USED', sourcePostId: 'post' } : saved);
  } };
}
test('Ambiguous create explicit retry keeps durable key and frozen payload; no hydration dispatch', async () => {
  const boundary = server(), value = fixture({ items: boundary.rows, mutation: boundary.mutation }); await open(value); await save(value);
  const frozen = attempt(value); assert.ok(frozen); assert.notEqual(frozen.creationKey, frozen.editorToken);
  await value.navigate('calendar'); await value.navigate('content'); assert.equal(value.requests.length, 1);
  await save(value); assert.equal(boundary.rows.length, 1); assert.equal(value.requests.length, 2);
  assert.equal(value.requests[1].headers.get('idempotency-key'), frozen.creationKey);
  assert.deepEqual(value.requests[1].body, value.requests[0].body); assert.equal(attempt(value), null); assert.equal(value.cached(), null);
});
test('Reload and newer raw resolve original once, attach ID then separate PATCH latest ordered content', async () => {
  const boundary = server(), first = fixture({ items: boundary.rows, mutation: boundary.mutation }); await open(first); await save(first);
  const frozen = attempt(first); first.unmount(); const value = fixture({ cache: first.cache, items: boundary.rows, mutation: boundary.mutation }); await value.settle();
  assert.equal(value.requests.length, 0); assert.equal(value.control().editor.id, undefined);
  await value.change('library-title', ' New title '); await value.change('library-text', ' New text ');
  value.button('B.png').props.onClick(); await value.settle(); value.button('A.png').props.onClick(); await value.settle();
  await save(value); assert.equal(value.requests.length, 1); assert.equal(value.requests[0].method, 'POST');
  assert.equal(value.requests[0].headers.get('idempotency-key'), frozen.creationKey);
  assert.deepEqual(value.requests[0].body, { title: null, text: 'Original', mediaIds: [] });
  assert.equal(value.cached().editor.id, 'created-1'); assert.equal(value.cached().editor.text, ' New text '); assert.deepEqual(value.cached().editor.mediaIds, ['B','A']);
  await save(value); assert.equal(value.requests[1].method, 'PATCH'); assert.equal(value.requests[1].body.text, 'New text'); assert.equal(boundary.rows.length, 1);
});
test('Same-normalized newer raw revision and independently edited DTO never discard raw', async () => {
  for (const changed of [false, true]) {
    const pending = deferred(), value = fixture({ mutation: () => pending.promise }); await open(value, ' Original '); await save(value);
    const control = value.control(); control.onChange(current => ({ ...current, text: 'Original  ' })); await value.settle();
    pending.resolve(Response.json({ ...item('ack'), title: null, text: changed ? 'Server changed' : 'Original' })); await value.settle();
    assert.equal(value.cached().editor.text, 'Original  '); assert.equal(value.cached().editor.id, 'ack'); assert.equal(attempt(value), null); value.unmount();
  }
});
for (const failure of ['failWriteKey','silentWriteKey']) test(`${failure} new intent fails closed before POST and raw stays visible`, async () => {
  const value = fixture({ mutation: () => { throw Error('must not dispatch'); } }); await open(value);
  value.cache[failure] = attemptKey('owner'); await save(value); assert.equal(value.requests.length, 0); assert.equal(value.control().editor.text, ' Original '); assert.ok(value.control().error);
});
test('Corrupt/unavailable attempt blocks CREATE but known-item PATCH remains permitted', async () => {
  const value = fixture({ items: [item()], mutation: request => Response.json({ ...item(), ...request.body }) }); await open(value);
  value.cache.setItem(attemptKey('owner'), '{bad'); await save(value); assert.equal(value.requests.length, 0);
  value.control().cancel(); await value.settle(); value.button('Редактировать').props.onClick(); await value.settle();
  await save(value); assert.equal(value.requests[0].method, 'PATCH'); assert.equal(value.cache.getItem(attemptKey('owner')), '{bad');
  const inaccessible = fixture(); await open(inaccessible); inaccessible.cache.failRead = true; await save(inaccessible); assert.equal(inaccessible.requests.length, 0);
});
for (const failure of ['failRemoveKey','silentRemoveKey']) test(`${failure} acknowledgement retains same unresolved key until verified cleanup`, async () => {
  const boundary = server({ lose: false }), value = fixture({ items: boundary.rows, mutation: boundary.mutation }); await open(value);
  value.cache[failure] = attemptKey('owner'); await save(value); const frozen = attempt(value); assert.ok(frozen); assert.ok(value.control().notice);
  await save(value); assert.equal(value.requests[1].headers.get('idempotency-key'), frozen.creationKey); assert.equal(boundary.rows.length, 1);
  value.cache[failure] = ''; await save(value); assert.equal(attempt(value), null); assert.equal(value.requests.length, 3);
});
for (const failure of ['failWriteKey','silentWriteKey','failRemoveKey','silentRemoveKey']) test(`${failure} raw acknowledgement durability cannot authorize attempt cleanup`, async () => {
  const pending = deferred(), value = fixture({ mutation: () => pending.promise }); await open(value); await save(value);
  value.cache[failure] = libraryKey('owner');
  if (failure.includes('Write')) { value.control().onChange(current => ({ ...current, text: 'New raw' })); await value.settle(); }
  pending.resolve(Response.json({ ...item('ack'), title: null, text: 'Original' })); await value.settle();
  assert.ok(attempt(value)); assert.equal(value.control().editor.id, 'ack'); assert.ok(value.control().notice);
});
for (const status of [409,410]) test(`${status} never dispatches a fresh key or PATCH in resolution click`, async () => {
  const value = fixture({ mutation: () => Response.json({ error: 'old result', code: status === 410 ? 'LIBRARY_CREATION_RESULT_DELETED' : 'LIBRARY_CREATION_KEY_CONFLICT' }, { status }) });
  await open(value); await save(value); assert.equal(value.requests.length, 1); assert.equal(value.control().editor.id, undefined); assert.equal(value.cached().editor.text, ' Original ');
  if (status === 409) { assert.ok(attempt(value)); await save(value); assert.equal(value.requests[1].headers.get('idempotency-key'), value.requests[0].headers.get('idempotency-key')); }
  else { assert.equal(attempt(value), null); await save(value); assert.notEqual(value.requests[1].headers.get('idempotency-key'), value.requests[0].headers.get('idempotency-key')); }
});
test('410 failed exact cleanup preserves old key and raw across explicit retries', async () => {
  const value = fixture({ mutation: () => Response.json({ error: 'deleted', code: 'LIBRARY_CREATION_RESULT_DELETED' }, { status:410 }) }); await open(value);
  value.cache.silentRemoveKey = attemptKey('owner'); await save(value); assert.ok(attempt(value)); await save(value);
  assert.equal(value.requests[1].headers.get('idempotency-key'), value.requests[0].headers.get('idempotency-key')); assert.equal(value.control().editor.id, undefined);
});
for (const deleted of [false,true]) test(`Cancel/replacement visibly resolves only old ${deleted ? 'DELETED' : 'CREATED'} intent; next Save independent`, async () => {
  const boundary = server(), value = fixture({ items: boundary.rows, mutation: (request,count) => count === 2 && deleted ? Response.json({ error:'deleted',code:'LIBRARY_CREATION_RESULT_DELETED' },{status:410}) : boundary.mutation(request) });
  await open(value); await save(value); const frozen = attempt(value); value.control().cancel(); await value.settle(); await value.open(); await value.change('library-text','Replacement');
  assert.match(value.errors(), /предыдущ|провер|создани/i); await save(value); assert.equal(value.requests.length, 2);
  assert.equal(value.requests[1].headers.get('idempotency-key'), frozen.creationKey); assert.deepEqual(value.requests[1].body,value.requests[0].body);
  assert.equal(value.control().editor.id, undefined); assert.equal(value.cached().editor.text, 'Replacement'); assert.equal(attempt(value), null);
  await save(value); assert.equal(value.requests.length, 3); assert.notEqual(value.requests[2].headers.get('idempotency-key'),frozen.creationKey);
});
test('Captured first-intent control after cleanup cannot dispatch another create', async () => {
  const boundary = server({lose:false}), value = fixture({items:boundary.rows,mutation:boundary.mutation}); await open(value);
  const old = value.control(), fields = {...old.editor}; await old.save(fields); await value.settle(); await old.save(fields); await value.settle(); assert.equal(value.requests.length,1);
  await value.open(); await value.change('library-text',' Original '); await save(value); assert.equal(boundary.rows.length,2);
  assert.notEqual(value.requests[0].headers.get('idempotency-key'), value.requests[1].headers.get('idempotency-key'));
});
for (const deleted of [false,true]) test(`Existing-item replacement resolves old ${deleted ? 'DELETED' : 'CREATED'} intent before a separate PATCH`, async () => {
  const boundary = server(), value = fixture({ items: [item('existing')], mutation: (request,count) => {
    if (request.method === 'PATCH') return Response.json({ ...item('existing'), ...request.body });
    if (count === 2 && deleted) return Response.json({error:'deleted',code:'LIBRARY_CREATION_RESULT_DELETED'},{status:410});
    return boundary.mutation(request);
  } });
  await open(value); await save(value); const frozen = attempt(value); assert.ok(frozen);
  value.control().cancel(); await value.settle(); value.button('Редактировать').props.onClick(); await value.settle();
  await value.change('library-text','Existing newer work'); const raw = value.cached();
  await save(value);
  assert.equal(value.requests[1].method,'POST','first Save must resolve old intent rather than mutate replacement');
  assert.equal(value.requests[1].headers.get('idempotency-key'),frozen.creationKey); assert.deepEqual(value.requests[1].body,value.requests[0].body);
  assert.deepEqual(value.cached(),raw); assert.equal(value.control().editor.id,'existing'); assert.equal(attempt(value),null);
  await save(value); assert.equal(value.requests[2].method,'PATCH'); assert.equal(value.requests[2].url,'/api/library-items/existing');
  assert.equal(value.requests[2].body.text,'Existing newer work'); assert.equal(value.cached(),null);
});
for (const reject of [false,true]) test(`First-A ${reject?'error':'success'} after A→B→A is quiet and preserves new A lifetime envelope`, async () => {
  const old = deferred(), newer = deferred(), value = fixture({scheduled:true,mutation:(_request,count)=>count===1?old.promise:newer.promise}); await open(value); const oldControl=value.control(); await save(value);
  const frozen=attempt(value); assert.ok(frozen); value.snapshot.profile.id='B'; await value.poll(); await value.open(); await value.change('library-text','B raw'); assert.equal(attempt(value),null);
  value.snapshot.profile.id='owner'; await value.poll(); const before=value.cached(); await oldControl.save({...oldControl.editor}); await save(value);
  if (reject) old.reject(Error('stale')); else old.resolve(Response.json({...item('old'),title:null,text:'Original'})); await value.settle();
  assert.deepEqual(value.cached(),before); assert.deepEqual(attempt(value),frozen); assert.equal(value.control().busy,true); assert.equal(value.control().error,null); assert.equal(value.props().items.some(row=>row.id==='old'),false);
  newer.resolve(Response.json({...item('new'),title:null,text:'Original'})); await value.settle(); assert.equal(value.requests.length,2);
});
test('Silent owner poll and malformed acknowledgement retain identity without automatic retry', async () => {
  const value=fixture({scheduled:true,mutation:()=>Response.json({id:' '})}); await open(value); await save(value); const frozen=attempt(value); assert.ok(frozen);
  await value.poll(); assert.deepEqual(attempt(value),frozen); assert.equal(value.requests.length,1); assert.equal(value.control().editor.id,undefined);
});
test('New raw interleaved with acknowledgement storage write survives; stale raw never permits cleanup', async () => {
  const pending=deferred(),value=fixture({mutation:()=>pending.promise}); await open(value); await save(value);
  // Force known-ID persistence by advancing the raw revision before the reply.
  value.control().onChange(current=>({...current,text:'New'})); await value.settle();
  value.cache.onWrite=(key)=>{ if(key!==libraryKey('owner'))return;value.cache.onWrite=null;value.control().onChange(current=>({...current,text:'Interleaved'})); };
  pending.resolve(Response.json({...item('ack'),title:null,text:'Original'}));await value.settle();
  assert.equal(value.control().editor.text,'Interleaved');assert.equal(value.cached().editor.text,'Interleaved');assert.equal(value.control().editor.id,'ack');assert.ok(attempt(value));
});
test('Definite precommit rejection keeps raw and correction explicitly creates once', async () => {
  const value=fixture({mutation:(request,count)=>count===1?Response.json({error:'Validation failed'},{status:422}):Response.json({...item('ack'),...request.body})});await open(value);await save(value);
  assert.equal(value.control().editor.id,undefined);await value.change('library-text','Corrected');await save(value);assert.equal(value.requests[1].body.text,'Corrected');assert.equal(value.requests.length,2);assert.equal(value.cached(),null);
});

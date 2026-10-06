// Diagnostic only: two declared semantic REDs, before identity representation approval.
// The route, auth, client parser and PostgreSQL are real. Only delivery of the
// first committed HTTP response is deterministically suppressed at fetch.
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { libraryItems, mediaAssets, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { POST } from '../app/api/library-items/route.ts';
import { createLibraryItem as createClientItem } from '../lib/client/planly-api.ts';
import { createLibraryItem, listLibraryItems } from '../lib/server/library-items.ts';
import type { CreateLibraryItemInput } from '../lib/contracts/library.ts';

const owner = 'cr06-owner', other = 'cr06-other';
const input = { title: 'Original', text: 'Original copy', mediaIds: ['cr06-b', 'cr06-a'] };
const originalFetch = globalThis.fetch;
let session = '';
function request(body: unknown, authenticated = true) {
  return new Request('http://planly.test/api/library-items', { method: 'POST', headers: {
    'content-type': 'application/json', ...(authenticated ? { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(session)}` } : {}),
  }, body: JSON.stringify(body) });
}
async function rows() { return getDb().select().from(libraryItems).where(eq(libraryItems.userId, owner)); }
function bridge(loseFirst = false) {
  let count = 0;
  const sent: { body: unknown; headers: HeadersInit | undefined }[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/library-items'); assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body)); sent.push({ body, headers: init?.headers });
    const ordinal = ++count;
    const response = await POST(request(body));
    if (loseFirst && ordinal === 1) {
      assert.equal(response.status, 201, 'first route committed successfully');
      assert.equal((await rows()).length, 1, 'commit is visible before transport failure');
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error('CR06 committed response lost')); } }), { status: 201 });
    }
    return response;
  };
  return sent;
}
beforeEach(async () => {
  const db = getDb(); await db.delete(users).where(inArray(users.id, [owner, other]));
  await db.insert(users).values([
    { id: owner, email: process.env.OWNER_EMAIL ?? 'owner@example.test', displayName: 'CR06' },
    { id: other, email: 'cr06-other@example.test', displayName: 'Other' },
  ]);
  await db.insert(mediaAssets).values(['cr06-a', 'cr06-b'].map(id => ({ id, userId: owner,
    storageKey: id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 1, checksum: id })));
  session = await createOwnerSession(owner);
});
afterEach(() => { globalThis.fetch = originalFetch; });
after(closeDb);

test('CR06 DECLARED RED: committed lost response then one explicit client retry must not create another item', async () => {
  const sent = bridge(true);
  await assert.rejects(() => createClientItem(input), /committed response lost/);
  const [committed] = await rows(); assert.ok(committed);
  const retry = await createClientItem(input);
  assert.deepEqual(sent[0], sent[1], 'current retry transport carries no distinct logical-attempt identity');
  const persisted = await listLibraryItems(owner);
  assert.equal(persisted.length, 1, `CR06 duplicate after reached commit: ${persisted.length} rows; retry has different ID=${retry.id !== committed.id}`);
  assert.equal(retry.id, committed.id);
});

test('CR06 DECLARED RED: concurrent repetitions of one logical client attempt must persist one item', async () => {
  const sent = bridge();
  const results = await Promise.all([createClientItem(input), createClientItem(input), createClientItem(input)]);
  assert.equal(sent.length, 3); assert.deepEqual(sent[0], sent[1]);
  const persisted = await rows();
  assert.equal(persisted.length, 1, `CR06 concurrent duplicate: ${persisted.length} rows; ${new Set(results.map(item => item.id)).size} response IDs`);
});

test('CR06 control: rejected precommit request leaves zero rows; corrected explicit retry creates one', async () => {
  const rejected = await POST(request({ ...input, mediaIds: ['missing'] }));
  assert.equal(rejected.status, 404); assert.equal((await rows()).length, 0);
  const accepted = await POST(request(input)); assert.equal(accepted.status, 201);
  const created = await accepted.json(); assert.equal((await rows()).length, 1);
  assert.deepEqual((await listLibraryItems(owner))[0].mediaIds, input.mediaIds);
  assert.equal(created.status, 'READY'); assert.equal(created.sourcePostId, null);
});

test('CR06 control: two intentionally separate identical creations remain permitted', async () => {
  const first = await createLibraryItem(owner, input), second = await createLibraryItem(owner, input);
  assert.notEqual(first.id, second.id); assert.equal((await rows()).length, 2);
});

test('CR06 observation: edit after committed lost response currently creates a second independent item', async () => {
  bridge(true); await assert.rejects(() => createClientItem(input), /committed response lost/);
  const changed: CreateLibraryItemInput = { title: 'Changed', text: 'Changed copy', mediaIds: [...input.mediaIds].reverse() };
  const second = await createClientItem(changed);
  const persisted = await listLibraryItems(owner);
  assert.equal(persisted.length, 2); assert.ok(persisted.some(item => item.title === 'Original' && item.text === 'Original copy'));
  assert.equal(second.text, 'Changed copy'); assert.deepEqual(second.mediaIds, changed.mediaIds);
});

test('CR06 control: equal content for distinct owners is isolated; foreign media fails atomically', async () => {
  const body = { text: 'Same intentional content', mediaIds: [] };
  const first = await createLibraryItem(owner, body), second = await createLibraryItem(other, body);
  assert.notEqual(first.id, second.id);
  assert.deepEqual((await listLibraryItems(owner)).map(item => item.id), [first.id]);
  assert.deepEqual((await listLibraryItems(other)).map(item => item.id), [second.id]);
  await assert.rejects(() => createLibraryItem(other, input), /not found/i);
  assert.equal((await listLibraryItems(other)).length, 1);
});

test('CR06 control: unauthenticated POST does not create any Library row', async () => {
  assert.equal((await POST(request(input, false))).status, 401); assert.equal((await rows()).length, 0);
});

test('CR06 control: invalid content is rejected before commit', async () => {
  assert.equal((await POST(request({ text: ' ', mediaIds: [] }))).status, 422);
  assert.equal((await rows()).length, 0);
});

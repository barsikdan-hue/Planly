import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createLibraryItem, deleteLibraryItem, listLibraryItems, updateLibraryItem } from '../lib/server/library-items.ts';
import { createPost, deletePost } from '../lib/server/posts.ts';
import type { SavePostInput } from '../lib/contracts/planner.ts';
import type { PublicationQueueChange } from '../lib/server/publications.ts';

const owner = 'library-conversion-owner';
const other = 'library-conversion-other';
const input: SavePostInput = { title: 'Composer title', baseText: 'Composer copy', status: 'READY',
  targets: [{ provider: 'telegram', textOverride: 'Telegram copy', scheduledAt: '2030-01-01T09:00:00Z' }],
  mediaIds: ['conversion-second', 'conversion-first'] };
const noMirror = { mirrorQueue: async () => undefined };
const native = { skip: process.env.PLANLY_TEST_DB_PGLITE === '1' ? 'Native PostgreSQL is required to prove multi-session row locking' : false, timeout: 20_000 };

beforeEach(async () => {
  const db = getDb();
  await db.delete(users);
  await db.insert(users).values([
    { id: owner, email: 'conversion-owner@example.test', displayName: 'Owner' },
    { id: other, email: 'conversion-other@example.test', displayName: 'Other' },
  ]);
  await db.insert(socialAccounts).values({ id: 'conversion-telegram', userId: owner, provider: 'TELEGRAM', displayName: 'Telegram' });
  await db.insert(mediaAssets).values(['conversion-first', 'conversion-second'].map(id => ({
    id, userId: owner, storageKey: id, originalName: `${id}.png`, mimeType: 'image/png', byteSize: 24, checksum: id,
  })));
});
after(closeDb);

async function source(userId = owner) {
  return createLibraryItem(userId, { title: 'Library title', text: 'Library copy', mediaIds: userId === owner ? ['conversion-first'] : [] });
}
async function ownerPosts() { return getDb().select().from(posts).where(eq(posts.userId, owner)); }

test('reading a READY Library source never creates a Post or changes its status', async () => {
  const item = await source();
  assert.deepEqual(await listLibraryItems(owner), [item]);
  assert.deepEqual(await ownerPosts(), []);
  assert.deepEqual(await getDb().select().from(publications), []);
});

test('successful conversion commits one first-class Post and USED source before queue mirroring', async () => {
  const item = await source();
  let mirrors = 0;
  const snapshots: { sourceId: string | null; sourceStatus: string; sourcePostId: string | null;
    postId: string; publicationId: string; changes: PublicationQueueChange[] }[] = [];
  const created = await createPost(owner, input, { sourceLibraryItemId: item.id, mirrorQueue: async changes => {
    mirrors++;
    const [stored] = await ownerPosts();
    const [library] = await listLibraryItems(owner);
    const [publication] = await getDb().select().from(publications);
    snapshots.push({ sourceId: stored.sourceLibraryItemId, sourceStatus: library.status, sourcePostId: library.sourcePostId,
      postId: stored.id, publicationId: publication.id, changes });
  } });
  assert.equal(mirrors, 1);
  const mirrored = snapshots[0];
  assert.ok(mirrored, 'Queue callback must observe committed Post and source records');
  assert.equal(mirrored.sourceId, item.id);
  assert.equal(mirrored.sourceStatus, 'USED');
  assert.equal(mirrored.sourcePostId, mirrored.postId);
  assert.equal(mirrored.changes.length, 1);
  assert.equal(mirrored.changes[0].action, 'enqueue');
  assert.equal(mirrored.publicationId, mirrored.changes[0].publicationId);
  assert.equal(created.baseText, 'Composer copy');
  assert.equal(created.title, 'Composer title');
  assert.equal(created.targets[0].textOverride, 'Telegram copy');
  assert.deepEqual(created.mediaIds, ['conversion-second', 'conversion-first']);
  assert.equal((await ownerPosts()).length, 1);
  assert.equal((await getDb().select().from(mediaAssets)).length, 2, 'Conversion reuses media rows');
  assert.deepEqual((await listLibraryItems(owner))[0].mediaIds, ['conversion-first']);
});

test('ARCHIVED source is rejected without creating a Post or a queue change', async () => {
  const item = await source();
  await updateLibraryItem(owner, item.id, { text: 'archived', mediaIds: [], status: 'ARCHIVED' });
  let mirrors = 0;
  await assert.rejects(() => createPost(owner, input, { sourceLibraryItemId: item.id, mirrorQueue: async () => { mirrors++; } }), /archiv/i);
  assert.equal((await listLibraryItems(owner))[0].status, 'ARCHIVED');
  assert.deepEqual(await ownerPosts(), []);
  assert.equal(mirrors, 0);
});

test('invalid Post relations leave the Library source READY and its creation key reusable', async () => {
  const item = await source();
  const options = { ...noMirror, sourceLibraryItemId: item.id, creationKey: '11111111-1111-4111-8111-111111111111' };
  await assert.rejects(() => createPost(owner, { ...input, mediaIds: ['missing-media'] }, options), /media/i);
  assert.deepEqual(await ownerPosts(), []);
  assert.equal((await listLibraryItems(owner))[0].status, 'READY');
  await createPost(owner, input, options);
  assert.equal((await listLibraryItems(owner))[0].status, 'USED');
});

test('a failure during publication insertion rolls back Post, targets, media and source state together', native, async () => {
  const item = await source();
  const gate = new Client({ connectionString: process.env.DATABASE_URL });
  await gate.connect();
  let mirrors = 0;
  try {
    await gate.query(`CREATE FUNCTION conversion_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id = 'library-conversion-owner' THEN RAISE EXCEPTION 'conversion test publication failure'; END IF; RETURN NEW; END $$`);
    await gate.query('CREATE TRIGGER conversion_test_fail BEFORE INSERT ON publications FOR EACH ROW EXECUTE FUNCTION conversion_test_fail()');
    await assert.rejects(() => createPost(owner, input, { sourceLibraryItemId: item.id, mirrorQueue: async () => { mirrors++; } }));
    assert.deepEqual(await ownerPosts(), []);
    assert.deepEqual(await getDb().select().from(postTargets), []);
    assert.deepEqual(await getDb().select().from(postMedia), []);
    assert.deepEqual(await getDb().select().from(publications), []);
    assert.equal((await listLibraryItems(owner))[0].status, 'READY');
    assert.equal(mirrors, 0);
  } finally {
    await gate.query('DROP TRIGGER IF EXISTS conversion_test_fail ON publications');
    await gate.query('DROP FUNCTION IF EXISTS conversion_test_fail()');
    await gate.end();
  }
});

test('USED source resolves the surviving Post and does not reconcile or mirror again', async () => {
  const item = await source();
  let mirrors = 0;
  const options = { sourceLibraryItemId: item.id, mirrorQueue: async () => { mirrors++; } };
  const first = await createPost(owner, input, options);
  const history = await getDb().select().from(publications);
  await updateLibraryItem(owner, item.id, { text: 'Edited library copy', mediaIds: [], status: 'READY' });
  const replay = await createPost(owner, { ...input, baseText: 'Another draft', targets: [] }, options);
  assert.equal(replay.id, first.id);
  assert.equal(replay.baseText, 'Composer copy');
  assert.equal((await listLibraryItems(owner))[0].status, 'USED');
  assert.equal((await ownerPosts()).length, 1);
  assert.deepEqual(await getDb().select().from(publications), history);
  assert.equal(mirrors, 1);
});

test('USED source whose Post was deleted cannot create a second source Post', async () => {
  const item = await source();
  const first = await createPost(owner, input, { ...noMirror, sourceLibraryItemId: item.id });
  await deletePost(owner, first.id);
  await assert.rejects(() => createPost(owner, input, { ...noMirror, sourceLibraryItemId: item.id }), /used|использ/i);
  assert.equal((await listLibraryItems(owner))[0].status, 'USED');
  assert.equal((await listLibraryItems(owner))[0].sourcePostId, null);
  assert.deepEqual(await ownerPosts(), []);
});

test('two concurrent conversions with different keys produce one source Post and one publication', native, async () => {
  const item = await source();
  let mirrors = 0;
  const options = { sourceLibraryItemId: item.id, mirrorQueue: async () => { mirrors++; } };
  const created = await Promise.all([
    createPost(owner, input, { ...options, creationKey: '11111111-1111-4111-8111-111111111111' }),
    createPost(owner, input, { ...options, creationKey: '22222222-2222-4222-8222-222222222222' }),
  ]);
  assert.equal(created[0].id, created[1].id);
  const rows = await ownerPosts();
  assert.equal(rows.length, 1);
  const canonical = rows[0];
  const keys = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  assert.ok(keys.includes(canonical.creationKey!));
  assert.ok(canonical.creationInputHash);
  assert.equal(canonical.sourceLibraryItemId, item.id);
  const history = await getDb().select().from(publications);
  assert.equal(history.length, 1);
  assert.equal((await listLibraryItems(owner))[0].status, 'USED');
  const losingKey = keys.find(value => value !== canonical.creationKey)!;
  const retry = await createPost(owner, input, { ...options, creationKey: losingKey });
  assert.equal(retry.id, created[0].id);
  assert.deepEqual(await ownerPosts(), [canonical]);
  assert.deepEqual(await getDb().select().from(publications), history);
  assert.equal(mirrors, 1);
});

test('concurrent same-key conversion of different sources conflicts and leaves the losing source READY', native, async () => {
  const sources = await Promise.all([source(), source()]);
  let mirrors = 0;
  const results = await Promise.allSettled(sources.map(item => createPost(owner, input, {
    sourceLibraryItemId: item.id, creationKey: '33333333-3333-4333-8333-333333333333',
    mirrorQueue: async () => { mirrors++; },
  })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason.name, 'CreationConflictError');
  const [stored] = await ownerPosts();
  assert.equal((await ownerPosts()).length, 1);
  const items = await listLibraryItems(owner);
  assert.equal(items.find(item => item.id === stored.sourceLibraryItemId)?.status, 'USED');
  assert.equal(items.find(item => item.id !== stored.sourceLibraryItemId)?.status, 'READY');
  assert.equal((await getDb().select().from(publications)).length, 1);
  assert.equal(mirrors, 1);
});

test('a key bound to another source while USED conversion waits must conflict after acquiring the source lock', native, async () => {
  const itemA = await source();
  const itemB = await source();
  const key1 = '11111111-1111-4111-8111-111111111111';
  const key2 = '22222222-2222-4222-8222-222222222222';
  let mirrors = 0;
  const options = { mirrorQueue: async () => { mirrors++; } };
  await createPost(owner, input, { ...options, sourceLibraryItemId: itemA.id, creationKey: key1 });
  const gate = new Client({ connectionString: process.env.DATABASE_URL });
  await gate.connect();
  let waiting: Promise<PromiseSettledResult<unknown>> | undefined;
  try {
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM library_items WHERE id = $1 FOR UPDATE', [itemA.id]);
    const gatePid = (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    waiting = createPost(owner, input, { ...options, sourceLibraryItemId: itemA.id, creationKey: key2 }).then(
      value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }),
    );
    let observed = false;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      await gate.query('SELECT pg_stat_clear_snapshot()');
      const blocked = await gate.query(`SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query ILIKE '%library_items%' AND query ILIKE '%for update%'
          AND $1 = ANY(pg_blocking_pids(pid))`, [gatePid]);
      if (blocked.rows.length) { observed = true; break; }
      await delay(20);
    }
    assert.ok(observed, 'USED lookup must wait on the source row before returning');
    const createdB = await createPost(owner, input, { ...options, sourceLibraryItemId: itemB.id, creationKey: key2 });
    await gate.query('COMMIT');
    const result = await waiting;
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.equal(result.reason.name, 'CreationConflictError');
    const rows = await ownerPosts();
    assert.equal(rows.length, 2);
    assert.equal(rows.find(post => post.sourceLibraryItemId === itemA.id)?.creationKey, key1);
    assert.equal(rows.find(post => post.id === createdB.id)?.creationKey, key2);
    assert.equal(mirrors, 2);
    assert.equal((await getDb().select().from(publications)).length, 2);
  } finally {
    await gate.query('ROLLBACK');
    if (waiting) await waiting;
    await gate.end();
  }
});

// The gate holds the real source row. Each operation must reach SELECT FOR
// UPDATE before release; an FK insert wait cannot satisfy this assertion.
async function orderedRace(id: string, first: () => Promise<unknown>, second: () => Promise<unknown>) {
  const gate = new Client({ connectionString: process.env.DATABASE_URL });
  await gate.connect();
  const running: Promise<PromiseSettledResult<unknown>>[] = [];
  const settle = (operation: () => Promise<unknown>) => operation().then(
    value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }),
  );
  try {
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM library_items WHERE id = $1 FOR UPDATE', [id]);
    const gatePid = (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    for (const [index, operation] of [first, second].entries()) {
      running.push(settle(operation));
      const deadline = Date.now() + 5_000;
      let observed = false;
      while (Date.now() < deadline) {
        await gate.query('SELECT pg_stat_clear_snapshot()');
        const waiting = await gate.query<{ pid: number; blockers: number[] }>(`SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query ILIKE '%library_items%' AND query ILIKE '%for update%'`);
        const byPid = new Map(waiting.rows.map(row => [row.pid, row.blockers]));
        const reachesGate = (pid: number, seen = new Set<number>()): boolean => {
          if (pid === gatePid) return true;
          if (seen.has(pid)) return false;
          seen.add(pid);
          return (byPid.get(pid) ?? []).some(blocker => reachesGate(blocker, new Set(seen)));
        };
        // PostgreSQL's second row waiter can wait on the first waiter's tuple
        // lock rather than directly on the gate transaction. Follow both hops.
        if (waiting.rows.filter(row => reachesGate(row.pid)).length >= index + 1) { observed = true; break; }
        await delay(20);
      }
      assert.ok(observed, `Operation ${index + 1} must wait on the source SELECT FOR UPDATE`);
    }
    await gate.query('COMMIT');
    return await Promise.all(running);
  } finally {
    await gate.query('ROLLBACK');
    await Promise.all(running);
    await gate.end();
  }
}

for (const mutation of ['archive', 'update', 'delete'] as const) {
  for (const conversionFirst of [false, true]) {
    test(`conversion racing ${mutation}: ${conversionFirst ? 'conversion' : mutation} locks first`, native, async () => {
      const item = await source();
      let mirrors = 0;
      const convert = () => createPost(owner, input, { sourceLibraryItemId: item.id, mirrorQueue: async () => { mirrors++; } });
      const mutate = () => mutation === 'delete' ? deleteLibraryItem(owner, item.id) : updateLibraryItem(owner, item.id,
        { text: 'Edited library copy', mediaIds: [], status: mutation === 'archive' ? 'ARCHIVED' : 'READY' });
      const result = await orderedRace(item.id, conversionFirst ? convert : mutate, conversionFirst ? mutate : convert);
      const conversion = result[conversionFirst ? 0 : 1];
      const modification = result[conversionFirst ? 1 : 0];
      assert.equal(modification.status, 'fulfilled');
      const shouldCreate = conversionFirst || mutation === 'update';
      assert.equal(conversion.status, shouldCreate ? 'fulfilled' : 'rejected');
      assert.equal((await ownerPosts()).length, shouldCreate ? 1 : 0);
      assert.equal((await getDb().select().from(publications)).length, shouldCreate ? 1 : 0);
      assert.equal(mirrors, shouldCreate ? 1 : 0);
      const items = await listLibraryItems(owner);
      if (mutation === 'delete') {
        assert.deepEqual(items, []);
        if (shouldCreate) assert.equal((await ownerPosts())[0].sourceLibraryItemId, null);
      } else {
        assert.equal(items[0].status, shouldCreate ? 'USED' : 'ARCHIVED');
        assert.equal(items[0].text, 'Edited library copy');
        if (shouldCreate) {
          assert.equal(items[0].sourcePostId, (await ownerPosts())[0].id);
          assert.equal((await ownerPosts())[0].baseText, 'Composer copy');
        }
      }
    });
  }
}

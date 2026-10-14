import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { closeDb, getDb, getPool } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import type { ConnectorResolver } from '../lib/server/connectors/types.ts';

const a = 'isolation-a', b = 'isolation-b', id = 'isolation-publication';
const now = new Date('2030-01-02T00:00:00Z');
let sends = 0, resolutions = 0, storageReads = 0;
const resolver: ConnectorResolver = provider => {
  resolutions++;
  return { provider, async publish(input) {
    sends++;
    assert.equal(input.destinationId, '-100123');
    assert.equal(input.text, 'private A');
    return { ok: true, remoteId: 'fixture-receipt' };
  } };
};
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  let disposable = false;
  try { const url = new URL(process.env.DATABASE_URL ?? ''); disposable = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/planly_test'; } catch { /* fail closed */ }
  assert.ok(disposable, 'Publication isolation tests require a disposable loopback planly_test database');
  const db = getDb();
  // Match FK order: accounts have a non-cascading reference from post_targets.
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(postMedia);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(mediaAssets);
  await db.delete(users);
  await db.insert(users).values([
    { id: a, email: 'isolation-a@example.test', displayName: 'A' },
    { id: b, email: 'isolation-b@example.test', displayName: 'B' },
  ]);
  await db.insert(socialAccounts).values([
    { id: 'isolation-account-a', userId: a, provider: 'TELEGRAM', providerAccountId: '-100123', displayName: 'A', enabled: true, connectionStatus: 'CONNECTED' },
    { id: 'isolation-account-b', userId: b, provider: 'TELEGRAM', providerAccountId: '-100456', displayName: 'B', enabled: true, connectionStatus: 'CONNECTED' },
  ]);
  await db.insert(posts).values([
    { id: 'isolation-post-a', userId: a, baseText: 'private A', status: 'READY' },
    { id: 'isolation-post-b', userId: b, baseText: 'private B', status: 'READY' },
  ]);
  await db.insert(postTargets).values([
    { id: 'isolation-target-a', postId: 'isolation-post-a', socialAccountId: 'isolation-account-a', scheduledAt: new Date('2030-01-01T00:00:00Z') },
    { id: 'isolation-target-b', postId: 'isolation-post-b', socialAccountId: 'isolation-account-b', scheduledAt: new Date('2030-01-01T00:00:00Z') },
  ]);
  await db.insert(publications).values({
    id, userId: a, postId: 'isolation-post-a', postTargetId: 'isolation-target-a', provider: 'TELEGRAM',
    status: 'SCHEDULED', scheduledAt: new Date('2030-01-01T00:00:00Z'), idempotencyKey: `publication:${id}`,
  });
  sends = 0; resolutions = 0; storageReads = 0;
  // Any attempted object read is counted without allowing external traffic.
  globalThis.fetch = async () => { storageReads++; throw new Error('Fixture forbids external fetch'); };
});
after(async () => { globalThis.fetch = originalFetch; await closeDb(); });

async function row() {
  const [value] = await getDb().select().from(publications).where(eq(publications.id, id));
  return value;
}

async function foreignMedia() {
  await getDb().insert(mediaAssets).values({ id: 'isolation-media-b', userId: b, storageKey: 'users/b/private.png', originalName: 'private.png', mimeType: 'image/png', byteSize: 24, checksum: 'fixture' });
  await getDb().insert(postMedia).values({ postId: 'isolation-post-a', mediaId: 'isolation-media-b', position: 0 });
}

const corruptions = {
  'publication owner': () => getDb().update(publications).set({ userId: b }).where(eq(publications.id, id)),
  'post owner': () => getDb().update(posts).set({ userId: b }).where(eq(posts.id, 'isolation-post-a')),
  'account owner': () => getDb().update(postTargets).set({ socialAccountId: 'isolation-account-b' }).where(eq(postTargets.id, 'isolation-target-a')),
  'target post': () => getDb().update(postTargets).set({ postId: 'isolation-post-b' }).where(eq(postTargets.id, 'isolation-target-a')),
  'publication provider': () => getDb().update(publications).set({ provider: 'MAX' }).where(eq(publications.id, id)),
  'foreign media': foreignMedia,
};

for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`inconsistent ${name} cannot reach storage or provider handoff`, async () => {
    await corrupt();
    const accountsBefore = await getDb().select().from(socialAccounts);
    const postsBefore = await getDb().select().from(posts);
    const result = await processPublication(id, resolver);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.errorType, 'PERMANENT');
    const saved = await row();
    assert.equal(saved.providerErrorCode, 'PUBLICATION_SCOPE_MISMATCH');
    assert.equal(saved.nextRetryAt, null);
    assert.equal(saved.attemptCount, 0);
    assert.equal(resolutions, 0);
    assert.equal(sends, 0);
    assert.equal(storageReads, 0);
    assert.deepEqual(await getDb().select().from(socialAccounts), accountsBefore);
    assert.deepEqual(await getDb().select().from(posts), postsBefore);
  });
}

for (const status of ['PUBLISHED', 'CANCELLED', 'FAILED', 'REQUIRES_RECONNECT'] as const) {
  test(`corrupt graph preserves ${status} history without side effects`, async () => {
    await corruptions['account owner']();
    await getDb().update(publications).set({ status, providerRemoteId: 'retained-receipt', providerErrorCode: 'RETAINED' }).where(eq(publications.id, id));
    const before = await row();
    assert.deepEqual(await processPublication(id, resolver), { status, skipped: true });
    assert.deepEqual(await row(), before);
    assert.equal(resolutions + sends + storageReads, 0);
  });
}

test('corrupt PUBLISHING graph retains ambiguous-delivery diagnosis without changing accounts', async () => {
  await corruptions['account owner']();
  await getDb().update(publications).set({ status: 'PUBLISHING', attemptCount: 1 }).where(eq(publications.id, id));
  const before = await getDb().select().from(socialAccounts);
  assert.equal((await processPublication(id, resolver)).status, 'FAILED');
  assert.equal((await row()).providerErrorCode, 'AMBIGUOUS_DELIVERY');
  assert.equal((await row()).attemptCount, 1);
  assert.equal(resolutions + sends + storageReads, 0);
  assert.deepEqual(await getDb().select().from(socialAccounts), before);
});

test('valid owned graph publishes once across concurrent duplicate claims', async () => {
  const results = await Promise.all([processPublication(id, resolver), processPublication(id, resolver)]);
  assert.equal(sends, 1);
  assert.ok(results.some(result => result.status === 'PUBLISHED'));
  assert.equal((await row()).providerRemoteId, 'fixture-receipt');
  assert.equal((await row()).attemptCount, 1);
});

test('owner-scoped tick leaves another users due publication untouched', async () => {
  await getDb().insert(publications).values({ id: 'isolation-publication-b', userId: b, postId: 'isolation-post-b', postTargetId: 'isolation-target-b', provider: 'TELEGRAM', scheduledAt: new Date('2030-01-01T00:00:00Z'), idempotencyKey: 'publication:isolation-publication-b' });
  const result = await runDuePublications({ userId: a, now, resolveConnector: resolver });
  assert.equal(result.scanned, 1);
  assert.equal(result.published, 1);
  const [other] = await getDb().select().from(publications).where(eq(publications.id, 'isolation-publication-b'));
  assert.equal(other.status, 'SCHEDULED');
  assert.equal(other.attemptCount, 0);
  assert.equal(sends, 1);
});

test('graph changed by a claim-time write is rejected before handoff', async () => {
  const db = getDb();
  // Native trigger creates a deterministic first-read/claim/second-read interleaving.
  await db.execute(sql`CREATE FUNCTION p01_corrupt_after_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id = 'isolation-publication' AND NEW.status = 'PUBLISHING' THEN
      UPDATE post_targets SET social_account_id = 'isolation-account-b' WHERE id = 'isolation-target-a';
    END IF; RETURN NEW; END $$`);
  await db.execute(sql`CREATE TRIGGER p01_claim_interleave AFTER UPDATE ON publications FOR EACH ROW EXECUTE FUNCTION p01_corrupt_after_claim()`);
  try {
    const result = await processPublication(id, resolver);
    assert.equal(result.status, 'FAILED');
    assert.equal((await row()).providerErrorCode, 'PUBLICATION_SCOPE_MISMATCH');
    assert.equal((await row()).attemptCount, 1);
    assert.equal(resolutions + sends + storageReads, 0);
    assert.equal((await getDb().select().from(socialAccounts).where(eq(socialAccounts.id, 'isolation-account-b')))[0].connectionStatus, 'CONNECTED');
  } finally {
    await db.execute(sql`DROP TRIGGER p01_claim_interleave ON publications`);
    await db.execute(sql`DROP FUNCTION p01_corrupt_after_claim()`);
  }
});

test('integrity diagnosis cannot overwrite a concurrently committed terminal receipt', async () => {
  await corruptions['account owner']();
  const client = await getPool().connect();
  let pending: Promise<Awaited<ReturnType<typeof processPublication>>> | undefined;
  try {
    await client.query('BEGIN');
    await client.query("UPDATE publications SET status='PUBLISHED', provider_remote_id='concurrent-receipt' WHERE id=$1", [id]);
    pending = processPublication(id, resolver);
    // The processor sees the old corrupt graph, then waits behind the receipt writer.
    const deadline = Date.now() + 5_000;
    let blocked = false;
    while (Date.now() < deadline) {
      const waiting = await getPool().query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'update \"publications\"%' LIMIT 1");
      if (waiting.rowCount) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(blocked, 'processor reached the publication row lock');
    await client.query('COMMIT');
    assert.deepEqual(await pending, { status: 'PUBLISHED', skipped: true });
    assert.equal((await row()).providerRemoteId, 'concurrent-receipt');
    assert.equal((await row()).providerErrorCode, null);
    assert.equal(resolutions + sends + storageReads, 0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pending?.catch(() => {});
  }
});

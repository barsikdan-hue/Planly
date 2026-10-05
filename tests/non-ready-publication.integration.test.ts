import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, updatePost } from '../lib/server/posts.ts';
import type { PublicationQueueChange } from '../lib/server/publications.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { runDuePublications } from '../lib/server/scheduler/tick.ts';
import type { SavePostInput } from '../lib/contracts/planner.ts';
import type { ConnectorResolver } from '../lib/server/connectors/types.ts';

const owner = 'non-ready-publication-owner';
const due = '2020-01-01T09:00:00.000Z';
let changes: PublicationQueueChange[] = [];
let sends = 0;
const options = { mirrorQueue: async (next: PublicationQueueChange[]) => { changes.push(...next); } };
const resolver: ConnectorResolver = () => ({ provider: 'TELEGRAM', async publish(input) {
  assert.equal(input.text, 'Content awaiting approval');
  sends += 1;
  return { ok: true, remoteId: 'fixture-receipt' };
} });
const input = (status: SavePostInput['status']): SavePostInput => ({
  baseText: 'Content awaiting approval', status, mediaIds: [],
  targets: [{ provider: 'telegram', textOverride: null, scheduledAt: due }],
});

beforeEach(async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, owner));
  await db.insert(users).values({ id: owner, email: 'non-ready@example.test', displayName: 'Safety fixture' });
  await db.insert(socialAccounts).values({ id: 'non-ready-tg', userId: owner,
    provider: 'TELEGRAM', displayName: 'Fixture', providerAccountId: '-100fixture' });
  changes = []; sends = 0;
});
after(async () => {
  await getDb().delete(users).where(eq(users.id, owner));
  await closeDb();
});

for (const status of ['DRAFT', 'ARCHIVED'] as const) {
  test(`${status} with a retained target schedule creates no publication`, async () => {
    const post = await createPost(owner, input(status), options);
    assert.equal(post.status, status);
    assert.equal(post.targets[0]!.scheduledAt, due, 'retain editable target metadata');
    assert.deepEqual(await getDb().select().from(publications).where(eq(publications.postId, post.id)), []);
    assert.deepEqual(changes, []);
    const tick = await runDuePublications({ userId: owner, resolveConnector: resolver });
    assert.equal(tick.published, 0);
    assert.equal(sends, 0);
  });

  test(`READY to ${status} cancels an open publication even when the date is retained`, async () => {
    const post = await createPost(owner, input('READY'), options);
    const [original] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
    changes = [];
    await updatePost(owner, post.id, input(status), options);
    const [row] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
    assert.equal(row!.id, original!.id);
    assert.equal(row!.status, 'CANCELLED');
    assert.deepEqual(changes, [{ publicationId: original!.id, action: 'remove' }]);
    await processPublication(original!.id, resolver);
    assert.equal(sends, 0, 'an already queued job must not send the cancelled post');
  });

  test(`a stale queued ${status} publication is cancelled before connector handoff`, async () => {
    const post = await createPost(owner, input('READY'), options);
    const [row] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
    // Historical inconsistent rows may already exist; exercise the shared
    // processor used by both BullMQ and the free scheduler tick.
    await getDb().update(posts).set({ status }).where(eq(posts.id, post.id));
    await getDb().update(publications).set({ status: 'QUEUED' }).where(eq(publications.id, row!.id));
    const tick = await runDuePublications({ userId: owner, resolveConnector: resolver });
    assert.equal(tick.published, 0);
    assert.equal(sends, 0);
    const [cancelled] = await getDb().select().from(publications).where(eq(publications.id, row!.id));
    assert.equal(cancelled!.status, 'CANCELLED');
    assert.equal(cancelled!.providerRemoteId, null);
  });
}

test('READY retains immediate publication and duplicate protection', async () => {
  const post = await createPost(owner, input('READY'), options);
  const tick = await runDuePublications({ userId: owner, resolveConnector: resolver });
  assert.equal(tick.published, 1);
  const [row] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
  await processPublication(row!.id, resolver);
  assert.equal(sends, 1);
  assert.equal(row!.providerRemoteId, 'fixture-receipt');
});

for (const status of ['PUBLISHED', 'FAILED', 'REQUIRES_RECONNECT', 'PUBLISHING'] as const) {
  test(`non-ready guard preserves protected ${status} history`, async () => {
    const post = await createPost(owner, input('READY'), options);
    const [row] = await getDb().select().from(publications).where(eq(publications.postId, post.id));
    await getDb().update(posts).set({ status: 'DRAFT' }).where(eq(posts.id, post.id));
    await getDb().update(publications).set({ status,
      providerRemoteId: status === 'PUBLISHED' ? 'existing-receipt' : null,
      providerErrorCode: status === 'FAILED' ? 'AMBIGUOUS_DELIVERY' : null,
    }).where(eq(publications.id, row!.id));
    await processPublication(row!.id, resolver);
    const [kept] = await getDb().select().from(publications).where(eq(publications.id, row!.id));
    assert.equal(kept!.status, status === 'PUBLISHING' ? 'FAILED' : status);
    assert.equal(kept!.providerRemoteId, status === 'PUBLISHED' ? 'existing-receipt' : null);
    if (status === 'PUBLISHING' || status === 'FAILED') assert.equal(kept!.providerErrorCode, 'AMBIGUOUS_DELIVERY');
    assert.equal(sends, 0);
  });
}

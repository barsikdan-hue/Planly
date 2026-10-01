import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { createPost, updatePost } from '../lib/server/posts.ts';
import { closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';

const ownerId = 'publication-owner';

async function reset() {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'publication-owner@example.test', displayName: 'Publication Owner' });
  await db.insert(socialAccounts).values({ id: 'publication-tg', userId: ownerId, provider: 'TELEGRAM', displayName: 'Telegram' });
}

before(reset);
beforeEach(reset);
after(async () => {
  await closePublicationQueue();
  await closeRedisConnection();
  await closeDb();
});

test('scheduled target has one durable open publication and repeated save stays idempotent', async () => {
  const created = await createPost(ownerId, {
    baseText: 'scheduled', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  });
  const targetId = created.targets[0]!.id;
  const db = getDb();
  const first = await db.select().from(publications).where(eq(publications.postTargetId, targetId));
  assert.equal(first.length, 1);
  assert.equal(first[0]!.status, 'SCHEDULED');
  assert.equal(first[0]!.scheduledAt?.toISOString(), '2030-01-01T09:00:00.000Z');
  assert.ok(first[0]!.idempotencyKey);

  await updatePost(ownerId, created.id, {
    baseText: 'scheduled edited', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: 'edited', scheduledAt: '2030-01-01T09:00:00.000Z' }],
  });
  const second = await db.select().from(publications).where(eq(publications.postTargetId, targetId));
  assert.equal(second.length, 1);
  assert.equal(second[0]!.id, first[0]!.id);
  assert.equal(second[0]!.idempotencyKey, first[0]!.idempotencyKey);
});

test('rescheduling keeps publication identity and updates its due time', async () => {
  const created = await createPost(ownerId, {
    baseText: 'scheduled', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  });
  const db = getDb();
  const beforeRows = await db.select().from(publications).where(eq(publications.postTargetId, created.targets[0]!.id));
  assert.equal(beforeRows.length, 1);

  const updated = await updatePost(ownerId, created.id, {
    baseText: 'scheduled', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T10:30:00.000Z' }],
  });
  assert.equal(updated.targets[0]!.id, created.targets[0]!.id);
  const afterRows = await db.select().from(publications).where(eq(publications.postTargetId, created.targets[0]!.id));
  assert.equal(afterRows.length, 1);
  assert.equal(afterRows[0]!.id, beforeRows[0]!.id);
  assert.equal(afterRows[0]!.idempotencyKey, beforeRows[0]!.idempotencyKey);
  assert.equal(afterRows[0]!.scheduledAt?.toISOString(), '2030-01-01T10:30:00.000Z');
});

test('removing a target preserves its row and cancels its unexecuted publication', async () => {
  const created = await createPost(ownerId, {
    baseText: 'scheduled', status: 'READY', mediaIds: [],
    targets: [{ provider: 'telegram', textOverride: null, scheduledAt: '2030-01-01T09:00:00.000Z' }],
  });
  const targetId = created.targets[0]!.id;

  const updated = await updatePost(ownerId, created.id, {
    baseText: 'no target now', status: 'DRAFT', mediaIds: [], targets: [],
  });
  assert.deepEqual(updated.targets, []);

  const db = getDb();
  const targetRows = await db.select().from(postTargets).where(eq(postTargets.id, targetId));
  assert.equal(targetRows.length, 1, 'historical PostTarget must remain for Publication FK/history');
  const publicationRows = await db.select().from(publications).where(eq(publications.postTargetId, targetId));
  assert.equal(publicationRows.length, 1);
  assert.equal(publicationRows[0]!.status, 'CANCELLED');
});

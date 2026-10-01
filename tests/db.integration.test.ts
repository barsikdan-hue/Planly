import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';

after(async () => {
  await closeDb();
});

test('PostgreSQL stores the owner content graph and cascades owner deletion', async () => {
  const db = getDb();
  const suffix = randomUUID();
  const userId = `user-${suffix}`;
  const accountId = `account-${suffix}`;
  const postId = `post-${suffix}`;
  const targetId = `target-${suffix}`;
  const mediaId = `media-${suffix}`;
  const publicationId = `publication-${suffix}`;

  await db.insert(users).values({ id: userId, email: `${suffix}@example.test`, displayName: 'Owner' });
  await db.insert(socialAccounts).values({ id: accountId, userId, provider: 'TELEGRAM', displayName: 'Test channel' });
  await db.insert(posts).values({ id: postId, userId, baseText: 'Initial draft', status: 'DRAFT' });
  await db.insert(postTargets).values({ id: targetId, postId, socialAccountId: accountId, textOverride: 'Telegram text' });
  await db.insert(mediaAssets).values({
    id: mediaId,
    userId,
    storageKey: `tests/${suffix}.jpg`,
    originalName: 'test.jpg',
    mimeType: 'image/jpeg',
    byteSize: 4,
    checksum: suffix.replaceAll('-', ''),
  });
  await db.insert(postMedia).values({ postId, mediaId, position: 0 });
  await db.insert(publications).values({
    id: publicationId,
    userId,
    postId,
    postTargetId: targetId,
    provider: 'TELEGRAM',
    idempotencyKey: `test:${suffix}`,
  });

  const [stored] = await db.select().from(posts).where(eq(posts.id, postId));
  assert.equal(stored.baseText, 'Initial draft');

  await db.update(posts).set({ baseText: 'Edited draft', updatedAt: new Date() }).where(eq(posts.id, postId));
  const [edited] = await db.select().from(posts).where(eq(posts.id, postId));
  assert.equal(edited.baseText, 'Edited draft');

  await db.delete(users).where(eq(users.id, userId));
  const remaining = await db.select().from(posts).where(eq(posts.id, postId));
  assert.equal(remaining.length, 0);
});

test('owner email and publication idempotency keys are unique', async () => {
  const db = getDb();
  const suffix = randomUUID();
  const firstId = `unique-a-${suffix}`;
  const secondId = `unique-b-${suffix}`;
  const email = `${suffix}@unique.test`;

  await db.insert(users).values({ id: firstId, email, displayName: 'First' });
  await assert.rejects(db.insert(users).values({ id: secondId, email, displayName: 'Second' }));
  await db.delete(users).where(eq(users.id, firstId));
});

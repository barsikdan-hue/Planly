import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import type { ConnectorResolver, PublishResult, SocialConnector } from '../lib/server/connectors/types.ts';

const ownerId = 'processor-owner';
const publicationId = 'processor-publication';
let publishCalls = 0;
let nextResult: PublishResult;

const connector: SocialConnector = {
  provider: 'TELEGRAM',
  async publish() {
    publishCalls += 1;
    return nextResult;
  },
};
const resolver: ConnectorResolver = () => connector;

async function reset(status: 'SCHEDULED' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' = 'SCHEDULED') {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'processor@example.test', displayName: 'Processor' });
  await db.insert(socialAccounts).values({ id: 'processor-tg', userId: ownerId, provider: 'TELEGRAM', providerAccountId: '-100123', displayName: 'Telegram' });
  await db.insert(posts).values({ id: 'processor-post', userId: ownerId, baseText: 'hello', status: 'READY' });
  await db.insert(postTargets).values({ id: 'processor-target', postId: 'processor-post', socialAccountId: 'processor-tg', active: true, scheduledAt: new Date('2030-01-01T09:00:00Z') });
  await db.insert(publications).values({
    id: publicationId,
    userId: ownerId,
    postId: 'processor-post',
    postTargetId: 'processor-target',
    provider: 'TELEGRAM',
    status,
    scheduledAt: new Date('2030-01-01T09:00:00Z'),
    providerRemoteId: status === 'PUBLISHED' ? 'remote-existing' : null,
    idempotencyKey: `publication:${publicationId}`,
  });
  publishCalls = 0;
  nextResult = { ok: true, remoteId: 'remote-1', remoteUrl: 'https://example.test/remote-1' };
}

before(() => reset());
beforeEach(() => reset());
after(closeDb);

test('successful publish stores remote ID and becomes PUBLISHED', async () => {
  const result = await processPublication(publicationId, resolver);
  assert.equal(result.status, 'PUBLISHED');
  assert.equal(publishCalls, 1);
  const [row] = await getDb().select().from(publications).where(eq(publications.id, publicationId));
  assert.equal(row?.providerRemoteId, 'remote-1');
  assert.equal(row?.status, 'PUBLISHED');
  assert.equal(row?.attemptCount, 1);
});

test('duplicate delivery after PUBLISHED does not call connector again', async () => {
  await reset('PUBLISHED');
  const result = await processPublication(publicationId, resolver);
  assert.equal(result.status, 'PUBLISHED');
  assert.equal(result.skipped, true);
  assert.equal(publishCalls, 0);
});

for (const errorType of ['TEMPORARY', 'AUTH', 'VALIDATION', 'PERMANENT'] as const) {
  test(`${errorType} connector failure is normalized without fake success`, async () => {
    nextResult = { ok: false, errorType, code: `${errorType}_CODE`, message: `${errorType} message` };
    const result = await processPublication(publicationId, resolver);
    const [row] = await getDb().select().from(publications).where(eq(publications.id, publicationId));
    const expected = errorType === 'AUTH' ? 'REQUIRES_RECONNECT' : 'FAILED';
    assert.equal(result.status, expected);
    assert.equal(row?.status, expected);
    assert.equal(row?.normalizedErrorType, errorType);
    assert.equal(row?.providerRemoteId, null);
  });
}

test('successful connector result without remote ID is rejected', async () => {
  nextResult = { ok: true, remoteId: '' };
  const result = await processPublication(publicationId, resolver);
  const [row] = await getDb().select().from(publications).where(eq(publications.id, publicationId));
  assert.equal(result.status, 'FAILED');
  assert.equal(row?.normalizedErrorType, 'PERMANENT');
  assert.equal(row?.providerErrorCode, 'MISSING_REMOTE_ID');
});

test('stale PUBLISHING is never blindly sent again', async () => {
  await reset('PUBLISHING');
  const result = await processPublication(publicationId, resolver);
  const [row] = await getDb().select().from(publications).where(eq(publications.id, publicationId));
  assert.equal(publishCalls, 0);
  assert.equal(result.status, 'FAILED');
  assert.equal(row?.normalizedErrorType, 'PERMANENT');
  assert.equal(row?.providerErrorCode, 'AMBIGUOUS_DELIVERY');
});

import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts, users } from '../db/schema.ts';
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
  await db.delete(postMedia);
  await db.delete(mediaAssets);
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


test('processor passes ordered private media bytes to Telegram and stores confirmed ID', async () => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { resetServerEnvForTests } = await import('../lib/server/env.ts');
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!.split('?')[0]);
    response.end(request.url!.includes('second') ? Buffer.from([2, 3]) : Buffer.from([1]));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  Object.assign(process.env, {S3_ENDPOINT:`http://127.0.0.1:${address.port}`, S3_REGION:'us-east-1', S3_BUCKET:'private', S3_ACCESS_KEY_ID:'test', S3_SECRET_ACCESS_KEY:'test'});
  resetServerEnvForTests();
  try {
    await getDb().insert(mediaAssets).values([
      {id:'processor-first',userId:ownerId,storageKey:'first',originalName:'first.png',mimeType:'image/png',byteSize:1,checksum:'a',source:'UPLOAD'},
      {id:'processor-second',userId:ownerId,storageKey:'second',originalName:'second.mp4',mimeType:'video/mp4',byteSize:2,checksum:'b',source:'UPLOAD'},
    ]);
    await getDb().insert(postMedia).values([{postId:'processor-post',mediaId:'processor-second',position:1},{postId:'processor-post',mediaId:'processor-first',position:0}]);
    let received: import('../lib/server/connectors/types.ts').PublishInput | undefined;
    const result = await processPublication(publicationId, () => ({provider:'TELEGRAM',async publish(input) {received=input; return {ok:true,remoteId:'101,102'};}}));
    assert.equal(result.status,'PUBLISHED');
    assert.deepEqual(received?.media?.map(m=>[m.mimeType,[...m.bytes]]),[['image/png',[1]],['video/mp4',[2,3]]]);
    assert.deepEqual(requests,['/private/first','/private/second']);
    const [stored] = await getDb().select().from(publications).where(eq(publications.id,publicationId));
    assert.equal(stored.providerRemoteId,'101,102');
  } finally {server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); resetServerEnvForTests();}
});

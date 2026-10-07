import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { asc, eq, inArray } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, publications, socialAccounts, users } from '../db/schema.ts';
import { ensureOwnerSocialAccounts, listSocialAccounts } from '../lib/server/social-accounts.ts';
import { createPost, listPlannerPosts } from '../lib/server/posts.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import { resetServerEnvForTests } from '../lib/server/env.ts';
import { blankPost, toPublishNowInput } from '../lib/planner.ts';
import type { SavePostInput } from '../lib/contracts/planner.ts';
import type { ConnectorResolver, PublishInput, SocialConnector, SocialProvider } from '../lib/server/connectors/types.ts';

const owner = 'vk-product-owner';
const otherOwner = 'vk-product-other-owner';
const token = randomBytes(32).toString('base64url');
const providers = ['TELEGRAM', 'MAX', 'VK'] as const;
const vkProvider = 'VK' as SocialProvider;
const due = '2030-01-01T09:00:00.000Z';
const mirrorQueue = async () => {};

beforeEach(async () => {
  await getDb().delete(users).where(inArray(users.id, [owner, otherOwner]));
  await getDb().insert(users).values([
    { id: owner, email: 'vk-product-owner@example.test', displayName: 'VK owner' },
    { id: otherOwner, email: 'vk-product-other-owner@example.test', displayName: 'Other owner' },
  ]);
});
after(async () => {
  await getDb().delete(users).where(inArray(users.id, [owner, otherOwner]));
  await closeDb();
});

async function seedConnected() {
  await getDb().insert(socialAccounts).values(providers.map(provider => ({
    id: `vk-product-${provider}`, userId: owner, provider: provider as typeof socialAccounts.$inferInsert.provider,
    providerAccountId: provider === 'VK' ? '-123' : provider === 'TELEGRAM' ? '-100123' : '-456',
    displayName: provider, enabled: true, connectionStatus: 'CONNECTED' as const,
  })));
}
function scheduledInput(selected: readonly string[] = ['telegram', 'max', 'vk'], mediaIds: string[] = []): SavePostInput {
  return {
    title: null, baseText: 'Base text', status: 'READY', mediaIds,
    targets: selected.map(provider => ({ provider: provider as SavePostInput['targets'][number]['provider'], textOverride: provider === 'vk' ? 'VK override' : null, scheduledAt: due })),
  };
}
async function publicationRows(postId: string) {
  return getDb().select().from(publications).where(eq(publications.postId, postId)).orderBy(asc(publications.provider));
}
async function vkConnector(fetchImpl: typeof fetch, accounts: string[]): Promise<SocialConnector> {
  // Dynamic path keeps the tests-only RED checkpoint typecheckable before the new module exists.
  const modulePath = '../lib/server/connectors/vk.ts';
  const module = await import(modulePath) as { createVkConnector(options: { getAccessToken: (id: string) => Promise<string>; fetchImpl: typeof fetch }): SocialConnector };
  return module.createVkConnector({ getAccessToken: async id => { accounts.push(id); return token; }, fetchImpl });
}
const api = (response: unknown) => Response.json({ response });
function resolver(vk: SocialConnector, captured: PublishInput[]): ConnectorResolver {
  return provider => provider === vkProvider ? vk : {
    provider,
    async publish(input) { captured.push(input); return { ok: true, remoteId: `${provider}-receipt`, remoteUrl: `https://example.test/${provider}` }; },
  };
}
function assertSecretFree(value: unknown) {
  assert.ok(!JSON.stringify(value).includes(token), 'server credential appeared in a public result');
}

test('VK owner bootstrap creates three isolated disconnected DTOs containing only public account fields', async () => {
  await ensureOwnerSocialAccounts(owner);
  await ensureOwnerSocialAccounts(owner);
  await ensureOwnerSocialAccounts(otherOwner);
  const accounts = await listSocialAccounts(owner);
  const other = await listSocialAccounts(otherOwner);
  assert.deepEqual(accounts.map(account => account.provider).sort(), ['max', 'telegram', 'vk']);
  assert.equal(accounts.length, 3);
  assert.equal(other.length, 3);
  for (const account of accounts) {
    assert.equal(account.enabled, false);
    assert.equal(account.connectionStatus, 'DISCONNECTED');
    assert.equal(account.providerAccountId, null);
    assert.deepEqual(Object.keys(account).sort(), ['connectionStatus', 'displayName', 'enabled', 'id', 'provider', 'providerAccountId']);
    assert.ok(other.every(row => row.id !== account.id));
  }
  assertSecretFree(accounts);
});

test('VK Publish Now uses the existing input/create/processor path for three independent receipts and skips duplicate deliveries', async () => {
  await seedConnected();
  const immediate = toPublishNowInput({ ...blankPost(), text: 'Immediate text', networks: ['telegram', 'max', 'vk'] as ReturnType<typeof blankPost>['networks'], overrides: { vk: 'Immediate VK override' } as ReturnType<typeof blankPost>['overrides'] });
  assert.equal(immediate.status, 'READY');
  assert.equal(immediate.targets.length, 3);
  assert.ok(immediate.targets.every(target => target.scheduledAt && Date.parse(target.scheduledAt) <= Date.now()));
  const post = await createPost(owner, immediate, { mirrorQueue });
  const rows = await publicationRows(post.id);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.status === 'SCHEDULED'));
  const captured: PublishInput[] = [];
  const accounts: string[] = [];
  let requests = 0;
  const vk = await vkConnector(async (_url, init) => {
    requests++;
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('owner_id'), '-123');
    assert.equal(body.get('message'), 'Immediate VK override');
    assert.ok(body.get('access_token') === token, 'server credential absent from API body');
    return api({ post_id: 42 });
  }, accounts);
  const resolve = resolver(vk, captured);
  for (const row of rows) assert.equal((await processPublication(row.id, resolve)).status, 'PUBLISHED');
  assert.deepEqual(accounts, ['vk-product-VK']);
  assert.equal(requests, 1);
  assert.equal(captured.length, 2);
  const stored = await publicationRows(post.id);
  assert.deepEqual(stored.map(row => [row.provider, row.providerRemoteId]), [['TELEGRAM', 'TELEGRAM-receipt'], ['MAX', 'MAX-receipt'], ['VK', '-123_42']]);
  assert.ok(stored.every(row => row.attemptCount === 1));
  for (const row of rows) assert.equal((await processPublication(row.id, resolve)).skipped, true);
  assert.equal(requests, 1);
  assert.equal(captured.length, 2);
  const publicPosts = await listPlannerPosts(owner);
  assert.equal(publicPosts[0].targets.length, 3);
  assertSecretFree(publicPosts);
});

for (const mode of ['success', 'auth', 'ambiguous'] as const) {
  test(`VK scheduled ${mode} result remains independent of confirmed Telegram/MAX targets`, async () => {
    await seedConnected();
    const post = await createPost(owner, scheduledInput(), { mirrorQueue });
    const rows = await publicationRows(post.id);
    assert.equal(rows.length, 3);
    assert.ok(rows.every(row => row.scheduledAt?.toISOString() === due));
    const accounts: string[] = [];
    const captured: PublishInput[] = [];
    let sends = 0;
    const vk = await vkConnector(async () => {
      sends++;
      if (mode === 'auth') return Response.json({ error: { error_code: 5, error_msg: token } });
      if (mode === 'ambiguous') throw new Error(`unconfirmed transport ${token}`);
      return api({ post_id: 43 });
    }, accounts);
    const resolve = resolver(vk, captured);
    for (const row of rows) await processPublication(row.id, resolve);
    const stored = await publicationRows(post.id);
    const vkRow = stored.find(row => row.provider === vkProvider)!;
    for (const row of stored.filter(row => row.provider !== vkProvider)) {
      assert.equal(row.status, 'PUBLISHED');
      assert.equal(row.providerRemoteId, `${row.provider}-receipt`);
      assert.equal(row.normalizedErrorType, null);
    }
    assert.equal(vkRow.status, mode === 'success' ? 'PUBLISHED' : mode === 'auth' ? 'REQUIRES_RECONNECT' : 'FAILED');
    assert.equal(vkRow.providerRemoteId, mode === 'success' ? '-123_43' : null);
    if (mode === 'ambiguous') assert.equal(vkRow.providerErrorCode, 'AMBIGUOUS_DELIVERY');
    assert.deepEqual(accounts, ['vk-product-VK']);
    for (const row of rows) assert.equal((await processPublication(row.id, resolve)).skipped, true);
    assert.equal(sends, 1);
    assert.equal(captured.length, 2);
    assertSecretFree(stored);
    assertSecretFree(await listPlannerPosts(owner));
  });
}

for (const disabled of [{ enabled: false }, { connectionStatus: 'DISCONNECTED' as const }]) {
  test('VK queued delivery rechecks disconnected/disabled account before credential lookup or provider transport', async () => {
    await seedConnected();
    const post = await createPost(owner, scheduledInput(['vk']), { mirrorQueue });
    const [row] = await publicationRows(post.id);
    await getDb().update(socialAccounts).set(disabled).where(eq(socialAccounts.id, 'vk-product-VK'));
    const accounts: string[] = [];
    let sends = 0;
    const vk = await vkConnector(async () => { sends++; return api({ post_id: 1 }); }, accounts);
    const result = await processPublication(row.id, () => vk);
    assert.equal(result.status, 'REQUIRES_RECONNECT');
    assert.equal(result.errorType, 'AUTH');
    assert.equal(sends, 0);
    assert.deepEqual(accounts, []);
    const [stored] = await publicationRows(post.id);
    assert.equal(stored.providerRemoteId, null);
  });
}

test('VK processor reads only owned ordered private PNG/JPEG bytes before photo upload and saves the wall receipt', async () => {
  await seedConnected();
  await getDb().insert(mediaAssets).values([
    { id: 'vk-product-first', userId: owner, storageKey: 'vk/first', originalName: 'first.png', mimeType: 'image/png', byteSize: 1, checksum: 'one', width: 100, height: 100 },
    { id: 'vk-product-second', userId: owner, storageKey: 'vk/second', originalName: 'second.jpg', mimeType: 'image/jpeg', byteSize: 2, checksum: 'two', width: 100, height: 100 },
    { id: 'vk-product-foreign', userId: otherOwner, storageKey: 'vk/foreign', originalName: 'foreign.png', mimeType: 'image/png', byteSize: 1, checksum: 'foreign' },
  ]);
  const post = await createPost(owner, scheduledInput(['vk'], ['vk-product-first', 'vk-product-second']), { mirrorQueue });
  // An inconsistent legacy link must not let another owner's private object reach a provider.
  await getDb().insert(postMedia).values({ postId: post.id, mediaId: 'vk-product-foreign', position: 2 });
  const [publication] = await publicationRows(post.id);
  const storageRequests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url!.split('?')[0];
    storageRequests.push(path);
    if (path === '/private/vk/first') response.end(Buffer.from([1]));
    else if (path === '/private/vk/second') response.end(Buffer.from([2, 3]));
    else response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const envKeys = ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_REGION: 'us-east-1', S3_BUCKET: 'private', S3_ACCESS_KEY_ID: 'generated-fixture-only', S3_SECRET_ACCESS_KEY: 'generated-fixture-only' });
  delete process.env.S3_PUBLIC_ENDPOINT;
  resetServerEnvForTests();
  const uploads: Array<{ mimeType: string; bytes: number[] }> = [];
  const accounts: string[] = [];
  let saves = 0;
  let wallCalls = 0;
  try {
    const vk = await vkConnector(async (url, init) => {
      const target = new URL(String(url));
      assert.ok(!target.toString().includes(token), 'credential appeared in upload URL');
      if (target.hostname === 'pu.vk.com') {
        const file = (init?.body as FormData).get('photo') as File;
        uploads.push({ mimeType: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] });
        return Response.json({ server: 1, photo: 'uploaded-photo', hash: 'fixture-hash' });
      }
      if (target.pathname.endsWith('photos.getWallUploadServer')) return api({ album_id: -14, user_id: 88, group_id: 123, upload_url: 'https://pu.vk.com/upload' });
      if (target.pathname.endsWith('photos.saveWallPhoto')) { saves++; return api([{ id: saves, owner_id: -123, album_id: -14, date: 1234 }]); }
      wallCalls++;
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('attachments'), 'photo-123_1,photo-123_2');
      assert.equal(body.get('message'), 'VK override');
      return api({ post_id: 44 });
    }, accounts);
    assert.equal((await processPublication(publication.id, () => vk)).status, 'PUBLISHED');
    assert.deepEqual(accounts, ['vk-product-VK']);
    assert.deepEqual(storageRequests, ['/private/vk/first', '/private/vk/second']);
    assert.deepEqual(uploads, [{ mimeType: 'image/png', bytes: [1] }, { mimeType: 'image/jpeg', bytes: [2, 3] }]);
    assert.equal(wallCalls, 1);
    const [stored] = await publicationRows(post.id);
    assert.equal(stored.providerRemoteId, '-123_44');
    assert.equal(stored.providerUrl, 'https://vk.com/wall-123_44');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const key of envKeys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    resetServerEnvForTests();
  }
});

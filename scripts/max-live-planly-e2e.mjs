// Explicit owner-authorized one-shot Planly E2E test; never part of ordinary tests.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { publications } from '../db/schema.ts';
import { SESSION_COOKIE_NAME, createOwnerSession } from '../lib/server/auth/session.ts';
import { ensureOwner } from '../lib/server/auth/owner.ts';
import { resetServerEnvForTests } from '../lib/server/env.ts';
import { GET as bootstrapGET } from '../app/api/bootstrap/route.ts';
import { POST as mediaPOST } from '../app/api/media/route.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';
import { PATCH as accountPATCH } from '../app/api/social-accounts/[id]/route.ts';
import { getPublicationQueue, closePublicationQueue } from '../lib/server/scheduler/queue.ts';
import { closeRedisConnection } from '../lib/server/scheduler/redis.ts';
import { startPublicationWorker } from '../lib/server/scheduler/worker.ts';

const token = (process.env.MAX_BOT_TOKEN ?? '').trim();
if (process.env.PLANLY_MAX_LIVE_TEST !== 'confirmed-owner-channel' || process.env.PLANLY_MAX_LIVE_E2E !== 'confirmed-owner-planly-chain' || !token) {
  throw new Error('Explicit live-test opt-in and private MAX token required.');
}

const destination = '-78857616977254';

async function readMax(path) {
  const response = await fetch(`https://platform-api2.max.ru${path}`, {
    headers: { authorization: token },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`MAX validation HTTP ${response.status}`);
  return response.json();
}

function contentType(path) {
  return path.endsWith('.mp4') ? 'video/mp4' : 'image/png';
}

function startPrivateObjectStore() {
  const objects = new Map();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://planly-storage.test');
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!key.includes('/')) {
        response.writeHead(400).end('missing bucket/key');
        return;
      }
      if (request.method === 'PUT') {
        const chunks = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        objects.set(key, Buffer.concat(chunks));
        response.writeHead(200).end();
        return;
      }
      if (request.method === 'GET') {
        const bytes = objects.get(key);
        if (!bytes) {
          response.writeHead(404).end('not found');
          return;
        }
        response.writeHead(200, { 'content-type': contentType(key) }).end(bytes);
        return;
      }
      if (request.method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204).end();
        return;
      }
      response.writeHead(405).end('method not allowed');
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : 'storage error');
    }
  });
  return {
    objects,
    listen: () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve)),
    address: () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Storage test server did not expose a port.');
      return address;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(() => resolve()));
    },
  };
}

function waitFor(predicate, timeoutMs = 45_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await predicate();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error('Timed out waiting for Planly publication to finish.'));
          return;
        }
        setTimeout(tick, 250);
      } catch (error) {
        reject(error);
      }
    };
    void tick();
  });
}

async function pause(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function json(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function authedRequest(path, tokenValue, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(tokenValue)}`);
  return new Request(`http://planly.test${path}`, { ...init, headers });
}

async function uploadFixture(path, name, mimeType, sessionToken) {
  const bytes = await readFile(path);
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type: mimeType }));
  const response = await mediaPOST(authedRequest('/api/media', sessionToken, { method: 'POST', body: form }));
  return json(response, `upload ${name}`);
}

async function publicationFor(postId) {
  const [row] = await getDb().select().from(publications).where(eq(publications.postId, postId)).limit(1);
  return row;
}

async function waitForPublished(postId, label) {
  return waitFor(async () => {
    const row = await publicationFor(postId);
    if (!row) return false;
    if (row.status === 'PUBLISHED' && row.providerRemoteId) return row;
    if (['FAILED', 'REQUIRES_RECONNECT', 'CANCELLED'].includes(row.status)) {
      throw new Error(`MAX Planly E2E ${label} finished as ${row.status}: ${row.providerErrorCode ?? 'NO_CODE'}; ${row.providerErrorMessage ?? 'NO_MESSAGE'}. Do not blindly resend.`);
    }
    return false;
  });
}

async function createReadyPost(sessionToken, input) {
  return json(await postsPOST(authedRequest('/api/posts', sessionToken, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: `MAX live Planly E2E ${input.label}`,
      baseText: input.text,
      status: 'READY',
      mediaIds: input.mediaIds,
      targets: [{
        provider: 'max',
        textOverride: null,
        scheduledAt: new Date(Date.now() + input.delayMs).toISOString(),
      }],
    }),
  })), `create READY MAX post ${input.label}`);
}

const bot = await readMax('/me');
if (bot.is_bot !== true || bot.username !== 'se14310498_bot') throw new Error('Designated MAX bot identity mismatch.');
const chat = await readMax(`/chats/${destination}`);
if (chat.link !== 'https://max.ru/channel_danil_sochi_realty') throw new Error('Owner MAX destination link mismatch.');

const storage = startPrivateObjectStore();
let runtime;
try {
  await storage.listen();
  const storageAddress = storage.address();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    S3_ENDPOINT: `http://127.0.0.1:${storageAddress.port}`,
    S3_PUBLIC_ENDPOINT: `http://127.0.0.1:${storageAddress.port}`,
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'planly-live-media',
    S3_ACCESS_KEY_ID: 'planly-live-key',
    S3_SECRET_ACCESS_KEY: 'planly-live-secret',
  });
  resetServerEnvForTests();

  await closePublicationQueue();
  await closeRedisConnection();
  await getPublicationQueue().obliterate({ force: true });

  const owner = await ensureOwner();
  const sessionToken = await createOwnerSession(owner.id);
  const bootstrap = await json(await bootstrapGET(authedRequest('/api/bootstrap', sessionToken)), 'bootstrap');
  const maxAccount = bootstrap.socialAccounts.find(account => account.provider === 'max');
  if (!maxAccount) throw new Error('MAX social account missing from owner bootstrap.');

  const connected = await json(await accountPATCH(
    authedRequest(`/api/social-accounts/${maxAccount.id}`, sessionToken, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destinationId: destination }),
    }),
    { params: Promise.resolve({ id: maxAccount.id }) },
  ), 'MAX account connect');
  if (connected.connectionStatus !== 'CONNECTED' || connected.providerAccountId !== destination) {
    throw new Error('MAX account did not connect to the owner destination.');
  }

  const photo = await uploadFixture('artifacts/max-fixtures/photo.png', `planly-e2e-${randomUUID()}.png`, 'image/png', sessionToken);
  const secondPhoto = await uploadFixture('artifacts/max-fixtures/photo.png', `planly-e2e-${randomUUID()}.png`, 'image/png', sessionToken);
  const video = await uploadFixture('artifacts/max-fixtures/video.mp4', `planly-e2e-${randomUUID()}.mp4`, 'video/mp4', sessionToken);
  if (storage.objects.size !== 3) throw new Error('Planly API did not store all private media objects.');

  runtime = await startPublicationWorker(undefined, { retryDelaysMs: [2_000, 4_000, 8_000, 16_000], reconcileIntervalMs: 0 });
  const stamp = new Date().toISOString();
  const cases = [
    { label: 'text-only', text: `[ТЕСТ PLANLY] MAX E2E text-only ${stamp}`, mediaIds: [], delayMs: 500 },
    { label: 'image-only', text: '', mediaIds: [photo.id], delayMs: 500 },
    { label: 'image-text', text: `[ТЕСТ PLANLY] MAX E2E image + text ${stamp}`, mediaIds: [photo.id], delayMs: 500 },
    { label: 'video-only', text: '', mediaIds: [video.id], delayMs: 500 },
    { label: 'video-text', text: `[ТЕСТ PLANLY] MAX E2E video + text ${stamp}`, mediaIds: [video.id], delayMs: 500 },
    { label: 'album-images', text: `[ТЕСТ PLANLY] MAX E2E album ${stamp}`, mediaIds: [photo.id, secondPhoto.id], delayMs: 500 },
    { label: 'delayed-text', text: `[ТЕСТ PLANLY] MAX E2E delayed ${stamp}`, mediaIds: [], delayMs: 2_500 },
  ];

  const results = [];
  for (const item of cases) {
    const post = await createReadyPost(sessionToken, item);
    if (item.label === 'delayed-text') {
      await pause(800);
      const early = await publicationFor(post.id);
      if (!early || early.status === 'PUBLISHED') throw new Error('Delayed MAX publication fired before its scheduled time.');
    }
    const published = await waitForPublished(post.id, item.label);
    if (!published.providerRemoteId?.trim()) throw new Error(`MAX Planly E2E ${item.label} did not store a remote ID.`);
    results.push({
      label: item.label,
      postId: post.id,
      publicationId: published.id,
      remoteId: published.providerRemoteId,
      remoteUrl: published.providerUrl,
      attemptCount: published.attemptCount,
    });
    await pause(1_500);
  }

  const duplicateTarget = results[0];
  await getPublicationQueue().add('publish', { publicationId: duplicateTarget.publicationId }, { jobId: `duplicate-${duplicateTarget.publicationId}-${Date.now()}` });
  await pause(1_000);
  const duplicateAfter = await getDb().select().from(publications).where(eq(publications.id, duplicateTarget.publicationId)).limit(1);
  const row = duplicateAfter[0];
  if (!row || row.providerRemoteId !== duplicateTarget.remoteId || row.attemptCount !== duplicateTarget.attemptCount) {
    throw new Error('Duplicate MAX queue delivery changed a published publication.');
  }

  console.log(JSON.stringify({
    status: 'confirmed',
    path: 'api-media-api-posts-redis-worker-max',
    destination,
    cases: results.map(result => ({
      label: result.label,
      postId: result.postId,
      publicationId: result.publicationId,
      remoteId: result.remoteId,
      remoteUrl: result.remoteUrl,
    })),
    duplicatePublishing: 'skipped',
  }));
} finally {
  if (runtime) await runtime.close();
  await closePublicationQueue();
  await closeRedisConnection();
  await closeDb();
  await storage.close();
}

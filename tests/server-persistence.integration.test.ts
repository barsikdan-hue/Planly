import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { ensureOwnerSocialAccounts } from '../lib/server/social-accounts.ts';
import { GET as bootstrapGET } from '../app/api/bootstrap/route.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';
import { PATCH as postPATCH, DELETE as postDELETE } from '../app/api/posts/[id]/route.ts';

const ownerId = 'reload-owner';
let token = '';

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
  if (init.body) headers.set('content-type', 'application/json');
  return new Request(`http://planly.test${path}`, { ...init, headers });
}

async function bootstrap() {
  const response = await bootstrapGET(request('/api/bootstrap'));
  assert.equal(response.status, 200);
  return response.json() as Promise<{ posts: Array<{ id:string; baseText:string; targets:Array<{provider:string;textOverride:string|null}> }> }>;
}

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications); await db.delete(postMedia); await db.delete(postTargets); await db.delete(posts);
  await db.delete(mediaAssets); await db.delete(sessions); await db.delete(socialAccounts); await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'reload@example.test', displayName: 'Reload Owner' });
  await ensureOwnerSocialAccounts(ownerId);
  token = await createOwnerSession(ownerId);
});
after(closeDb);

test('create, reload, edit targets, reload, delete and reload are PostgreSQL authoritative', async () => {
  const createdResponse = await postsPOST(request('/api/posts', {
    method: 'POST',
    body: JSON.stringify({
      baseText: 'first', status: 'DRAFT', mediaIds: [],
      targets: [
        { provider:'telegram', textOverride:'telegram first', scheduledAt:null },
        { provider:'max', textOverride:'max first', scheduledAt:null },
      ],
    }),
  }));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { id:string };

  let snapshot = await bootstrap();
  assert.equal(snapshot.posts.length, 1);
  assert.equal(snapshot.posts[0].baseText, 'first');
  assert.deepEqual(snapshot.posts[0].targets.map(target => [target.provider, target.textOverride]), [
    ['telegram','telegram first'], ['max','max first'],
  ]);

  const updateResponse = await postPATCH(request(`/api/posts/${created.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      baseText:'second', status:'READY', mediaIds:[],
      targets:[
        { provider:'telegram', textOverride:'telegram second', scheduledAt:'2030-01-01T09:00:00.000Z' },
        { provider:'max', textOverride:'max second', scheduledAt:'2030-01-01T09:00:00.000Z' },
      ],
    }),
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(updateResponse.status, 200);

  snapshot = await bootstrap();
  assert.equal(snapshot.posts[0].baseText, 'second');
  assert.deepEqual(snapshot.posts[0].targets.map(target => [target.provider, target.textOverride]), [
    ['telegram','telegram second'], ['max','max second'],
  ]);

  const deleteResponse = await postDELETE(request(`/api/posts/${created.id}`, { method:'DELETE' }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(deleteResponse.status, 204);
  snapshot = await bootstrap();
  assert.equal(snapshot.posts.length, 0);
});

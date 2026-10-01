import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { createOwnerSession, SESSION_COOKIE_NAME } from '../lib/server/auth/session.ts';
import { ensureOwnerSocialAccounts } from '../lib/server/social-accounts.ts';
import { GET as bootstrapGET } from '../app/api/bootstrap/route.ts';
import { POST as postsPOST } from '../app/api/posts/route.ts';
import { PATCH as postPATCH } from '../app/api/posts/[id]/route.ts';

const ownerId = 'api-owner';
let token = '';

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set('cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
  return new Request(`http://planly.test${path}`, { ...init, headers });
}

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postMedia);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(mediaAssets);
  await db.delete(sessions);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values({ id: ownerId, email: 'owner@example.test', displayName: 'Owner' });
  await ensureOwnerSocialAccounts(ownerId);
  token = await createOwnerSession(ownerId);
});
after(closeDb);

test('bootstrap rejects unauthenticated requests and returns owner snapshot when authenticated', async () => {
  token = '';
  const unauthorized = await bootstrapGET(request('/api/bootstrap'));
  assert.equal(unauthorized.status, 401);
  token = await createOwnerSession(ownerId);
  const response = await bootstrapGET(request('/api/bootstrap'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.profile.email, 'owner@example.test');
  assert.deepEqual(body.posts, []);
  assert.deepEqual(body.media, []);
  assert.deepEqual(body.socialAccounts.map((x: { provider: string }) => x.provider).sort(), ['max', 'telegram']);
});

test('posts endpoint distinguishes malformed JSON, invalid input and valid creation', async () => {
  const malformed = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad',
  }));
  assert.equal(malformed.status, 400);

  const invalid = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseText: '', status: 'DRAFT', targets: [], mediaIds: [] }),
  }));
  assert.equal(invalid.status, 422);

  const valid = await postsPOST(request('/api/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseText: 'hello', status: 'DRAFT', targets: [], mediaIds: [] }),
  }));
  assert.equal(valid.status, 201);
  const body = await valid.json();
  assert.equal(body.baseText, 'hello');
  assert.equal(body.status, 'DRAFT');
});

test('unknown post is 404 and response does not expose stack or database internals', async () => {
  const response = await postPATCH(
    request('/api/posts/missing', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseText: 'x', status: 'DRAFT', targets: [], mediaIds: [] }),
    }),
    { params: Promise.resolve({ id: 'missing' }) },
  );
  assert.equal(response.status, 404);
  const text = await response.text();
  assert.doesNotMatch(text, /stack|postgres|select |update /i);
});

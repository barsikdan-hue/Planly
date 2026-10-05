import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { count, eq } from 'drizzle-orm';
import { POST } from '../app/api/auth/login/route.ts';
import { closeDb, getDb } from '../db/index.ts';
import { loginRateLimits, sessions } from '../db/schema.ts';

// Disposable native CI database only; no production requests or credentials.
const address = '198.51.100.24';
function login(agent: string | null, ip: string | null = address, email = 'owner@example.test', password = 'wrong-fixture-password', extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({ ...extraHeaders, 'content-type': 'application/json' });
  if (agent !== null) headers.set('user-agent', agent);
  if (ip !== null) headers.set('x-forwarded-for', ip);
  return POST(new Request('http://planly.test/api/auth/login', {
    method: 'POST', headers, body: JSON.stringify({ email, password }),
  }));
}
async function rejectFive(agent = 'fixture-agent') {
  for (let index = 0; index < 5; index += 1) assert.equal((await login(agent)).status, 401);
}
function assertBlocked(response: Response) {
  assert.equal(response.status, 429);
  const delay = Number(response.headers.get('retry-after'));
  assert.ok(delay > 0 && delay <= 900);
  assert.ok(!response.headers.has('set-cookie'));
}
beforeEach(async () => { await getDb().delete(loginRateLimits); });
after(async () => { await getDb().delete(loginRateLimits); await closeDb(); });

test('rotating User-Agent cannot bypass the login failure limit for one client address', async () => {
  for (let index = 0; index < 5; index += 1) assert.equal((await login(`rotated-agent-${index}`)).status, 401);
  assertBlocked(await login('rotated-agent-5'));
  const rows = await getDb().select().from(loginRateLimits);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.failedCount, 5);
});

test('changing or removing User-Agent after five failures cannot reset the bucket', async () => {
  await rejectFive();
  assertBlocked(await login('changed-agent'));
  assertBlocked(await login(null));
});

test('missing client address uses one stable fallback bucket across User-Agent changes', async () => {
  for (let index = 0; index < 5; index += 1) assert.equal((await login(`unknown-agent-${index}`, null)).status, 401);
  assertBlocked(await login('another-unknown-agent', null));
});

test('same-client sixth failure remains blocked and does not create a session', async () => {
  await rejectFive();
  const [before] = await getDb().select({ value: count() }).from(sessions);
  assertBlocked(await login('fixture-agent'));
  assertBlocked(await login('fixture-agent', address, 'owner@example.test', 'ci-test-owner-password'));
  const [after] = await getDb().select({ value: count() }).from(sessions);
  assert.equal(after!.value, before!.value);
});

test('first forwarded address retains precedence over later hops and X-Real-IP', async () => {
  await rejectFive();
  assertBlocked(await login('fixture-agent', ` ${address} , 203.0.113.1`, 'owner@example.test', 'wrong-fixture-password', {
    'x-real-ip': '198.51.100.25',
  }));
});

test('X-Real-IP fallback has the same stable identity across agent changes', async () => {
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await login('fixture-agent', null, 'owner@example.test', 'wrong-fixture-password', { 'x-real-ip': address })).status, 401);
  }
  assertBlocked(await login('new-agent', null, 'owner@example.test', 'wrong-fixture-password', { 'x-real-ip': address }));
});

test('another client address retains its independent failure allowance', async () => {
  await rejectFive();
  assert.equal((await login('fixture-agent', '198.51.100.25')).status, 401);
  assertBlocked(await login('fixture-agent'));
});

test('email changes cannot bypass an exhausted client bucket', async () => {
  await rejectFive();
  assertBlocked(await login('fixture-agent', address, 'other@example.test'));
});

test('successful owner login before exhaustion clears accumulated failures', async () => {
  for (let index = 0; index < 4; index += 1) assert.equal((await login('fixture-agent')).status, 401);
  const response = await login('fixture-agent', address, 'owner@example.test', 'ci-test-owner-password');
  assert.equal(response.status, 200);
  assert.ok(response.headers.has('set-cookie'));
  assert.equal((await getDb().select().from(loginRateLimits)).length, 0);
  await rejectFive();
  assertBlocked(await login('fixture-agent'));
});

test('expired login window restores the existing allowance', async () => {
  await rejectFive();
  const [row] = await getDb().select().from(loginRateLimits);
  await getDb().update(loginRateLimits).set({ windowStartedAt: new Date(Date.now() - 901_000) })
    .where(eq(loginRateLimits.keyHash, row!.keyHash));
  assert.equal((await login('fixture-agent')).status, 401);
  const [fresh] = await getDb().select().from(loginRateLimits);
  assert.equal(fresh!.failedCount, 1);
});

test('login failures persist across database reconnection and User-Agent changes', async () => {
  for (let index = 0; index < 3; index += 1) assert.equal((await login('fixture-agent')).status, 401);
  await closeDb();
  for (let index = 0; index < 2; index += 1) assert.equal((await login('new-agent')).status, 401);
  assertBlocked(await login('third-agent'));
});

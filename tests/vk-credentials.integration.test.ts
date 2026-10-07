import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool } from 'pg';

type Envelope = { ciphertext: string; iv: string; tag: string; keyVersion: string };
type Tokens = { accessToken: string; refreshToken: string; deviceId: string; scopes: string[] };
type VkApi = {
  getVkAccessToken: (id: string) => Promise<string>;
  startVkOAuth: (userId: string, accountId: string, communityId: string) => Promise<{ authorizationUrl: string }>;
  completeVkOAuth: (userId: string, input: { state: string; code: string; deviceId: string }, validator: (token: string, communityId: string) => Promise<{ destinationId: string; displayName: string }>) => Promise<void>;
  disconnectVkAccount: (userId: string, accountId: string) => Promise<void>;
  sealVkPayload: (payload: unknown, context: { accountId: string; provider: string; purpose: string }, config: { encryptionKey: string; keyVersion: string }) => Envelope;
  getPool: () => Pool;
  closeDb: () => Promise<void>;
};
async function loadApi(): Promise<VkApi> {
  const paths = ['../lib/server/vk/credentials.ts', '../lib/server/vk/oauth.ts', '../lib/server/vk/crypto.ts', '../db/index.ts'];
  const modules = await Promise.all(paths.map(path => import(path).catch(() => null)));
  const api = Object.assign({}, ...modules);
  assert.ok(api.getVkAccessToken && api.startVkOAuth && api.completeVkOAuth && api.disconnectVkAccount && api.sealVkPayload && api.getPool, 'VK durable credential/OAuth lifecycle feature is missing');
  return api;
}
const synthetic = () => randomBytes(24).toString('hex');
const accountId = 'vk-credential-account'; const ownerId = 'vk-credential-owner'; const otherOwner = 'vk-other-owner';
const context = { accountId, provider: 'VK', purpose: 'CREDENTIALS' };
const validator = async () => ({ destinationId: '-12345', displayName: 'VK fixture community' });
let loadedApi: VkApi | undefined;
after(async () => { await loadedApi?.closeDb(); });

async function fixture(body: (api: VkApi, pool: Pool, key: { encryptionKey: string; keyVersion: string }) => Promise<void>) {
  const api = await loadApi(); loadedApi = api;
  const env = { VK_CLIENT_ID: '123456', VK_SERVICE_TOKEN: synthetic(), VK_REDIRECT_URI: 'https://planly.example.test/api/social-accounts/vk/callback', VK_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VK_CREDENTIAL_KEY_VERSION: '1' };
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]])); const originalFetch = globalThis.fetch;
  Object.assign(process.env, env);
  const pool = api.getPool();
  try {
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[ownerId, otherOwner]]);
    await pool.query('INSERT INTO users(id,email,display_name) VALUES ($1,$2,$3),($4,$5,$6)', [ownerId, 'vk-credentials@example.test', 'VK owner', otherOwner, 'vk-other@example.test', 'Other owner']);
    await pool.query("INSERT INTO social_accounts(id,user_id,provider,provider_account_id,display_name,enabled,connection_status) VALUES ($1,$2,'VK','-12345','VK',true,'CONNECTED'),('vk-other-account',$3,'VK','-98765','VK other',true,'CONNECTED'),('vk-telegram',$2,'TELEGRAM','-100123','Telegram',true,'CONNECTED')", [accountId, ownerId, otherOwner]);
    await body(api, pool, { encryptionKey: env.VK_CREDENTIAL_ENCRYPTION_KEY, keyVersion: '1' });
  } finally {
    globalThis.fetch = originalFetch;
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[ownerId, otherOwner]]);
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}
async function seed(api: VkApi, pool: Pool, key: { encryptionKey: string; keyVersion: string }, fresh = false): Promise<Tokens> {
  const tokens = { accessToken: synthetic(), refreshToken: synthetic(), deviceId: synthetic(), scopes: ['wall', 'photos'] };
  const envelope = api.sealVkPayload(tokens, context, key);
  await pool.query("INSERT INTO vk_credentials(account_id,ciphertext,iv,tag,key_version,expires_at,refresh_state) VALUES ($1,$2,$3,$4,$5,$6,'READY')", [accountId, envelope.ciphertext, envelope.iv, envelope.tag, envelope.keyVersion, new Date(Date.now() + (fresh ? 3600_000 : -1000))]);
  return tokens;
}
function freshGrant() { return { access_token: synthetic(), refresh_token: synthetic(), expires_in: 3600, scope: 'wall photos' }; }
async function authFailure(action: () => Promise<unknown>) {
  await assert.rejects(action, error => error instanceof Error && 'code' in error && error.code === 'AUTH' && !('cause' in error));
}

test('native credential storage contains only authenticated envelopes and fresh reads make no transport call', async () => fixture(async (api, pool, key) => {
  const tokens = await seed(api, pool, key, true); let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected synthetic transport'); };
  const returned = await api.getVkAccessToken(accountId); assert.ok(returned === tokens.accessToken, 'fresh credential was not returned'); assert.equal(calls, 0);
  const rows = await pool.query('SELECT * FROM vk_credentials WHERE account_id=$1', [accountId]);
  const stored = JSON.stringify(rows.rows);
  for (const value of [tokens.accessToken, tokens.refreshToken, tokens.deviceId]) assert.equal(stored.includes(value), false);
}));

test('native concurrent refresh commits UNCERTAIN before external call and serializes one replacement pair', async t => fixture(async (api, pool, key) => {
  const old = await seed(api, pool, key); const replacement = freshGrant(); let calls = 0;
  let release!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const firstStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async (_url, init) => {
    calls++; const form = new URLSearchParams(String(init?.body)); assert.ok(form.get('refresh_token') === old.refreshToken, 'wrong refresh sent');
    const durable = await pool.query('SELECT refresh_state FROM vk_credentials WHERE account_id=$1', [accountId]); assert.equal(durable.rows[0]?.refresh_state, 'UNCERTAIN');
    started(); await blocked; return Response.json(replacement);
  };
  const first = api.getVkAccessToken(accountId); let second: Promise<string> | undefined;
  try {
    await Promise.race([firstStarted, first.then(() => assert.fail('refresh completed before the held transport'))]);
    second = api.getVkAccessToken(accountId);
    // Attach rejection handlers while observing the native lock graph.
    void Promise.allSettled([first, second]);
    const deadline = Date.now() + 2000;
    let graph: { waiting_pid: number; holder_pid: number; wait_event: string; blockers: number[] } | undefined;
    do {
      const observation = await pool.query<{ waiting_pid: number; holder_pid: number; wait_event: string; blockers: number[] }>(`
        SELECT waiting.pid AS waiting_pid, held.pid AS holder_pid, activity.wait_event,
               pg_blocking_pids(waiting.pid) AS blockers
        FROM pg_locks waiting
        JOIN pg_locks held ON held.locktype = waiting.locktype
          AND held.database IS NOT DISTINCT FROM waiting.database
          AND held.classid = waiting.classid AND held.objid = waiting.objid
          AND held.objsubid = waiting.objsubid AND held.granted
        JOIN pg_stat_activity activity ON activity.pid = waiting.pid
        WHERE waiting.locktype = 'advisory' AND NOT waiting.granted
          AND waiting.classid::bigint = ((hashtextextended($1,0) >> 32) & 4294967295)
          AND waiting.objid::bigint = (hashtextextended($1,0) & 4294967295)
          AND waiting.objsubid = 1 AND activity.wait_event_type = 'Lock'
          AND held.pid = ANY(pg_blocking_pids(waiting.pid))
      `, [`planly:vk:account:${accountId}`]);
      graph = observation.rows[0];
      if (!graph) await delay(20);
    } while (!graph && Date.now() < deadline);
    assert.ok(graph, 'second PostgreSQL session did not wait on the held account advisory lock within 2 seconds');
    assert.notEqual(graph.waiting_pid, graph.holder_pid);
    assert.equal(graph.wait_event, 'advisory');
    assert.ok(graph.blockers.includes(graph.holder_pid), 'native blocking graph did not identify the holding session');
    const whileBlocked = await pool.query('SELECT refresh_state FROM vk_credentials WHERE account_id=$1', [accountId]);
    assert.equal(whileBlocked.rows[0]?.refresh_state, 'UNCERTAIN'); assert.equal(calls, 1);
    t.diagnostic(`Native advisory graph: waiter=${graph.waiting_pid}, holder=${graph.holder_pid}, blockers=${graph.blockers.join(',')}, wait_event=${graph.wait_event}, durable_state=UNCERTAIN`);
  } finally {
    release();
    await Promise.allSettled(second ? [first, second] : [first]);
  }
  assert.ok(second);
  const values = await Promise.all([first, second]); assert.ok(values.every(value => value === replacement.access_token), 'workers did not read committed replacement'); assert.equal(calls, 1);
  const durable = await pool.query('SELECT refresh_state FROM vk_credentials WHERE account_id=$1', [accountId]); assert.equal(durable.rows[0]?.refresh_state, 'READY');
}));

test('lost refresh response leaves durable UNCERTAIN and subsequent calls never reuse old refresh', async () => fixture(async (api, pool, key) => {
  await seed(api, pool, key); let calls = 0; const echo = synthetic();
  globalThis.fetch = async () => { calls++; throw new Error(echo); };
  await authFailure(() => api.getVkAccessToken(accountId)); await authFailure(() => api.getVkAccessToken(accountId)); assert.equal(calls, 1);
  const durable = await pool.query('SELECT refresh_state FROM vk_credentials WHERE account_id=$1', [accountId]); assert.equal(durable.rows[0]?.refresh_state, 'UNCERTAIN');
}));

test('replacement persistence failure preserves durable UNCERTAIN after successful provider rotation', async () => fixture(async (api, pool, key) => {
  await seed(api, pool, key); let calls = 0; globalThis.fetch = async () => { calls++; return Response.json(freshGrant()); };
  await pool.query("CREATE FUNCTION vk_fixture_reject_pair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.refresh_state='UNCERTAIN' AND NEW.refresh_state='READY' THEN RAISE EXCEPTION 'synthetic persistence failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER vk_fixture_reject_pair BEFORE UPDATE ON vk_credentials FOR EACH ROW EXECUTE FUNCTION vk_fixture_reject_pair()');
  try {
    await authFailure(() => api.getVkAccessToken(accountId)); await authFailure(() => api.getVkAccessToken(accountId)); assert.equal(calls, 1);
    const durable = await pool.query('SELECT refresh_state FROM vk_credentials WHERE account_id=$1', [accountId]); assert.equal(durable.rows[0]?.refresh_state, 'UNCERTAIN');
  } finally { await pool.query('DROP TRIGGER vk_fixture_reject_pair ON vk_credentials'); await pool.query('DROP FUNCTION vk_fixture_reject_pair()'); }
}));

test('disabled or deleted VK accounts fail closed before accessing provider transport', async () => fixture(async (api, pool, key) => {
  await seed(api, pool, key, true); let calls = 0; globalThis.fetch = async () => { calls++; return Response.json(freshGrant()); };
  await pool.query('UPDATE social_accounts SET enabled=false WHERE id=$1', [accountId]); await authFailure(() => api.getVkAccessToken(accountId));
  await pool.query('DELETE FROM social_accounts WHERE id=$1', [accountId]); await authFailure(() => api.getVkAccessToken(accountId)); assert.equal(calls, 0);
}));

test('OAuth intent binds owner account community state and encrypted PKCE; callback is one use', async () => fixture(async (api, pool) => {
  const { authorizationUrl } = await api.startVkOAuth(ownerId, accountId, '12345'); const url = new URL(authorizationUrl); const state = url.searchParams.get('state'); assert.ok(state);
  assert.equal(url.protocol, 'https:'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('redirect_uri'), process.env.VK_REDIRECT_URI);
  const rows = await pool.query('SELECT * FROM vk_oauth_intents WHERE account_id=$1', [accountId]); assert.equal(rows.rows.length, 1); assert.equal(rows.rows[0].user_id, ownerId); assert.equal(rows.rows[0].community_id, '12345'); assert.equal(rows.rows[0].state_hash, createHash('sha256').update(state).digest('hex'));
  let calls = 0; let validations = 0; const grant = freshGrant();
  globalThis.fetch = async (_url, init) => { calls++; const form = new URLSearchParams(String(init?.body)); const verifier = form.get('code_verifier'); assert.ok(verifier); assert.equal(JSON.stringify(rows.rows).includes(verifier), false); assert.equal(createHash('sha256').update(verifier).digest('base64url'), url.searchParams.get('code_challenge')); return Response.json(grant); };
  const input = { state, code: synthetic(), deviceId: synthetic() };
  await assert.rejects(() => api.completeVkOAuth(otherOwner, input, validator)); assert.equal(calls, 0);
  await api.completeVkOAuth(ownerId, input, async (token, community) => { validations++; assert.ok(token === grant.access_token, 'validator did not receive grant'); assert.equal(community, '12345'); return validator(); });
  await assert.rejects(() => api.completeVkOAuth(ownerId, input, validator)); assert.equal(calls, 1); assert.equal(validations, 1);
  const connected = await pool.query('SELECT connection_status,provider_account_id FROM social_accounts WHERE id=$1', [accountId]); assert.equal(connected.rows[0].connection_status, 'CONNECTED'); assert.equal(connected.rows[0].provider_account_id, '-12345');
}));

test('expired state missing device and insufficient scopes cannot create credentials', async () => fixture(async (api, pool) => {
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ ...freshGrant(), scope: 'wall' }); };
  let started = await api.startVkOAuth(ownerId, accountId, '12345'); let state = new URL(started.authorizationUrl).searchParams.get('state')!;
  await pool.query("UPDATE vk_oauth_intents SET expires_at=now()-interval '1 second' WHERE account_id=$1", [accountId]);
  await assert.rejects(() => api.completeVkOAuth(ownerId, { state, code: synthetic(), deviceId: synthetic() }, validator)); assert.equal(calls, 0);
  started = await api.startVkOAuth(ownerId, accountId, '12345'); state = new URL(started.authorizationUrl).searchParams.get('state')!;
  await assert.rejects(() => api.completeVkOAuth(ownerId, { state, code: synthetic(), deviceId: '' }, validator)); assert.equal(calls, 0);
  await assert.rejects(() => api.completeVkOAuth(ownerId, { state, code: synthetic(), deviceId: synthetic() }, validator)); assert.equal(calls, 1);
  const credentials = await pool.query('SELECT account_id FROM vk_credentials WHERE account_id=$1', [accountId]); assert.equal(credentials.rows.length, 0);
}));

test('community authority failure never stores OAuth credentials', async () => fixture(async (api, pool) => {
  const started = await api.startVkOAuth(ownerId, accountId, '12345'); const state = new URL(started.authorizationUrl).searchParams.get('state')!;
  globalThis.fetch = async () => Response.json(freshGrant());
  await assert.rejects(() => api.completeVkOAuth(ownerId, { state, code: synthetic(), deviceId: synthetic() }, async () => { throw new Error(synthetic()); }));
  const credentials = await pool.query('SELECT account_id FROM vk_credentials WHERE account_id=$1', [accountId]); assert.equal(credentials.rows.length, 0);
}));

test('disconnect removes owned VK credentials and intents and preserves other owners and Telegram', async () => fixture(async (api, pool, key) => {
  await seed(api, pool, key, true); await api.startVkOAuth(ownerId, accountId, '12345'); await api.startVkOAuth(otherOwner, 'vk-other-account', '98765');
  await assert.rejects(() => api.disconnectVkAccount(otherOwner, accountId));
  await api.disconnectVkAccount(ownerId, accountId);
  const credentials = await pool.query('SELECT account_id FROM vk_credentials WHERE account_id=$1', [accountId]); const intents = await pool.query('SELECT account_id FROM vk_oauth_intents WHERE account_id=$1', [accountId]); assert.equal(credentials.rows.length, 0); assert.equal(intents.rows.length, 0);
  const account = await pool.query('SELECT enabled,connection_status FROM social_accounts WHERE id=$1', [accountId]); assert.equal(account.rows[0].enabled, false); assert.equal(account.rows[0].connection_status, 'DISCONNECTED');
  const other = await pool.query("SELECT id,enabled,connection_status FROM social_accounts WHERE id IN ('vk-other-account','vk-telegram')"); assert.equal(other.rows.length, 2); assert.ok(other.rows.every(row => row.enabled && row.connection_status === 'CONNECTED'));
  assert.equal((await pool.query("SELECT account_id FROM vk_oauth_intents WHERE account_id='vk-other-account'")).rows.length, 1);
}));

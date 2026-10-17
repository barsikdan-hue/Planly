import test, {after, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {eq} from 'drizzle-orm';
import {getDb, closeDb} from '../db/index.ts';
import * as s from '../db/schema.ts';
import {sessionTokenHash} from '../lib/server/auth/session.ts';
import {processPublication} from '../lib/server/scheduler/processor.ts';
import {cancelPublicationApproval} from '../lib/server/publication-approval-cancellation.ts';
import {createSocialConnectionLifecycle} from '../lib/server/social-connections/lifecycle.ts';
import {connectSocialAccount} from '../lib/server/social-accounts.ts';

type Provider = 'TELEGRAM' | 'MAX';
type Barrier = 'after-auth-commit' | 'before-error-sql' | 'provider-outcome';
type Outcome = 'local' | 'auth' | 'receipt' | 'ambiguous';
const OLD = '-611660001', NEW = '-611660002';
const db = getDb();
after(closeDb);

function gate() {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  return {enter, release, entered, held};
}

async function fixture(context: TestContext, provider: Provider, barrier: Barrier, outcome: Outcome = 'local', destination: string | null = OLD) {
  const id = `owner-fence-${randomUUID()}`, accountId = `${id}-account`, postId = `${id}-post`;
  const targetId = `${id}-target`, publicationId = `${id}-publication`, raw = `${id}-session`, at = new Date();
  const originalFetch = globalThis.fetch;
  const savedEnv = {OWNER_EMAIL: process.env.OWNER_EMAIL, TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN, MAX_BOT_TOKEN: process.env.MAX_BOT_TOKEN};
  const paused = gate();
  let inserted = false, job: ReturnType<typeof processPublication> | undefined;
  let reads = 0, sends = 0, unexpected = 0, heldOnce = false;
  context.after(async () => {
    paused.release();
    if (job) await Promise.allSettled([job]);
    context.mock.restoreAll();
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (inserted) await db.delete(s.users).where(eq(s.users.id, id));
  });
  process.env.OWNER_EMAIL = `${id}@example.test`;
  process.env.TELEGRAM_BOT_TOKEN = '123456:SYNTHETIC_ONLY_NEVER_REAL_SECRET';
  process.env.MAX_BOT_TOKEN = 'SYNTHETIC_ONLY_NEVER_REAL_SECRET';
  await db.insert(s.users).values({id, email: process.env.OWNER_EMAIL, displayName: 'Synthetic owner fence', role: 'ADMIN', authInitialized: true, accessState: 'ACTIVE'});
  inserted = true;
  await db.insert(s.sessions).values({id: raw, userId: id, tokenHash: sessionTokenHash(raw), sessionVersion: 0, expiresAt: new Date(Date.now() + 3600000)});
  await db.insert(s.socialAccounts).values({id: accountId, userId: id, provider, displayName: 'Old destination', bindingRevision: 3,
    providerAccountId: destination, enabled: outcome !== 'local', connectionStatus: outcome === 'local' ? 'DISCONNECTED' : 'CONNECTED'});
  await db.insert(s.posts).values({id: postId, userId: id, baseText: 'Immutable owner content', status: 'READY', updatedAt: at});
  await db.insert(s.postTargets).values({id: targetId, postId, socialAccountId: accountId, scheduledAt: at, updatedAt: at});
  await db.insert(s.publications).values({id: publicationId, userId: id, postId, postTargetId: targetId, provider, status: 'QUEUED', scheduledAt: at, idempotencyKey: publicationId, updatedAt: at});
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (provider === 'TELEGRAM' && url.hostname === 'api.telegram.org') {
      if (url.pathname.endsWith('/getMe')) { reads++; return Response.json({ok: true, result: {id: 123456, is_bot: true}}); }
      if (url.pathname.endsWith('/getChat')) { reads++; return Response.json({ok: true, result: {id: Number(body.chat_id), type: 'channel', title: 'New destination'}}); }
      if (url.pathname.endsWith('/getChatMember')) { reads++; return Response.json({ok: true, result: {user: {id: 123456, is_bot: true}, status: 'administrator', can_post_messages: true}}); }
      if (outcome !== 'local' && url.pathname.endsWith('/sendMessage')) {
        sends++;
        if (barrier === 'provider-outcome') { paused.enter(); await paused.held; }
        if (outcome === 'auth') return Response.json({ok: false, error_code: 401}, {status: 401});
        if (outcome === 'ambiguous') throw new Error('Synthetic lost response');
        return Response.json({ok: true, result: {message_id: 9, chat: {id: Number(OLD), type: 'channel'}}});
      }
    }
    if (provider === 'MAX' && url.hostname === 'platform-api2.max.ru') {
      if (url.pathname === '/me') { reads++; return Response.json({user_id: 123456, is_bot: true}); }
      if (url.pathname === `/chats/${NEW}`) { reads++; return Response.json({chat_id: Number(NEW), type: 'channel', status: 'active', title: 'New destination'}); }
      if (url.pathname === `/chats/${NEW}/members/me`) { reads++; return Response.json({user_id: 123456, is_bot: true, is_admin: true, permissions: ['write']}); }
      if (outcome !== 'local' && url.pathname === '/messages' && url.searchParams.get('chat_id') === OLD) {
        sends++;
        if (barrier === 'provider-outcome') { paused.enter(); await paused.held; }
        if (outcome === 'auth') return Response.json({code: 'unauthorized'}, {status: 401});
        if (outcome === 'ambiguous') throw new Error('Synthetic lost response');
        return Response.json({message: {recipient: {chat_id: Number(OLD), chat_type: 'channel'}, body: {mid: '9'}}});
      }
    }
    unexpected++;
    throw new Error('Unexpected provider request; real network is unreachable');
  };
  const query = Client.prototype.query;
  context.mock.method(Client.prototype, 'query', function(this: Client, ...args: unknown[]) {
    const config = args[0] as string | {text?: string; values?: unknown[]};
    const text = typeof config === 'string' ? config : config?.text;
    const values = typeof config === 'string' ? args[1] : config?.values ?? args[1];
    const matching = !heldOnce && typeof text === 'string' && Array.isArray(values) && values.includes(publicationId) &&
      text.startsWith('update "publications"') && values.includes('REQUIRES_RECONNECT');
    if (barrier === 'after-auth-commit' && matching) {
      heldOnce = true;
      // Execute real SQL first; hold only resolution to the production caller.
      // Pool.query uses a callback internally, while transaction clients use promises.
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        args[args.length - 1] = (...result: unknown[]) => {
          if (result[0]) return Reflect.apply(callback, undefined, result);
          paused.enter();
          void paused.held.then(() => Reflect.apply(callback, undefined, result));
        };
        return Reflect.apply(query, this, args);
      }
      return Promise.resolve(Reflect.apply(query, this, args)).then(async result => {
        paused.enter(); await paused.held; return result;
      });
    }
    if (barrier === 'before-error-sql' && !heldOnce && typeof text === 'string' && text.startsWith('update "social_accounts"') &&
        Array.isArray(values) && values.includes(accountId) && values.includes('ERROR')) {
      heldOnce = true;
      paused.enter();
      return paused.held.then(() => Reflect.apply(query, this, args));
    }
    return Reflect.apply(query, this, args);
  } as Client['query']);
  const account = async () => (await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.id, accountId)))[0];
  const publication = async () => (await db.select().from(s.publications).where(eq(s.publications.id, publicationId)))[0];
  return {
    id, accountId, postId, targetId, publicationId, raw, at, account, publication,
    counts: () => ({reads, sends, unexpected}), release: paused.release,
    async start() {
      job = processPublication(publicationId); // Actual configured OWNER resolver.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([paused.entered, job.then(() => { throw new Error('Expected deterministic barrier not reached'); }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Barrier timed out')), 5000); })]);
      } finally { clearTimeout(timer); }
    },
    async finish() { paused.release(); return await job!; },
  };
}

for (const provider of ['TELEGRAM', 'MAX'] as const) {
  for (const barrier of ['after-auth-commit', 'before-error-sql'] as const) {
    test(`native OWNER ${provider} cancel release reconnect survives ${barrier}`, async context => {
      const f = await fixture(context, provider, barrier);
      await f.start();
      const auth = await f.publication();
      assert.equal(auth.status, 'REQUIRES_RECONNECT');
      assert.equal(auth.providerErrorCode, `${provider}_DISCONNECTED`);
      assert.equal(auth.attemptCount, 1);
      assert.ok(auth.lastAttemptAt);
      assert.deepEqual(f.counts(), {reads: 0, sends: 0, unexpected: 0});
      await cancelPublicationApproval(f.raw, f.postId, f.targetId, {expectedPublicationId: f.publicationId,
        expectedPublicationUpdatedAt: auth.updatedAt.toISOString(), expectedTargetUpdatedAt: f.at.toISOString(), expectedBindingRevision: 3}, {mirrorQueue: async () => {}});
      await createSocialConnectionLifecycle().release(f.raw, f.accountId, 3);
      assert.ok(!('ok' in await connectSocialAccount(f.id, f.accountId, NEW)));
      const fresh = await f.account();
      assert.equal(fresh.connectionStatus, 'CONNECTED');
      assert.equal(fresh.connectionGeneration, 2);
      assert.equal(fresh.bindingRevision, 4);
      assert.equal(fresh.providerAccountId, NEW);
      assert.equal((await f.finish()).status, 'REQUIRES_RECONNECT');
      assert.deepEqual(await f.publication(), auth, 'AUTH history remains byte-equivalent');
      assert.deepEqual(await f.account(), fresh, 'Late old AUTH must preserve the new connection');
      assert.equal((await processPublication(f.publicationId)).skipped, true);
      assert.deepEqual(f.counts(), {reads: 3, sends: 0, unexpected: 0});
    });
  }

  for (const field of ['connectionGeneration', 'bindingRevision', 'providerAccountId'] as const) {
    test(`OWNER ${provider} direct-state defense: independent ${field} mismatch fences local AUTH`, async context => {
      const f = await fixture(context, provider, 'after-auth-commit');
      await f.start();
      const auth = await f.publication();
      const change = field === 'connectionGeneration' ? {connectionGeneration: 1} : field === 'bindingRevision' ? {bindingRevision: 4} : {providerAccountId: NEW};
      await db.update(s.socialAccounts).set({...change, connectionStatus: 'CONNECTED'}).where(eq(s.socialAccounts.id, f.accountId));
      const fresh = await f.account();
      await f.finish();
      assert.deepEqual(await f.account(), fresh);
      assert.deepEqual(await f.publication(), auth);
      assert.deepEqual(f.counts(), {reads: 0, sends: 0, unexpected: 0});
    });
  }

  for (const destination of [OLD, null]) {
    test(`OWNER ${provider} unchanged ${destination === null ? 'null' : 'set'} destination still records ERROR`, async context => {
      const f = await fixture(context, provider, 'after-auth-commit', 'local', destination);
      await f.start();
      const auth = await f.publication();
      await f.finish();
      assert.equal((await f.account()).connectionStatus, 'ERROR');
      assert.deepEqual(await f.publication(), auth);
      assert.deepEqual(f.counts(), {reads: 0, sends: 0, unexpected: 0});
    });
  }

  for (const outcome of ['auth', 'receipt', 'ambiguous'] as const) {
    test(`OWNER ${provider} admitted ${outcome} survives direct-state generation change with no duplicate send`, async context => {
      const f = await fixture(context, provider, 'provider-outcome', outcome);
      await f.start();
      await db.update(s.socialAccounts).set({connectionGeneration: 1}).where(eq(s.socialAccounts.id, f.accountId));
      const fresh = await f.account();
      const result = await f.finish(), saved = await f.publication();
      assert.equal(result.status, outcome === 'auth' ? 'REQUIRES_RECONNECT' : outcome === 'receipt' ? 'PUBLISHED' : 'FAILED');
      assert.equal(saved.attemptCount, 1);
      if (outcome === 'auth') { assert.equal(saved.normalizedErrorType, 'AUTH'); assert.equal(saved.providerErrorCode, `${provider}_401`); }
      if (outcome === 'receipt') { assert.equal(saved.providerRemoteId, '9'); assert.equal(saved.analyticsDestinationId, OLD); assert.ok(saved.publishedAt); }
      if (outcome === 'ambiguous') assert.equal(saved.providerErrorCode, 'AMBIGUOUS_DELIVERY');
      assert.deepEqual(await f.account(), fresh);
      assert.equal((await processPublication(f.publicationId)).skipped, true);
      assert.deepEqual(await f.publication(), saved);
      assert.deepEqual(f.counts(), {reads: 0, sends: 1, unexpected: 0});
    });
  }
}

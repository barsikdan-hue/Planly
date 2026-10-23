import { test as baseTest, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { inArray } from 'drizzle-orm';
import { getDb, closeDb } from '../../db/index.ts';
import { users, userInvitations } from '../../db/schema.ts';

type InviteRuntime = { backend: string; base: string };
const test = baseTest.extend<object, { inviteRuntime: InviteRuntime }>({
  inviteRuntime: [async ({ browser }, provide) => {
    expect(browser.version().length > 0).toBe(true);
    const database = new URL(process.env.DATABASE_URL ?? '');
    expect(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/planly_test').toBe(true);
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer(); socket.on('error', reject);
      socket.listen(0, '127.0.0.1', () => { const address = socket.address(); if (!address || typeof address === 'string') { socket.close(); reject(new Error('Loopback port unavailable')); return; } socket.close(() => resolve(address.port)); });
    });
    const backend = `http://127.0.0.1:${port}`, base = `http://localhost:${port}`;
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let startup = '';
    const record = (data: Buffer) => { startup = (startup + data.toString()).slice(-2000); };
    server.stdout.on('data', record); server.stderr.on('data', record);
    try {
      const deadline = Date.now() + 10000; let ready = false;
      while (Date.now() < deadline && server.exitCode === null) { try { ready = (await fetch(`${backend}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {} if (ready) break; await delay(100); }
      if (!ready) throw new Error(`Compiled fixture startup failed: ${startup.includes('EADDRINUSE') ? 'port collision' : startup.includes('production build') ? 'build unavailable' : 'unclassified startup failure'}`);
      server.stdout.off('data', record); server.stderr.off('data', record);
      server.stdout.resume(); server.stderr.resume();
      await provide({ backend, base });
    } finally { if (server.exitCode === null && server.signalCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; } }
  }, { scope: 'worker' }],
});

// Playwright 1.63 otherwise persists an automatic DOM snapshot on failure,
// including the readonly bearer link, even when tracing/screenshots are off.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

// Invitation links and password inputs must never be persisted as test artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('ADMIN manually shares a single-use invite and USER activates an isolated workspace', async ({ page, context, inviteRuntime }) => {
  const database = new URL(process.env.DATABASE_URL ?? '');
  expect(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/planly_test').toBe(true);
  expect(process.env.OWNER_EMAIL?.endsWith('@example.test')).toBe(true);
  const suffix = randomUUID();
  const emails = [`invite-browser-${suffix}@example.test`, `invite-revoked-${suffix}@example.test`];
  const password = 'browser-invite-password';
  const db = getDb(), { base } = inviteRuntime;
  try {
    // Chromium's localhost trust exception accepts the unchanged production
    // Secure cookie on this isolated real socket; this is not TLS proof.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.goto(`${base}/login`);
    // Establish the real ADMIN fixture through the actual auth API. The
    // invited user's complete password-login UI remains asserted below.
    expect(await page.evaluate(async credentials => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) })).status, { email: process.env.OWNER_EMAIL, password: process.env.PLANLY_OWNER_PASSWORD || 'ci-test-owner-password' })).toBe(200);
    await page.goto(`${base}/`);
    await page.locator('.profile-button').click();
    await page.getByRole('menuitem', { name: 'Настройки профиля', exact: true }).click();
    await page.getByRole('link', { name: 'Администрирование коллег', exact: true }).click();
    await expect(page).toHaveURL(`${base}/admin`);
    await expect(page.getByRole('heading', { name: 'Администрирование', exact: true })).toBeVisible();
    const mounted = page.waitForResponse(response => {
      const referer = response.request().headers().referer;
      return new URL(response.url()).pathname === '/api/admin/invitations' && response.request().method() === 'GET' && Boolean(referer && new URL(referer).pathname === '/admin/invitations');
    });
    await page.getByRole('link', { name: /Пригласить коллегу/ }).click();
    expect((await mounted).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Приглашения', exact: true })).toBeVisible();
    const create = async (email: string) => {
      await page.getByLabel('Email', { exact: true }).fill(email);
      const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/invitations' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Пригласить', exact: true }).click();
      expect((await created).status()).toBe(201);
      const field = page.getByLabel('Одноразовая ссылка', { exact: true });
      await expect.poll(() => field.isVisible()).toBe(true);
      // Boolean assertions prevent Playwright diagnostics from printing the token.
      await expect.poll(async () => Boolean((await field.inputValue()).includes('/invite#token='))).toBe(true);
      return field.inputValue();
    };
    const recipientLink = await create(emails[0]);
    expect(new URL(recipientLink).origin === base).toBe(true);
    expect(new URL(recipientLink).search === '').toBe(true);
    await page.getByRole('button', { name: 'Копировать ссылку', exact: true }).click();
    expect(await page.evaluate(async expected => (await navigator.clipboard.readText()) === expected, recipientLink)).toBe(true);
    await create(emails[1]);
    const revokedRow = page.getByRole('listitem').filter({ hasText: emails[1] });
    await revokedRow.getByRole('button', { name: 'Отозвать', exact: true }).click();
    await expect.poll(() => revokedRow.textContent()).toMatch(/отозвано/i);
    // Share the link into a fresh recipient context: no inherited ADMIN cookies.
    await context.clearCookies();
    await page.evaluate(url => { window.location.assign(url); }, recipientLink);
    await expect(page.getByLabel('Подтверждение пароля', { exact: true })).toBeVisible();
    expect(new URL(page.url()).hash === '').toBe(true);
    await expect(page.getByText(`Личный кабинет для ${emails[0]}`, { exact: true })).toBeVisible();
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Активировать аккаунт', exact: true }).click();
    await expect(page).toHaveURL(`${base}/`);
    const ownWorkspace = () => page.evaluate(async () => {
      const response = await fetch('/api/bootstrap');
      const body = await response.json();
      return { status: response.status, email: body.profile?.email, posts: body.posts?.length, media: body.media?.length, library: body.libraryItems?.length, disconnected: body.socialAccounts?.every((account: { enabled: boolean; connectionStatus: string }) => !account.enabled && account.connectionStatus === 'DISCONNECTED') };
    });
    expect(await ownWorkspace()).toEqual({ status: 200, email: emails[0], posts: 0, media: 0, library: 0, disconnected: true });
    const cookie = (await context.cookies(base)).find(value => value.name === 'planly_session');
    expect(Boolean(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax')).toBe(true);
    await page.reload();
    expect((await ownWorkspace()).email).toBe(emails[0]);
    expect(await page.evaluate(async () => (await fetch('/api/admin/invitations')).status)).toBe(403);
    await page.goto(`${base}/admin`);
    await expect(page).toHaveURL(`${base}/`);
    await page.goto(`${base}/admin/invitations`);
    await expect(page).toHaveURL(`${base}/`);
    await expect(page.getByRole('heading', { name: 'Приглашения', exact: true })).toHaveCount(0);
    await page.locator('.profile-button').click();
    await page.getByRole('menuitem', { name: 'Настройки профиля', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Администрирование коллег', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page).toHaveURL(`${base}/login`);
    await page.reload();
    await page.getByLabel('Email', { exact: true }).fill(emails[0]);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page).toHaveURL(`${base}/`);
    expect((await ownWorkspace()).email).toBe(emails[0]);
  } finally {
    // Drain all real proxy requests before stopping the compiled backend.
    await context.unrouteAll({ behavior: 'wait' }); await page.close();
    await db.delete(userInvitations).where(inArray(userInvitations.email, emails));
    await db.delete(users).where(inArray(users.email, emails)); await closeDb();
  }
});

test('replacement invitation pasted into the mounted acceptance page replaces invalid state', async ({ page, context, inviteRuntime }) => {
  const { base, backend } = inviteRuntime;
  const email = `invite-replacement-${randomUUID()}@example.test`, revokedEmail = `invite-revoked-${randomUUID()}@example.test`, password = 'browser-replacement-password';
  const db = getDb(); let adminCookie = '';
  const api = (path: string, cookie: string, body: unknown) => fetch(`${backend}${path}`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const login = await api('/api/auth/login', '', { email: process.env.OWNER_EMAIL, password: process.env.PLANLY_OWNER_PASSWORD || 'ci-test-owner-password' });
    expect(login.status).toBe(200); adminCookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const created = await api('/api/admin/invitations', adminCookie, { email });
    expect(created.status).toBe(201); const { token } = await created.json();
    const revocable = await api('/api/admin/invitations', adminCookie, { email: revokedEmail });
    expect(revocable.status).toBe(201); const revoked = await revocable.json();
    expect((await fetch(`${backend}/api/admin/invitations/${revoked.id}`, { method: 'DELETE', headers: { cookie: adminCookie } })).status).toBe(200);
    await page.goto(`${base}/invite#token=invalid`);
    await expect(page.locator('.login-error[role="alert"]')).toBeVisible();
    expect(new URL(page.url()).hash === '').toBe(true);
    await page.evaluate(link => { window.location.assign(link); }, `${base}/invite#token=${token}`);
    await expect(page.getByLabel('Подтверждение пароля', { exact: true })).toBeVisible();
    expect(new URL(page.url()).hash === '').toBe(true);
    await expect(page.getByText(`Личный кабинет для ${email}`, { exact: true })).toBeVisible();
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(`${password}-different`);
    await page.getByRole('button', { name: 'Активировать аккаунт', exact: true }).click();
    await expect(page.locator('.login-error[role="alert"]')).toContainText('Пароли не совпадают');
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Активировать аккаунт', exact: true }).click();
    await expect(page).toHaveURL(`${base}/`);
    expect(await page.evaluate(async expected => (await (await fetch('/api/profile')).json()).email === expected, email)).toBe(true);
    // Retire the private document before preparing a guest actor. Wiping its
    // cookies while Dashboard requests mount can produce a late 401 redirect
    // that cancels the recipient's public invitation navigation.
    await page.goto(`${base}/login`);
    await context.clearCookies();
    for (const invalidToken of [token, revoked.token]) {
      const inspected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/invitations/inspect' && response.request().method() === 'POST');
      await page.evaluate(link => { window.location.assign(link); }, `${base}/invite#token=${invalidToken}`);
      expect((await inspected).status()).toBe(410);
      await expect(page.locator('.login-error[role="alert"]')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Активировать аккаунт', exact: true })).toHaveCount(0);
      expect(new URL(page.url()).hash === '').toBe(true);
    }
  } finally {
    await context.unrouteAll({ behavior: 'wait' }); await page.close();
    if (adminCookie) await fetch(`${backend}/api/auth/logout`, { method: 'POST', headers: { cookie: adminCookie } }).catch(() => {});
    await db.delete(userInvitations).where(inArray(userInvitations.email, [email, revokedEmail]));
    await db.delete(users).where(inArray(users.email, [email, revokedEmail])); await closeDb();
  }
});

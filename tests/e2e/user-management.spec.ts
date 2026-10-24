import { test as baseTest, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, inArray } from 'drizzle-orm';
import { getDb, closeDb } from '../../db/index.ts';
import { users, sessions } from '../../db/schema.ts';
import { hashOwnerPassword } from '../../lib/server/auth/password.ts';

type ManagementRuntime = { backend: string; base: string };
const test = baseTest.extend<object, { managementRuntime: ManagementRuntime }>({
  managementRuntime: [async ({ browser }, provide) => {
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
      server.stdout.off('data', record); server.stderr.off('data', record); server.stdout.resume(); server.stderr.resume();
      await provide({ backend, base });
    } finally { if (server.exitCode === null && server.signalCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; } }
  }, { scope: 'worker' }],
});

// Never persist session tokens/password forms as automatic failure artifacts.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('ADMIN confirms block and restore without gaining USER content or reviving old sessions', async ({ page, context, managementRuntime }) => {
  const { base, backend } = managementRuntime;
  const suffix = randomUUID(), ids = ['admin', 'a', 'b'].map(name => `management-browser-${name}-${suffix}`);
  const password = 'browser-management-password', db = getDb();
  const cookies: string[] = [];
  const api = (path: string, cookie = '', method = 'GET', body?: unknown) => fetch(`${backend}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = async (id: string) => {
    const response = await api('/api/auth/login', '', 'POST', { email: `${id}@example.test`, password });
    expect(response.status).toBe(200);
    const cookie = (response.headers.get('set-cookie') || '').split(';')[0]; cookies.push(cookie); return cookie;
  };
  try {
    await db.insert(users).values(await Promise.all(ids.map(async (id, index) => ({ id, email: `${id}@example.test`, displayName: index === 0 ? 'Test administrator' : `Test colleague ${index}`, role: index === 0 ? 'ADMIN' as const : 'USER' as const, accessState: 'ACTIVE' as const, authInitialized: true, passwordHash: await hashOwnerPassword(password) }))));
    const oldA = await login(ids[1]), b = await login(ids[2]);
    await page.goto(`${base}/login`);
    expect(await page.evaluate(async credentials => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) })).status, { email: `${ids[0]}@example.test`, password })).toBe(200);
    await page.goto(`${base}/`);
    await page.locator('.profile-button').click();
    await page.getByRole('menuitem', { name: 'Настройки профиля', exact: true }).click();
    await page.getByRole('link', { name: 'Администрирование коллег', exact: true }).click();
    await expect(page).toHaveURL(`${base}/admin`);
    await expect(page.getByRole('heading', { name: 'Администрирование', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Управление коллегами/ }).click();
    await expect(page).toHaveURL(`${base}/admin/users`);
    await expect(page.getByRole('heading', { name: 'Пользователи', exact: true })).toBeVisible();
    const aRow = page.getByRole('row').filter({ hasText: `${ids[1]}@example.test` });
    const bRow = page.getByRole('row').filter({ hasText: `${ids[2]}@example.test` });
    await expect(aRow).toContainText('Test colleague 1'); await expect(aRow).toContainText('Активен');
    await expect(bRow).toContainText('Активен');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await aRow.getByRole('button', { name: 'Заблокировать', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`${ids[1]}@example.test`);
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(dialog).toHaveCount(0); expect((await api('/api/profile', oldA)).status).toBe(200);
    await aRow.getByRole('button', { name: 'Заблокировать', exact: true }).click();
    const block = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/users/${ids[1]}` && response.request().method() === 'POST');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить', exact: true }).click();
    expect((await block).status()).toBe(200);
    await expect(aRow).toContainText('Заблокирован');
    await expect(page.getByRole('status')).toBeVisible();
    expect((await api('/api/profile', oldA)).status).toBe(401);
    expect((await api('/api/auth/login', '', 'POST', { email: `${ids[1]}@example.test`, password })).status).toBe(401);
    expect((await api('/api/profile', b)).status).toBe(200);
    await page.reload(); await expect(aRow).toContainText('Заблокирован');
    await aRow.getByRole('button', { name: 'Восстановить доступ', exact: true }).click();
    const restore = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/users/${ids[1]}` && response.request().method() === 'POST');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить', exact: true }).click();
    expect((await restore).status()).toBe(200); await expect(aRow).toContainText('Активен');
    expect((await api('/api/profile', oldA)).status).toBe(401);
    const newA = await login(ids[1]); expect((await api('/api/profile', newA)).status).toBe(200);
    expect((await api('/api/admin/users', newA)).status).toBe(403);
    expect((await api('/admin/users', newA)).status).toBe(307);
    // The server exposes only access-management fields to this administrator.
    const list = await page.evaluate(async () => (await (await fetch('/api/admin/users')).json()).users as Record<string, unknown>[]);
    expect(list.every(row => Object.keys(row).sort().join(',') === 'accessExpiresAt,accessState,createdAt,displayName,email,id')).toBe(true);
    // Exercise the new access/reset/deletion UI against the compiled real server.
    await aRow.getByLabel(`Срок доступа ${ids[1]}@example.test (МСК)`, { exact: true }).fill('2030-01-02T10:00');
    const deadlineResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/users/${ids[1]}` && response.request().method() === 'POST');
    await aRow.getByRole('button', { name: 'Сохранить срок', exact: true }).click();
    expect((await deadlineResponse).status()).toBe(200);
    await expect(aRow).toContainText('Доступ до');
    expect((await (await api('/api/access', newA)).json()).expiresAt).toBe('2030-01-02T07:00:00.000Z');
    const unlimitedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/users/${ids[1]}` && response.request().method() === 'POST');
    await aRow.getByRole('button', { name: 'Бессрочный доступ', exact: true }).click();
    expect((await unlimitedResponse).status()).toBe(200);
    await expect(aRow.getByRole('status')).toContainText('Срок доступа обновлён');
    expect((await (await api('/api/access', newA)).json()).expiresAt).toBe(null);
    await bRow.getByRole('button', { name: 'Сбросить пароль', exact: true }).click();
    const resetLink = bRow.getByLabel('Одноразовая ссылка сброса', { exact: true });
    await expect(resetLink).toBeVisible();
    const resetContext = await context.browser()!.newContext();
    try {
      const resetPage = await resetContext.newPage();
      await resetPage.goto(await resetLink.inputValue());
      await expect(resetPage).toHaveURL(`${base}/reset-password`);
      await resetPage.getByLabel('Новый пароль', { exact: true }).fill('browser-reset-new-password');
      await resetPage.getByLabel('Повторите пароль', { exact: true }).fill('browser-reset-new-password');
      await resetPage.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
      await expect(resetPage.getByRole('status')).toContainText('Пароль изменён');
      expect((await api('/api/profile', b)).status).toBe(401);
      expect(await resetPage.evaluate(async () => (await fetch('/api/profile')).status)).toBe(401);
    } finally { await resetContext.close(); }
    await bRow.getByRole('button', { name: 'Удалить агента', exact: true }).click();
    const deleteDialog = bRow.getByRole('alertdialog');
    await deleteDialog.getByLabel('Email для подтверждения удаления', { exact: true }).fill('incorrect@example.test');
    await expect(deleteDialog.getByRole('button', { name: 'Подтвердить удаление', exact: true })).toBeDisabled();
    await deleteDialog.getByLabel('Email для подтверждения удаления', { exact: true }).fill(`${ids[2]}@example.test`);
    await deleteDialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
    await expect(bRow).toHaveCount(0);
    // Expire this nonce-owned administrator's actual server session and reload.
    await db.update(sessions).set({ expiresAt: new Date(0) }).where(eq(sessions.userId, ids[0]));
    await page.reload(); await expect(page).toHaveURL(`${base}/login`);
    // Establish a USER through the real login UI after expiry, then reload.
    await page.getByLabel('Email', { exact: true }).fill(`${ids[1]}@example.test`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click(); await expect(page).toHaveURL(`${base}/`);
    await page.reload();
    expect(await page.evaluate(async expected => (await (await fetch('/api/profile')).json()).email === expected, `${ids[1]}@example.test`)).toBe(true);
    await page.goto(`${base}/admin`); await expect(page).toHaveURL(`${base}/`);
    await page.goto(`${base}/admin/users`); await expect(page).toHaveURL(`${base}/`);
    await page.locator('.profile-button').click(); await page.getByRole('menuitem', { name: 'Настройки профиля', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Администрирование коллег', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click(); await expect(page).toHaveURL(`${base}/login`);
  } finally {
    await context.unrouteAll({ behavior: 'wait' }); await page.close();
    for (const cookie of cookies) await api('/api/auth/logout', cookie, 'POST').catch(() => {});
    await db.delete(users).where(inArray(users.id, ids)); await closeDb();
  }
});

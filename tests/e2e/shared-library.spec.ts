import { test as baseTest, expect, type Page } from '@playwright/test';
import { asc, eq, inArray } from 'drizzle-orm';
import { libraryItems, libraryItemMedia, mediaAssets, posts, postTargets, publications } from '../../db/schema.ts';
import { startSharedLibraryRuntime } from '../shared-library-http-smoke.mjs';

type SharedRuntime = Awaited<ReturnType<typeof startSharedLibraryRuntime>>;
const test = baseTest.extend<object, { sharedRuntime: SharedRuntime }>({
  sharedRuntime: [async ({ browser }, provide) => {
    expect(browser.version().length > 0).toBe(true);
    const fixture = await startSharedLibraryRuntime();
    try { await provide(fixture); } finally { await fixture.cleanup(); }
  }, { scope: 'worker' }],
});

// Auth inputs, cookies and signed previews must never enter automatic artifacts.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

async function openPrepared(page: Page, base: string, displayName: string) {
  await page.goto(`${base}/`);
  await expect(page.locator('.profile-button')).toContainText(displayName);
  await page.evaluate(() => { window.location.hash = 'content'; });
  await expect(page.getByRole('heading', { name: 'Библиотека', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Заготовки', exact: true }).click();
}

test('ADMIN publishes explicitly; USER copies selected ordered media into independent personal items', async ({ page, context, browser, sharedRuntime }) => {
  const { api, db, ids, sources, media, admin, a, b, originals, originalAssets, baseline, base, password } = sharedRuntime;
  const writes: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  try {
    // ADMIN session is issued by the actual login API, over this compiled server.
    await page.goto(`${base}/login`);
    expect(await page.evaluate(async credentials => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) })).status, { email: `${ids[0]}@example.test`, password })).toBe(200);
    await openPrepared(page, base, 'Shared fixture 0');
    await expect(page.getByRole('button', { name: 'Мои', exact: true })).toBeVisible();
    const card = (title: string) => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(card('Archived hidden').getByRole('button', { name: 'Добавить в общую библиотеку', exact: true })).toHaveCount(0);
    for (const title of ['Shared text', 'Shared ordered media']) {
      const published = page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/admin/shared-library/') && response.request().method() === 'POST');
      await card(title).getByRole('button', { name: 'Добавить в общую библиотеку', exact: true }).click();
      expect((await published).status()).toBe(200);
      await expect(card(title).getByRole('button', { name: 'Убрать из общей библиотеки', exact: true })).toBeVisible();
    }
    await page.reload();
    await expect(card('Shared text').getByRole('button', { name: 'Убрать из общей библиотеки', exact: true })).toBeVisible();
    await context.clearCookies();
    // Colleague A uses the real password form and reloads the actual app.
    await page.goto(`${base}/login`);
    await page.getByLabel('Email', { exact: true }).fill(`${ids[1]}@example.test`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page).toHaveURL(`${base}/`);
    await openPrepared(page, base, 'Shared fixture 1');
    await expect(page.getByRole('button', { name: 'Добавить в общую библиотеку', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Общие', exact: true }).click();
    await expect(card('Shared text')).toBeVisible(); await expect(card('Shared ordered media')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Private hidden', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Archived hidden', exact: true })).toHaveCount(0);
    const ordered = card('Shared ordered media');
    await expect(ordered.locator('video')).toHaveCount(1); await expect(ordered.locator('img')).toHaveCount(1);
    expect(await ordered.locator('video, img').evaluateAll(nodes => nodes.map(node => node.tagName))).toEqual(['VIDEO', 'IMG']);
    await expect.poll(() => ordered.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => ordered.locator('video').evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
    // Explicit fixture-only UI evidence after login; automatic auth artifacts stay off.
    await page.screenshot({ path: test.info().outputPath('shared-library.png'), fullPage: false });
    // Merely browsing/choosing materials must never copy them.
    expect((await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[1]))).length).toBe(1);
    await card('Shared text').getByRole('checkbox').check(); await ordered.getByRole('checkbox').check();
    expect((await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[1]))).length).toBe(1);
    // Deliver the real request but lose its successful response. Reload must
    // recover the same durable intent instead of creating a second batch.
    let originalKey = '';
    await page.route('**/api/shared-library/copy', async route => {
      originalKey = route.request().headers()['idempotency-key'];
      const committed = await route.fetch(); expect(committed.status()).toBe(201);
      await route.abort('failed');
    }, { times: 1 });
    await page.getByRole('button', { name: /Добавить выбранные/ }).click();
    await expect(page.getByRole('button', { name: 'Проверить результат копирования', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Общая библиотека', exact: true }).getByRole('alert')).toBeVisible();
    expect((await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[1]))).length).toBe(3);
    await page.reload();
    await page.getByRole('button', { name: 'Общие', exact: true }).click();
    const copied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/shared-library/copy' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Проверить результат копирования', exact: true }).click();
    const copyResponse = await copied; expect(copyResponse.status()).toBe(201);
    const receipt = await copyResponse.json(); expect(receipt.items).toHaveLength(2);
    expect(copyResponse.request().headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/i);
    expect(copyResponse.request().headers()['idempotency-key']).toBe(originalKey);
    await expect(page.getByRole('button', { name: /Добавить выбранные/ })).toBeVisible();
    await page.getByRole('button', { name: 'Мои', exact: true }).click();
    await expect(card('Shared text')).toBeVisible(); await expect(card('Shared ordered media')).toBeVisible();
    await page.reload();
    await expect(card('Shared text')).toBeVisible(); await expect(card('Shared ordered media')).toBeVisible();
    const mine = await db.select().from(libraryItems).where(eq(libraryItems.userId, ids[1]));
    expect(mine).toHaveLength(3); expect(mine.filter(row => row.title !== 'Colleague private').every(row => row.status === 'READY')).toBe(true);
    const copiedOrdered = mine.find(row => row.title === 'Shared ordered media')!;
    const attachments = await db.select().from(libraryItemMedia).where(eq(libraryItemMedia.libraryItemId, copiedOrdered.id)).orderBy(asc(libraryItemMedia.position));
    expect(attachments).toHaveLength(2);
    for (let index = 0; index < attachments.length; index++) {
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, attachments[index].mediaId));
      expect(asset.userId).toBe(ids[1]); expect(asset.id).not.toBe(media[index].id); expect(asset.originalName).toBe(media[index].name);
      expect(originalAssets.some(original => original.storageKey === asset.storageKey)).toBe(false);
    }
    expect((await api(`/api/library-items/${sources[0]}`, a, 'DELETE')).status).toBe(404);
    expect((await api(`/api/library-items/${copiedOrdered.id}`, b, 'DELETE')).status).toBe(404);
    expect((await api('/api/admin/shared-library', a)).status).toBe(403);
    // B starts with only their own private item and can copy one item explicitly.
    const bContext = await browser.newContext({ viewport: page.viewportSize() || undefined });
    const bPage = await bContext.newPage();
    try {
      await bPage.goto(`${base}/login`);
      expect(await bPage.evaluate(async credentials => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) })).status, { email: `${ids[2]}@example.test`, password })).toBe(200);
      await openPrepared(bPage, base, 'Shared fixture 2'); await expect(bPage.getByRole('heading', { name: 'Shared text', exact: true })).toHaveCount(0);
      await bPage.getByRole('button', { name: 'Общие', exact: true }).click();
      const single = bPage.locator('article').filter({ has: bPage.getByRole('heading', { name: 'Shared text', exact: true }) });
      const response = bPage.waitForResponse(value => new URL(value.url()).pathname === '/api/shared-library/copy' && value.request().method() === 'POST');
      await single.getByRole('button', { name: 'Добавить себе', exact: true }).click(); expect((await response).status()).toBe(201);
      await bPage.getByRole('button', { name: 'Мои', exact: true }).click(); await expect(bPage.getByRole('heading', { name: 'Shared text', exact: true })).toBeVisible();
    } finally { await bContext.close(); }
    // ADMIN unshares; A's committed personal copy survives source visibility changes.
    expect((await api(`/api/admin/shared-library/${sources[1]}`, admin, 'POST', { shared: false })).status).toBe(200);
    await page.getByRole('button', { name: 'Общие', exact: true }).click();
    await expect(card('Shared ordered media')).toHaveCount(0);
    await page.getByRole('button', { name: 'Мои', exact: true }).click(); await expect(card('Shared ordered media')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(writes.some(path => /\/api\/(posts|scheduling-plans|publications)/.test(path))).toBe(false);
    expect(await db.select().from(libraryItems).where(inArray(libraryItems.id, sources))).toEqual(originals);
    expect(await db.select().from(mediaAssets).where(eq(mediaAssets.userId, ids[0]))).toEqual(originalAssets);
    expect(await Promise.all([posts, postTargets, publications].map(table => db.select().from(table)))).toEqual(baseline);
  } finally { await page.close(); }
});

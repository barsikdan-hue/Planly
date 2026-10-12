import { test, expect } from './fixtures';

test('calendar navigation and day/week/month controls render real UI', async ({ page }, testInfo) => {
  const writes: string[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/') && req.method() !== 'GET') writes.push(req.method()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Хорошего дня, Harness Owner! 👋', exact: true })).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).filter({ visible: true }).first().click();
  }
  await page.getByRole('button', { name: 'Календарь', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'День', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'День', exact: true })).toHaveAttribute('aria-selected', 'true');
  const period = page.locator('.calendar-toolbar h2');
  const previous = await period.textContent();
  await page.getByRole('button', { name: 'Следующий период', exact: true }).click();
  await expect(period).not.toHaveText(previous!);
  await page.getByRole('tab', { name: 'Месяц', exact: true }).click();
  await expect(page.locator('.month-day')).toHaveCount(42);
  await page.getByRole('tab', { name: 'Неделя', exact: true }).click();
  await expect(page.locator('.day-column')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'Outer page horizontal overflow').toBeLessThanOrEqual(1);
  await testInfo.attach('calendar', { body: await page.screenshot(), contentType: 'image/png' });
  expect(writes).toEqual([]);
});

test('unsaved draft preview and reload recovery without saving or sending', async ({ page }, testInfo) => {
  const writes: string[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/') && req.method() !== 'GET') writes.push(req.method()); });
  await page.goto('/#create');
  await expect(page.getByRole('heading', { name: 'Создать пост', exact: true })).toBeVisible();
  const text = 'HARNESS synthetic draft\nPreview and reload recovery';
  const editor = page.locator('textarea').first();
  await editor.fill(text);
  await expect(page.locator('.preview-text')).toContainText('HARNESS synthetic draft');
  await page.reload();
  await expect(page.locator('textarea').first()).toHaveValue(text);
  await expect(page.locator('.preview-text')).toContainText('Preview and reload recovery');
  await testInfo.attach('recovered-draft', { body: await page.screenshot(), contentType: 'image/png' });
  expect(writes).toEqual([]);
});

test.describe('controlled failure', () => {
test.use({ rejectBootstrapOnce: true });
test('controlled bootstrap 503 exposes error and explicit reload recovers', async ({ page }, testInfo) => {
  let bootstrapRequests = 0;
  page.on('request', request => { if (request.url() === 'http://127.0.0.1:4318/api/bootstrap') bootstrapRequests++; });
  await page.goto('/');
  await expect(page.getByText('Не удалось загрузить серверные данные. Обнови страницу после восстановления соединения.')).toBeVisible();
  await testInfo.attach('controlled-503', { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Хорошего дня, Harness Owner! 👋', exact: true })).toBeVisible();
  expect(bootstrapRequests).toBe(2);
});
});

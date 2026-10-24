import { test as base, expect, type Locator, type Page } from '@playwright/test';

// Public synthetic fixtures only; no account, cookie, environment file or backend.
const ORIGIN = 'http://127.0.0.1:4318';
const EMAIL = 'login-visibility@example.invalid';
const PASSWORD = 'SYNTHETIC-only-login-42!';
type LoginFixture = { requests: { email: string; password: string }[]; release: () => void };
type ObservedForm = HTMLFormElement & { __syntheticSubmitCount?: number };
type MarkedPassword = HTMLInputElement & { __syntheticLoginIdentity?: boolean };

// Separate scoped fixture: the shared planner guard continues to reject all POSTs.
const test = base.extend<{ loginFixture: LoginFixture }>({
  loginFixture: async ({ context, page }, provide, testInfo) => {
    const unexpected: string[] = [], runtimeErrors: string[] = [], consoleErrors: string[] = [];
    const requests: LoginFixture['requests'] = [];
    let release: () => void = () => {};
    const reply = new Promise<void>(resolve => { release = resolve; });
    const counts = { external: 0, apiReads: 0, syntheticLoginPosts: 0 };
    await context.routeWebSocket('**/*', socket => {
      unexpected.push('Unexpected WebSocket'); socket.close();
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== ORIGIN) {
        counts.external++; unexpected.push('External request');
        return route.abort('blockedbyclient');
      }
      if (url.pathname === '/api/auth/login' && url.search === '' && request.method() === 'POST') {
        let body: Record<string, unknown>;
        try { body = request.postDataJSON() as Record<string, unknown>; }
        catch { unexpected.push('Malformed synthetic login body'); return route.abort('blockedbyclient'); }
        if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'email,password' || body.email !== EMAIL || body.password !== PASSWORD) {
          unexpected.push('Login payload outside synthetic fixture'); return route.abort('blockedbyclient');
        }
        requests.push({ email: body.email, password: body.password }); counts.syntheticLoginPosts++;
        await reply;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      if (url.pathname.startsWith('/api/')) {
        const bootstrap = url.pathname === '/api/bootstrap' && url.search === '';
        const analytics = url.pathname === '/api/analytics' &&
          [...url.searchParams.keys()].sort().join(',') === 'page,period,provider' &&
          ['max', 'telegram'].includes(url.searchParams.get('provider') ?? '') &&
          url.searchParams.get('period') === '7' && url.searchParams.get('page') === '0';
        const access = url.pathname === '/api/access' && url.search === '';
        if (request.method() !== 'GET' || !(bootstrap || analytics || access)) {
          unexpected.push('Unexpected API operation'); return route.abort('blockedbyclient');
        }
        counts.apiReads++;
      } else if (request.method() !== 'GET') {
        unexpected.push('Unexpected document/asset mutation'); return route.abort('blockedbyclient');
      }
      // Allowed reads reach only the existing fixed-loopback Vite synthetic API.
      return route.continue();
    });
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    try { await provide({ requests, release }); }
    finally {
      release(); await context.unrouteAll({ behavior: 'wait' });
      await testInfo.attach('login-network-guard', { body: Buffer.from(JSON.stringify(counts)), contentType: 'application/json' });
      expect(unexpected, 'Unexpected network/API operation').toEqual([]);
      expect(runtimeErrors, 'Browser runtime errors').toEqual([]);
      expect(consoleErrors, 'Browser console errors').toEqual([]);
    }
  },
});

async function openLogin(page: Page) {
  await page.goto('/login');
  const password = page.getByLabel('Пароль', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  // Both required controls are valid, so an erroneous toggle submit cannot hide
  // behind the browser's form validation.
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await password.fill(PASSWORD);
  await page.locator('form').evaluate(form => {
    const observed = form as ObservedForm; observed.__syntheticSubmitCount = 0;
    form.addEventListener('submit', () => { observed.__syntheticSubmitCount = (observed.__syntheticSubmitCount ?? 0) + 1; }, { capture: true });
  });
  await password.evaluate(input => {
    const marked = input as MarkedPassword; marked.__syntheticLoginIdentity = true;
    marked.focus(); marked.setSelectionRange(3, 9);
  });
  return password;
}

async function expectPreserved(password: Locator) {
  // Changing input type can defer a selection reset until browser layout.
  await password.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await password.evaluate(input => {
    const marked = input as MarkedPassword;
    return { value: marked.value, start: marked.selectionStart, end: marked.selectionEnd, sameInput: marked.__syntheticLoginIdentity === true };
  })).toEqual({ value: PASSWORD, start: 3, end: 9, sameInput: true });
}

async function expectNoSubmit(page: Page, fixture: LoginFixture) {
  expect(await page.locator('form').evaluate(form => (form as ObservedForm).__syntheticSubmitCount)).toBe(0);
  expect(fixture.requests).toEqual([]);
  await expect(page).toHaveURL(ORIGIN + '/login');
}

test('pointer or touch reveal/hide keeps the same password field, selection and typing focus without submitting', async ({ page, loginFixture }, testInfo) => {
  const password = await openLogin(page);
  const show = page.getByRole('button', { name: 'Показать пароль', exact: true });
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  const inputBox = await password.boundingBox(), toggleBox = await show.boundingBox();
  expect(inputBox).not.toBeNull(); expect(toggleBox).not.toBeNull();
  expect(toggleBox!.width).toBeGreaterThanOrEqual(44); expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
  expect(toggleBox!.x).toBeGreaterThanOrEqual(inputBox!.x - 1);
  expect(toggleBox!.y).toBeGreaterThanOrEqual(inputBox!.y - 1);
  expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(inputBox!.x + inputBox!.width + 1);
  expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(inputBox!.y + inputBox!.height + 1);
  expect(await password.evaluate(input => Number.parseFloat(getComputedStyle(input).paddingRight))).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === 'mobile') await show.tap(); else await show.click();
  await expect(password).toHaveAttribute('type', 'text');
  const hide = page.getByRole('button', { name: 'Скрыть пароль', exact: true });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await expect(password).toBeFocused(); await expectPreserved(password); await expectNoSubmit(page, loginFixture);
  if (testInfo.project.name === 'mobile') await hide.tap(); else await hide.click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  await expect(password).toBeFocused(); await expectPreserved(password); await expectNoSubmit(page, loginFixture);
});

test('Enter and Space on the eye button toggle visibility and preserve keyboard focus without submitting', async ({ page, loginFixture }) => {
  const password = await openLogin(page);
  await password.press('Tab');
  const show = page.getByRole('button', { name: 'Показать пароль', exact: true });
  await expect(show).toBeFocused(); await expect(show).toHaveAttribute('aria-pressed', 'false');
  await show.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  const hide = page.getByRole('button', { name: 'Скрыть пароль', exact: true });
  await expect(hide).toBeFocused(); await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await expectPreserved(password); await expectNoSubmit(page, loginFixture);
  await hide.press('Space');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(show).toBeFocused(); await expect(show).toHaveAttribute('aria-pressed', 'false');
  await expectPreserved(password); await expectNoSubmit(page, loginFixture);
});

for (const trigger of ['button', 'Enter'] as const) {
  test(`login submit by ${trigger} still sends the original credentials exactly once and redirects`, async ({ page, loginFixture }) => {
    const password = await openLogin(page);
    await page.getByRole('button', { name: 'Показать пароль', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    if (trigger === 'Enter') {
      await page.getByRole('button', { name: 'Скрыть пароль', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'password');
    }
    await expectNoSubmit(page, loginFixture);
    const submit = page.locator('button[type="submit"]');
    if (trigger === 'button') await submit.click(); else await password.press('Enter');
    await expect.poll(() => loginFixture.requests.length).toBe(1);
    expect(loginFixture.requests).toEqual([{ email: EMAIL, password: PASSWORD }]);
    expect(await page.locator('form').evaluate(form => (form as ObservedForm).__syntheticSubmitCount)).toBe(1);
    await expect(submit).toBeDisabled(); await expect(submit).toHaveText('Входим…');
    loginFixture.release();
    await expect(page).toHaveURL(ORIGIN + '/');
    await expect(page.getByRole('heading', { name: 'Хорошего дня, Harness Owner! 👋', exact: true })).toBeVisible();
    expect(loginFixture.requests).toHaveLength(1);
  });
}

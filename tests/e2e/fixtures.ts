import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ networkGuard: void; rejectBootstrapOnce: boolean }>({
  rejectBootstrapOnce: [false, { option: true }],
  networkGuard: [async ({ context, page, rejectBootstrapOnce }, use, testInfo) => {
    const unexpected: string[] = [];
    const runtimeErrors: string[] = [];
    const consoleErrors: { text: string; url: string }[] = [];
    let rejected = false;
    let expected503 = 0;
    const counts = { requests: 0, apiReads: 0, writes: 0, external: 0 };
    await context.routeWebSocket('**/*', socket => {
      unexpected.push('Unexpected WebSocket');
      socket.close(); // Preview has no HMR; never connect a socket to a real service.
    });
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      counts.requests++;
      if (url.origin !== 'http://127.0.0.1:4318') {
        counts.external++; unexpected.push(`External ${url.origin}`);
        return route.abort('blockedbyclient');
      }
      if (url.pathname.startsWith('/api/')) {
        const allowed = url.pathname === '/api/access' || url.pathname === '/api/bootstrap' || url.pathname === '/api/library/batch-consent/preview' || (url.pathname === '/api/analytics' &&
          ['telegram', 'max'].includes(url.searchParams.get('provider') ?? '') &&
          url.searchParams.get('period') === '7' && url.searchParams.get('page') === '0');
        if (request.method() !== 'GET' || !allowed) {
          counts.writes += Number(request.method() !== 'GET');
          unexpected.push(`${request.method()} ${url.pathname}`);
          return route.abort('blockedbyclient');
        }
        counts.apiReads++;
        if (url.pathname === '/api/bootstrap' && rejectBootstrapOnce && !rejected) {
          rejected = true;
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"synthetic fixture unavailable"}' });
        }
      }
      return route.continue();
    });
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
    });
    page.on('response', response => {
      if (new URL(response.url()).pathname === '/api/bootstrap' && response.status() === 503) expected503++;
    });
    await use();
    const resourceErrors = consoleErrors.filter(message => rejectBootstrapOnce &&
      message.url === 'http://127.0.0.1:4318/api/bootstrap' &&
      message.text === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)');
    const unexplainedConsole = consoleErrors.filter(message => !resourceErrors.includes(message));
    await testInfo.attach('network-guard', { body: Buffer.from(JSON.stringify(counts)), contentType: 'application/json' });
    expect(unexpected, 'Unexpected network/API operation').toEqual([]);
    expect(runtimeErrors, 'Browser runtime errors').toEqual([]);
    expect(unexplainedConsole, 'Unexplained console errors').toEqual([]);
    expect(resourceErrors.length).toBeLessThanOrEqual(rejectBootstrapOnce ? 1 : 0);
    expect(expected503).toBe(rejectBootstrapOnce ? 1 : 0);
  }, { auto: true }],
});
export { expect };

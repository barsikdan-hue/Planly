import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import type { LibraryItemDto } from '../../lib/contracts/library';

export const reviewTail = 'SWIPE REVIEW LAST LINE';
export const reviewText = [
  ...Array.from({ length: 40 }, (_, index) => `Review line ${index + 1}: read the complete publication before approving.`),
  'LongWord'.repeat(120),
  reviewTail,
].join('\n');
const timestamp = '2026-10-01T00:00:00.000Z';
const makeItem = (id: string, text: string): LibraryItemDto => ({
  id, title: `Review ${id}`, text, mediaIds: [], status: 'READY', sourcePostId: null,
  createdAt: timestamp, updatedAt: timestamp,
});
export type Decision = { action: 'approve' | 'reject'; itemId: string; text?: string };

type FixtureControl = { decisions: Decision[]; empty: boolean; owner: string; scheduled: boolean; beforeDecision: (() => Promise<void>) | null; beforeBootstrap: (() => Promise<void>) | null; failDecision: boolean; withMedia: boolean };
export const test = base.extend<{ swipeFixture: FixtureControl }>({
  swipeFixture: [async ({ context, page }, use, testInfo) => {
    const items = [makeItem('a', reviewText), ...['b', 'c', 'd'].map(id => makeItem(id, `Short review ${id}`))];
    const itemsB = ['a','b','c','d'].map(id => ({...makeItem(`B-${id}`,`Short owner B ${id}`),title:`Owner B ${id}`}));
    const currentItems = () => control.empty ? [] : control.owner === 'swipe-owner' ? items : itemsB;
    const decisions: Decision[] = [];
    const control: FixtureControl = { decisions, empty: false, owner: 'swipe-owner', scheduled: false, beforeDecision: null, beforeBootstrap: null, failDecision: false, withMedia: false };
    const unexpected: string[] = [];
    const errors: string[] = [];
    const post = { id: 'existing-draft', title: 'Existing publication', baseText: reviewText,
      status: 'DRAFT', targets: [], mediaIds: [], createdAt: timestamp, updatedAt: timestamp };
    await context.routeWebSocket('**/*', socket => { unexpected.push('WebSocket'); socket.close(); });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4318') {
        unexpected.push(`External ${url.origin}`);
        return route.abort('blockedbyclient');
      }
      if(control.withMedia && request.method()==='GET' && ['/fixture-photo.png','/fixture-video.webm'].includes(url.pathname)) return route.fulfill({status:200,contentType:url.pathname.endsWith('.png')?'image/png':'video/webm',body:await readFile(new URL(url.pathname.endsWith('.png')?'./assets/swipe-photo.png':'./assets/swipe-video.webm',import.meta.url))});
      if (!url.pathname.startsWith('/api/')) {
        if (request.method() === 'GET') return route.continue();
      } else {
        const reply = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'GET' && url.pathname === '/api/bootstrap') { await control.beforeBootstrap?.(); if(control.withMedia) items[0].mediaIds=['photo','video']; return reply({
          profile: { id: control.owner, email: 'swipe@example.invalid', displayName: 'Swipe fixture' },
          posts: [{ ...post, ...(control.scheduled ? { status: 'READY', targets: [{ id: 'target', socialAccountId: 'tg', provider: 'telegram', textOverride: null, scheduledAt: '2099-01-01T09:00:00Z', publication: null }] } : {}) }], media: control.withMedia ? [{id:'photo',originalName:'Fixture photo',mimeType:'image/png',byteSize:100,previewUrl:'/fixture-photo.png'},{id:'video',originalName:'Fixture video',mimeType:'video/webm',byteSize:100,previewUrl:'/fixture-video.webm'}] : [], socialAccounts: [], libraryItems: currentItems(),
        }); }
        if (request.method() === 'GET' && url.pathname === '/api/library-items') return reply(currentItems());
        if (request.method() === 'GET' && url.pathname === '/api/analytics' &&
            ['telegram', 'max'].includes(url.searchParams.get('provider') ?? '') &&
            url.searchParams.get('period') === '7' && url.searchParams.get('page') === '0') return reply({
          provider: url.searchParams.get('provider'), period: 7, page: 0, pageSize: 20,
          eligibleCount: 0, observedCount: 0, total: null, totalOverflow: false, rows: [], asOf: timestamp,
        });
        if (request.method() === 'POST' && url.pathname === '/api/posts') {
          await control.beforeDecision?.();
          if(control.failDecision) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture source changed',code:'LIBRARY_SOURCE_STALE'})});
          const input = request.postDataJSON();
          const item = [...items,...itemsB].find(item => item.id === input.sourceLibraryItemId && item.status === 'READY');
          if (item && input.status === 'DRAFT' && Array.isArray(input.targets) && input.targets.length === 0 &&
              input.baseText === item.text && input.sourceLibraryUpdatedAt === item.updatedAt &&
              Array.isArray(input.mediaIds) && input.mediaIds.length === 0 && request.headers()['idempotency-key']) {
            decisions.push({ action: 'approve', itemId: item.id, text: input.baseText });
            item.status = 'USED'; item.sourcePostId = `saved-${item.id}`;
            return reply({ ...post, id: item.sourcePostId, title: item.title, baseText: item.text });
          }
        }
        if (request.method() === 'PATCH' && url.pathname.startsWith('/api/library-items/')) {
          await control.beforeDecision?.();
          if(control.failDecision) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture source changed',code:'LIBRARY_SOURCE_STALE'})});
          const input = request.postDataJSON();
          const item = [...items,...itemsB].find(item => url.pathname === `/api/library-items/${item.id}` && item.status === 'READY');
          if (item && input.status === 'ARCHIVED' && input.expectedUpdatedAt === item.updatedAt && Object.keys(input).length === 2) {
            decisions.push({ action: 'reject', itemId: item.id }); item.status = 'ARCHIVED';
            return reply(item);
          }
        }
      }
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await use(control);
    await testInfo.attach('synthetic-decisions', { body: Buffer.from(JSON.stringify(decisions.map(({ action, itemId }) => ({ action, itemId })))), contentType: 'application/json' });
    expect(unexpected, 'Only loopback fixtures may receive requests').toEqual([]);
    expect(errors, 'Browser runtime/console errors').toEqual(control.failDecision ? ['Failed to load resource: the server responded with a status of 409 (Conflict)'] : []);
  }, { auto: true }],
});
export { expect };

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

type FixtureControl = { decisions: Decision[]; empty: boolean; owner: string; scheduled: boolean; beforeDecision: (() => Promise<void>) | null; beforeBootstrap: (() => Promise<void>) | null; failDecision: boolean; withMedia: boolean; telegramConnected: boolean; maxConnected: boolean; slot: string | null; failPreview: boolean; conflictOnce: boolean; loseResponse: boolean; requests: {body: string; key: string}[]; dislikeRequests:{body:string;key:string}[]; loseDislikeResponse:boolean; deletedResult:boolean; beforeFeedback:(()=>Promise<void>)|null; feedbackRequests:string[] };
export const test = base.extend<{ swipeFixture: FixtureControl }>({
  swipeFixture: [async ({ context, page }, use, testInfo) => {
    const items = [makeItem('a', reviewText), ...['b', 'c', 'd'].map(id => makeItem(id, `Short review ${id}`))];
    const itemsB = ['a','b','c','d'].map(id => ({...makeItem(`B-${id}`,`Short owner B ${id}`),title:`Owner B ${id}`}));
    const currentItems = () => control.empty ? [] : control.owner === 'swipe-owner' ? items : itemsB;
    const decisions: Decision[] = [];
    const control: FixtureControl = { decisions, empty: false, owner: 'swipe-owner', scheduled: false, beforeDecision: null, beforeBootstrap: null, failDecision: false, withMedia: false,telegramConnected:true,maxConnected:false,slot:'2099-01-01T07:00:00.000Z',failPreview:false,conflictOnce:false,loseResponse:false,requests:[],dislikeRequests:[],loseDislikeResponse:false,deletedResult:false,beforeFeedback:null,feedbackRequests:[] };
    let controlledConflicts=0,controlledDeleted=0;
    const committed = new Map<string,unknown>();
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
        if (request.method() === 'GET' && url.pathname === '/api/access' && url.search === '') return reply({ expiresAt: null, canPublish: true });
        if (request.method() === 'GET' && url.pathname === '/api/library/batch-consent/preview' && url.search === '') return reply({ eligible: false });
        // This content-workflow fixture grants empty ADMIN sharing metadata;
        // real ADMIN/USER permissions are covered by native and compiled E2E sessions.
        if (request.method() === 'GET' && url.pathname === '/api/admin/shared-library') return reply({ sourceIds: [] });
        if (request.method() === 'GET' && url.pathname === '/api/bootstrap') { await control.beforeBootstrap?.(); if(control.withMedia) items[0].mediaIds=['photo','video']; return reply({
          profile: { id: control.owner, email: 'swipe@example.invalid', displayName: 'Swipe fixture' },
          posts: [{ ...post, ...(control.scheduled ? { status: 'READY', targets: [{ id: 'target', socialAccountId: 'tg', provider: 'telegram', textOverride: null, scheduledAt: '2099-01-01T09:00:00Z', publication: null }] } : {}) }], media: control.withMedia ? [{id:'photo',originalName:'Fixture photo',mimeType:'image/png',byteSize:100,previewUrl:'/fixture-photo.png'},{id:'video',originalName:'Fixture video',mimeType:'video/webm',byteSize:100,previewUrl:'/fixture-video.webm'}] : [], socialAccounts: [{id:'tg',provider:'telegram',providerAccountId:null,displayName:'Telegram',enabled:true,connectionStatus:control.telegramConnected?'CONNECTED':'DISCONNECTED'},{id:'max',provider:'max',providerAccountId:null,displayName:'MAX',enabled:true,connectionStatus:control.maxConnected?'CONNECTED':'DISCONNECTED'}], libraryItems: currentItems(),
        }); }
        if (request.method() === 'GET' && url.pathname === '/api/planner-slots' && url.searchParams.get('swipeReview')==='true') return control.failPreview ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture preview unavailable'})}) : reply({scheduledAt:control.slot});
        if(request.method()==='GET' && ['/api/swipe-feedback','/api/swipe-feedback/export'].includes(url.pathname)){control.feedbackRequests.push(url.pathname);const snapshot={version:1,aggregate:{likes:0,dislikes:0,total:0,likeRatio:null},current:[],receipts:[]};await control.beforeFeedback?.();return reply(snapshot);}
        if (request.method() === 'GET' && url.pathname === '/api/library-items') return reply(currentItems());
        if (request.method() === 'GET' && url.pathname === '/api/analytics' &&
            ['telegram', 'max'].includes(url.searchParams.get('provider') ?? '') &&
            url.searchParams.get('period') === '7' && url.searchParams.get('page') === '0') return reply({
          provider: url.searchParams.get('provider'), period: 7, page: 0, pageSize: 20,
          eligibleCount: 0, observedCount: 0, total: null, totalOverflow: false, rows: [], asOf: timestamp,
        });
        if (request.method() === 'POST' && url.pathname === '/api/posts') {
          await control.beforeDecision?.();
          if(control.failDecision) { controlledConflicts++; return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture source changed',code:'LIBRARY_SOURCE_STALE'})}); }
          const input = request.postDataJSON();
          const key=request.headers()['idempotency-key'];control.requests.push({body:request.postData()!,key});
          if(committed.has(key)){if(control.deletedResult){controlledDeleted++;return route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({code:'DECISION_RESULT_DELETED',error:'Result deleted'})});}return reply(committed.get(key));}
          if(control.conflictOnce){control.conflictOnce=false;controlledConflicts++;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture manual slot occupied',code:'PLANNER_SLOT_CONFLICT'})});}
          const item = [...items,...itemsB].find(item => item.id === input.sourceLibraryItemId && item.status === 'READY');
          if (item && input.status === 'READY' && input.swipeReview && input.requireFreeSlot===true && Array.isArray(input.targets) && input.targets.length === 1 && ['telegram','max'].includes(input.targets[0].provider) && typeof input.targets[0].scheduledAt==='string' && Date.parse(input.targets[0].scheduledAt)>=Date.now()+60_000 &&
              input.baseText === item.text && input.sourceLibraryUpdatedAt === item.updatedAt &&
              Array.isArray(input.mediaIds) && input.mediaIds.length === 0 && request.headers()['idempotency-key']) {
            decisions.push({ action: 'approve', itemId: item.id, text: input.baseText });
            item.status = 'USED'; item.sourcePostId = `saved-${item.id}`;
            const result={ ...post, id: item.sourcePostId, title: item.title, baseText: item.text,status:'READY',targets:[{id:'target-'+item.id,socialAccountId:input.targets[0].provider==='telegram'?'tg':'max',...input.targets[0]}] };committed.set(key,result);
            if(control.loseResponse){control.loseResponse=false;return reply({malformedSuccess:true});}
            return reply(result);
          }
        }
        if (request.method() === 'PATCH' && url.pathname.startsWith('/api/library-items/')) {
          await control.beforeDecision?.();
          if(control.failDecision) {controlledConflicts++;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fixture source changed',code:'LIBRARY_SOURCE_STALE'})});}
          const input = request.postDataJSON();
          const key=request.headers()['idempotency-key'];control.dislikeRequests.push({body:request.postData()!,key});
          if(committed.has(key)){if(control.deletedResult){controlledDeleted++;return route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({code:'DECISION_RESULT_DELETED',error:'Result deleted'})});}return reply(committed.get(key));}
          const item = [...items,...itemsB].find(item => url.pathname === `/api/library-items/${item.id}` && item.status === 'READY');
          if (item && input.status === 'ARCHIVED' && input.expectedUpdatedAt === item.updatedAt && Object.keys(input).length === 3 && ['button','gesture','keyboard'].includes(input.swipeReview?.inputMethod) && !!key) {
            decisions.push({ action: 'reject', itemId: item.id }); item.status = 'ARCHIVED';
            committed.set(key,{...item});if(control.loseDislikeResponse){control.loseDislikeResponse=false;return reply({malformedSuccess:true});}return reply(item);
          }
        }
      }
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    });
    page.on('pageerror', error => errors.push(error.message));
    let expectedPreviewErrors=0;page.on('response',response=>{if(new URL(response.url()).pathname==='/api/planner-slots'&&response.status()===503)expectedPreviewErrors++;});
    const consoleErrors:{text:string;url:string}[]=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push({text:message.text(),url:message.location().url});});
    await use(control);
    await testInfo.attach('synthetic-decisions', { body: Buffer.from(JSON.stringify(decisions.map(({ action, itemId }) => ({ action, itemId })))), contentType: 'application/json' });
    const knownPreviewErrors=consoleErrors.filter(message=>control.failPreview&&message.url.includes('/api/planner-slots?')&&message.text==='Failed to load resource: the server responded with a status of 503 (Service Unavailable)');
    const knownConflictErrors=consoleErrors.filter(message=>controlledConflicts>0&&/^http:\/\/127\.0\.0\.1:4318\/api\/(posts|library-items\/[^?]+)$/.test(message.url)&&message.text==='Failed to load resource: the server responded with a status of 409 (Conflict)');
    expect(knownConflictErrors).toHaveLength(controlledConflicts);
    const knownDeletedErrors=consoleErrors.filter(message=>controlledDeleted>0&&/^http:\/\/127\.0\.0\.1:4318\/api\/(posts|library-items\/[^?]+)$/.test(message.url)&&message.text==='Failed to load resource: the server responded with a status of 410 (Gone)');
    expect(knownDeletedErrors).toHaveLength(controlledDeleted);
    expect(consoleErrors.filter(message=>!knownPreviewErrors.includes(message)&&!knownConflictErrors.includes(message)&&!knownDeletedErrors.includes(message)),'Unexplained console errors').toEqual([]);
    expect(expectedPreviewErrors).toBe(control.failPreview?1:0);
    expect(unexpected, 'Only loopback fixtures may receive requests').toEqual([]);
    expect(errors, 'Browser runtime errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function setupReview(page: import('@playwright/test').Page) { await page.getByRole('button',{name:'Telegram',exact:true}).click(); await page.getByRole('button',{name:'Начать разбор',exact:true}).click(); await expect(page.locator('.swipe-card')).toBeVisible(); await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeEnabled(); }

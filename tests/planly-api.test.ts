import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPlanner,
  savePost,
  removePost,
  saveProfile,
  setAccountEnabled,
} from '../lib/client/planly-api.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init);
}

test('bootstrap reads the authenticated server snapshot without browser persistence', async () => {
  mockFetch((url) => {
    assert.equal(url, '/api/bootstrap');
    return Response.json({ profile:{id:'u',email:'o@test',displayName:'Danil'}, posts:[], media:[], socialAccounts:[] });
  });
  const data = await loadPlanner();
  assert.equal(data.profile.displayName, 'Danil');
});

test('savePost creates once for a new draft and PATCHes an existing post', async () => {
  const calls: Array<[string,string]> = [];
  mockFetch((url, init) => {
    calls.push([url, init?.method ?? 'GET']);
    return Response.json({ id:'p1', title:null, baseText:'text', status:'DRAFT', targets:[], mediaIds:[], createdAt:new Date(0).toISOString(), updatedAt:new Date(0).toISOString() }, { status: url === '/api/posts' ? 201 : 200 });
  });
  const input = { baseText:'text', status:'DRAFT' as const, targets:[], mediaIds:[] };
  await savePost(input);
  await savePost(input, 'p1');
  assert.deepEqual(calls, [['/api/posts','POST'],['/api/posts/p1','PATCH']]);
});

test('mutation errors are typed and do not pretend the client state changed', async () => {
  mockFetch(() => Response.json({ error:'Validation failed' }, { status:422 }));
  await assert.rejects(() => saveProfile({ displayName:'' }), error => {
    assert.equal((error as {status?:number}).status, 422);
    return true;
  });
});

test('delete and social-account mutations use their server ownership endpoints', async () => {
  const calls:string[]=[];
  mockFetch((url, init) => { calls.push(`${init?.method}:${url}`); return init?.method === 'DELETE' ? new Response(null,{status:204}) : Response.json({id:'a',provider:'telegram',providerAccountId:null,displayName:'Telegram',enabled:true,connectionStatus:'DISCONNECTED'}); });
  await removePost('p1');
  await setAccountEnabled('a', true);
  assert.deepEqual(calls, ['DELETE:/api/posts/p1','PATCH:/api/social-accounts/a']);
});

test('bootstrap returns server Library items alongside Posts', async () => {
  const item = { id: 'library', title: 'Prepared', text: 'Content', status: 'READY', mediaIds: ['media'], sourcePostId: null,
    createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' };
  mockFetch(url => { assert.equal(url, '/api/bootstrap'); return Response.json({ profile: { id: 'owner' }, posts: [], media: [], socialAccounts: [], libraryItems: [item] }); });
  assert.deepEqual((await loadPlanner()).libraryItems, [item]);
});

test('Library CRUD uses collection GET/POST and encoded item PATCH/DELETE', async () => {
  const api = await import('../lib/client/planly-api.ts');
  assert.equal(typeof api.loadLibraryItems, 'function');
  assert.equal(typeof api.createLibraryItem, 'function');
  assert.equal(typeof api.updateLibraryItem, 'function');
  assert.equal(typeof api.removeLibraryItem, 'function');
  const calls: Array<{url:string; method:string; body:unknown}> = [];
  const item = { id: 'a/b ?#', title: null, text: 'Prepared', status: 'READY', mediaIds: [], sourcePostId: null,
    createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' };
  mockFetch((url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    return init?.method === 'DELETE' ? new Response(null, { status:204 }) : Response.json(init ? item : [item]);
  });
  assert.deepEqual(await api.loadLibraryItems(), [item]);
  assert.deepEqual(await api.createLibraryItem({ title: null, text: 'Prepared', mediaIds: [] }), item);
  await api.updateLibraryItem(item.id, { title: 'Edited', text: 'Prepared', mediaIds: [], status: 'ARCHIVED' });
  assert.equal(await api.removeLibraryItem(item.id), undefined);
  assert.deepEqual(calls, [
    { url:'/api/library-items', method:'GET', body:null },
    { url:'/api/library-items', method:'POST', body:{ title:null, text:'Prepared', mediaIds:[] } },
    { url:'/api/library-items/a%2Fb%20%3F%23', method:'PATCH', body:{ title:'Edited', text:'Prepared', mediaIds:[], status:'ARCHIVED' } },
    { url:'/api/library-items/a%2Fb%20%3F%23', method:'DELETE', body:null },
  ]);
});

test('Post transport carries source only on creation and strips it from PATCH', async () => {
  const calls: Array<{url:string; key:string|null; body:unknown}> = [];
  mockFetch((url, init) => { calls.push({ url, key:new Headers(init?.headers).get('idempotency-key'), body:JSON.parse(String(init?.body)) }); return Response.json({ id:'ack' }); });
  const content = { baseText:'Prepared', status:'DRAFT' as const, targets:[], mediaIds:[] };
  const source = { ...content, sourceLibraryItemId:'library' };
  await savePost(source, undefined, 'creation-key');
  await savePost(source, 'ack', 'ignored-key');
  assert.deepEqual(calls, [
    { url:'/api/posts', key:'creation-key', body:{ ...content, sourceLibraryItemId:'library' } },
    { url:'/api/posts/ack', key:null, body:content },
  ]);
});

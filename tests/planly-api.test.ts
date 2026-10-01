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
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => handler(String(input), init);
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

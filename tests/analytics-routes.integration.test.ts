import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {getDb,closeDb} from '../db/index.ts';
import {publicationMetrics} from '../db/schema.ts';
import {analyticsFixture,analyticsPublication} from './helpers/analytics-fixture.ts';
import {createOwnerSession,SESSION_COOKIE_NAME} from '../lib/server/auth/session.ts';
import {GET} from '../app/api/analytics/route.ts';
import {POST} from '../app/api/analytics/refresh/route.ts';
beforeEach(analyticsFixture);after(closeDb);
test('analytics authentication runs before input parsing and external collection',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('External read forbidden');};
  try {
    assert.equal((await GET(new Request('https://planly.test/api/analytics?provider=invalid'))).status,401);
    assert.equal((await POST(new Request('https://planly.test/api/analytics/refresh',{method:'POST',body:'{bad'}))).status,401);assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
test('analytics GET reads stored cohort only, with no publication or provider side effect',async()=>{
  await analyticsPublication('x');const cookie=`${SESSION_COOKIE_NAME}=${await createOwnerSession('a')}`;
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('GET must not call providers');};
  try{const response=await GET(new Request('https://planly.test/api/analytics?provider=max&period=7&page=0',{headers:{cookie}}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.eligibleCount,1);assert.equal(body.total,null);assert.equal((await getDb().select().from(publicationMetrics)).length,0);}finally{globalThis.fetch=original;}
});
test('refresh rejects cross-site/simple input and arbitrary destinations before collection',async()=>{
  const cookie=`${SESSION_COOKIE_NAME}=${await createOwnerSession('a')}`;let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('must not fetch');};
  const make=(headers:Record<string,string>,body:unknown)=>new Request('http://0.0.0.0:10000/api/analytics/refresh',{method:'POST',headers:{cookie,...headers},body:JSON.stringify(body)});
  const good={'content-type':'application/json','X-Planly-Analytics':'1','Sec-Fetch-Site':'same-origin'};
  try {
    assert.equal((await POST(make({},{}))).status,403);
    assert.equal((await POST(make({...good,'Sec-Fetch-Site':'cross-site'},{}))).status,403);
    assert.equal((await POST(make(good,{provider:'max',period:7,page:0,url:'https://evil.test'}))).status,422);
    const valid=await POST(make({...good,host:'evil.test','x-forwarded-host':'evil.test'},{provider:'telegram',period:7,page:0}));assert.equal(valid.status,200);assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaxAnalyticsReader} from '../lib/server/analytics/max.ts';
const expected={destinationId:'123',remoteId:'mid_42'};
const message={timestamp:1791360000000,recipient:{chat_id:123,chat_type:'channel'},body:{mid:'mid_42',seq:1,text:'Post',attachments:[]},stat:{views:0}};
test('MAX collector reads channel once, fixed-host messages, with header-only credentials',async()=>{
  const calls:string[]=[];
  const reader=createMaxAnalyticsReader({token:'synthetic-max-test-token',fetcher:async(url,init)=>{
    const u=new URL(String(url));calls.push(u.pathname);assert.equal(u.origin,'https://platform-api2.max.ru');assert.equal(u.search,'');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),'synthetic-max-test-token');
    return Response.json(u.pathname.startsWith('/chats/')?{chat_id:123,type:'channel',status:'active'}:message);
  }});
  assert.deepEqual(await reader.read(expected),{coverage:'AVAILABLE',value:0,error:null});
  assert.equal((await reader.read(expected)).value,0);assert.deepEqual(calls,['/chats/123','/messages/mid_42','/messages/mid_42']);
});
for(const [status,error] of [[401,'ACCESS_DENIED'],[403,'ACCESS_DENIED'],[404,'NOT_FOUND_OR_INACCESSIBLE'],[429,'RATE_LIMITED'],[500,'UNAVAILABLE']] as const) {
  test(`MAX ${status} maps to safe category without raw description or retry`,async()=>{
    let calls=0;const reader=createMaxAnalyticsReader({token:'synthetic',fetcher:async()=>{calls++;return Response.json({error:'arbitrary-secret-like-body'},{status});}});
    const result=await reader.read(expected);assert.equal(result.error,error);assert.equal(result.value,null);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('arbitrary'));
  });
}
test('MAX malformed, wrong identity and unsupported groups cannot produce views',async()=>{
  for(const payload of ['not json',JSON.stringify({...message,recipient:{chat_id:999}}),JSON.stringify({...message,stat:{views:-1}}),' '.repeat(1048577)]) {
    const reader=createMaxAnalyticsReader({token:'synthetic',fetcher:async url=>new URL(String(url)).pathname.startsWith('/chats/')?Response.json({chat_id:123,type:'channel',status:'active'}):new Response(payload)});
    assert.equal((await reader.read(expected)).error,'INVALID_RESPONSE');
  }
  let calls=0;const reader=createMaxAnalyticsReader({token:'synthetic',fetcher:async()=>{calls++;return Response.json({chat_id:123,type:'chat',status:'active'});}});
  assert.deepEqual(await reader.read(expected),{coverage:'UNSUPPORTED',value:null,error:null});assert.equal(calls,1);
});
test('MAX timeout and thrown token-bearing URLs never leak, and invalid IDs never fetch',async()=>{
  const reader=createMaxAnalyticsReader({token:'synthetic',timeoutMs:10,fetcher:async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('secret-like-fetch-url')),{once:true}))});
  assert.equal((await reader.read(expected)).error,'UNAVAILABLE');
  let calls=0;const invalid=createMaxAnalyticsReader({token:'synthetic',fetcher:async()=>{calls++;throw Error('token');}});
  assert.equal((await invalid.read({...expected,remoteId:'https://evil.test'})).error,'INVALID_RESPONSE');assert.equal(calls,0);
});

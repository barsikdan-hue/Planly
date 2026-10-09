import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createMaxAnalyticsReader} from '../lib/server/analytics/max.ts';
test('MAX deadline survives garbage collection with a live parent signal',()=>{
  const moduleUrl=new URL('../lib/server/analytics/max.ts',import.meta.url).href;
  const code=`import {createMaxAnalyticsReader} from ${JSON.stringify(moduleUrl)};
    const parent=new AbortController();
    const guard=setTimeout(()=>{console.error('DEADLINE_NOT_ENFORCED');process.exit(1);},1000);
    const collection=setInterval(()=>globalThis.gc(),5);
    try{const reader=createMaxAnalyticsReader({token:'synthetic',timeoutMs:80,fetcher:async()=>new Promise(()=>{})});
      const result=await reader.read({destinationId:'123',remoteId:'mid_42'},parent.signal);
      if(result.error!=='UNAVAILABLE')throw Error('Unexpected result');console.log('DEADLINE_ENFORCED');
    }finally{clearTimeout(guard);clearInterval(collection);}`;
  const result=spawnSync(process.execPath,['--expose-gc','--experimental-strip-types','--input-type=module','-e',code],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/DEADLINE_ENFORCED/);
});
const expected={destinationId:'123',remoteId:'mid_42'};
const message={timestamp:1791360000000,recipient:{chat_id:123,chat_type:'channel'},body:{mid:'mid_42',seq:1,text:'Post',attachments:[]},stat:{views:0}};

test('MAX reader preserves the persisted mid prefix in its fixed-host GET and validates returned identity',async()=>{
  const reader=createMaxAnalyticsReader({token:'synthetic',fetcher:async(url)=>{
    const u=new URL(String(url));
    assert.equal(u.origin,'https://platform-api2.max.ru');assert.equal(u.search,'');
    if(u.pathname==='/chats/123')return Response.json({chat_id:123,type:'channel',status:'active'});
    assert.equal(u.pathname,'/messages/mid.synthetic_42');
    return Response.json({...message,body:{...message.body,mid:'mid.synthetic_42'},stat:{views:7}});
  }});
  assert.deepEqual(await reader.read({destinationId:'123',remoteId:'mid.synthetic_42'}),{coverage:'AVAILABLE',value:7,error:null});
});
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

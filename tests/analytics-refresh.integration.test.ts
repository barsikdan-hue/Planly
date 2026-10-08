import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {eq} from 'drizzle-orm';
import {closeDb,getDb,getPool} from '../db/index.ts';
import {socialAccounts,posts,publicationMetrics} from '../db/schema.ts';
import {analyticsFixture,analyticsPublication} from './helpers/analytics-fixture.ts';
import {refreshMaxAnalytics} from '../lib/server/analytics/refresh.ts';
import {listAnalytics} from '../lib/server/analytics/repository.ts';
import type {PoolClient} from 'pg';
const now=new Date('2026-10-08T12:00:00Z');const query={provider:'max' as const,period:7 as const,page:0};
beforeEach(analyticsFixture);after(closeDb);
test('MAX refresh bounds each page to 20 and concurrency to two, then caches',async()=>{
  for(let i=0;i<21;i++) await analyticsPublication(`p${String(i).padStart(2,'0')}`,{remoteId:`mid_${i}`});
  let active=0,max=0,calls=0;
  const reader={async read(){calls++;active++;max=Math.max(active,max);await new Promise(resolve=>setTimeout(resolve,3));active--;return {coverage:'AVAILABLE' as const,value:0,error:null};}};
  const first=await refreshMaxAnalytics('a',query,{now,reader});assert.equal(first.checked,20);assert.equal(first.observed,20);assert.equal(first.nextPage,1);assert.equal(max,2);
  const again=await refreshMaxAnalytics('a',query,{now,reader});assert.equal(again.checked,0);assert.equal(again.skipped,20);assert.equal(calls,20);
  const last=await refreshMaxAnalytics('a',{...query,page:1},{now,reader});assert.equal(last.checked,1);assert.equal(last.nextPage,null);
  const result=await listAnalytics('a',query,now);assert.equal(result.observedCount,21);assert.equal(result.rows.length,20);assert.equal(result.total,0);
});
test('concurrent MAX refresh is busy and does not duplicate provider reads',async()=>{
  await analyticsPublication('x');let unblock!:()=>void;let entered!:()=>void;
  const gate=new Promise<void>(resolve=>{unblock=resolve;});const ready=new Promise<void>(resolve=>{entered=resolve;});let calls=0;
  const reader={async read(){calls++;entered();await gate;return {coverage:'AVAILABLE' as const,value:7,error:null};}};
  const first=refreshMaxAnalytics('a',query,{now,reader});await ready;
  try {assert.equal((await refreshMaxAnalytics('a',query,{now,reader})).busy,true);assert.equal(calls,1);}finally{unblock();}assert.equal((await first).observed,1);
});
for(const mutation of ['disable','reconnect','delete'] as const) test(`MAX late response after ${mutation} cannot persist a metric`,async()=>{
  await analyticsPublication('x');
  const result=await refreshMaxAnalytics('a',query,{now,reader:{async read(){
    if(mutation==='delete')await getDb().delete(posts).where(eq(posts.id,'x'));else await getDb().update(socialAccounts).set(mutation==='disable'?{enabled:false}:{providerAccountId:'999'}).where(eq(socialAccounts.id,'a-MAX'));
    return {coverage:'AVAILABLE',value:42,error:null};
  }}});
  assert.equal(result.observed,0);assert.equal((await getDb().select().from(publicationMetrics)).length,0);
});
test('MAX failure preserves zero, sets cooldown and leaves account status connected',async()=>{
  await analyticsPublication('x');let calls=0;let failed=false;
  const reader={async read(){calls++;return failed?{coverage:'NO_DATA' as const,value:null,error:'RATE_LIMITED' as const}:{coverage:'AVAILABLE' as const,value:0,error:null};}};
  await refreshMaxAnalytics('a',query,{now,reader});failed=true;const later=new Date(now.getTime()+900000);
  await refreshMaxAnalytics('a',query,{now:later,reader});await refreshMaxAnalytics('a',query,{now:later,reader});assert.equal(calls,2);
  const row=(await listAnalytics('a',query,later)).rows[0];assert.equal(row.metric.value,0);assert.equal(row.metric.observedAt,now.toISOString());assert.equal(row.metric.collectionError,'RATE_LIMITED');
  assert.equal((await getDb().select().from(socialAccounts).where(eq(socialAccounts.id,'a-MAX')))[0].connectionStatus,'CONNECTED');
});
test('foreign, inactive, mismatched and Telegram selections cannot cause MAX reads',async()=>{
  await analyticsPublication('foreign',{owner:'b'});let calls=0;const reader={async read(){calls++;return {coverage:'AVAILABLE' as const,value:42,error:null};}};
  await refreshMaxAnalytics('a',query,{now,reader});await refreshMaxAnalytics('a',{...query,provider:'telegram'},{now,reader});assert.equal(calls,0);
  await analyticsPublication('x',{destination:'999'});await refreshMaxAnalytics('a',query,{now,reader});assert.equal(calls,0);
});

test('refresh deadline survives garbage collection of temporary timeout sources',()=>{
  const urls=['../lib/server/analytics/refresh.ts','./helpers/analytics-fixture.ts','../db/index.ts'].map(path=>JSON.stringify(new URL(path,import.meta.url).href));
  const code=`import {refreshMaxAnalytics} from ${urls[0]};import {analyticsFixture,analyticsPublication} from ${urls[1]};import {closeDb} from ${urls[2]};
    const nativeTimeout=AbortSignal.timeout.bind(AbortSignal);const nativeTimer=globalThis.setTimeout;
    AbortSignal.timeout=(ms)=>nativeTimeout(ms===25000?80:ms);
    globalThis.setTimeout=(fn,ms,...args)=>nativeTimer(fn,ms===25000?80:ms,...args);
    await analyticsFixture();await analyticsPublication('gc-deadline');
    let release;const held=new Promise(resolve=>{release=()=>resolve({coverage:'AVAILABLE',value:42,error:null});});
    const guard=nativeTimer(()=>{console.error('DEADLINE_NOT_ENFORCED');release();},1000);
    const collection=setInterval(()=>globalThis.gc(),5);
    try{const result=await refreshMaxAnalytics('a',{provider:'max',period:7,page:0},{now:new Date('2026-10-08T12:00:00Z'),reader:{read:()=>held}});
      if(result.observed!==0||result.unavailable!==1)throw Error('DEADLINE_NOT_ENFORCED');console.log('DEADLINE_ENFORCED');
    }finally{release();clearTimeout(guard);clearInterval(collection);await closeDb();}`;
  const result=spawnSync(process.execPath,['--expose-gc','--experimental-strip-types','--input-type=module','-e',code],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/DEADLINE_ENFORCED/);
});

test('overall refresh deadline rejects even a late reader which ignores abort',async()=>{
  await analyticsPublication('x');let release!:()=>void;
  const held=new Promise<{coverage:'AVAILABLE';value:number;error:null}>(resolve=>{release=()=>resolve({coverage:'AVAILABLE',value:42,error:null});});
  const keepAlive=setInterval(()=>{},1000);
  try {
    const result=await refreshMaxAnalytics('a',query,{now,reader:{read:()=>held}});
    assert.equal(result.observed,0);assert.equal(result.unavailable,1);
    release();await new Promise(resolve=>setTimeout(resolve,5));
    const row=(await listAnalytics('a',query,now)).rows[0];assert.equal(row.metric.value,null);assert.equal(row.metric.collectionError,'UNAVAILABLE');
  } finally {release();clearInterval(keepAlive);}
});

test('lease connection is destroyed when advisory unlock fails',async()=>{
  await analyticsPublication('x');const pool=getPool();
  let released=false;let destroyArgument:unknown;
  const originals=new Map<PoolClient,PoolClient['query']>();
  const acquire=(client:PoolClient)=>{
    if(originals.has(client))return;const query=client.query;originals.set(client,query);
    Object.defineProperty(client,'query',{configurable:true,value:(...args:unknown[])=>{
      if(typeof args[0]==='string'&&args[0].includes('pg_try_advisory_lock')){
        const release=client.release;
        Object.defineProperty(client,'release',{configurable:true,value:(destroy:unknown)=>{released=true;destroyArgument=destroy;return Reflect.apply(release,client,[destroy]);}});
      }
      if(typeof args[0]==='string'&&args[0].includes('pg_advisory_unlock'))throw Error('synthetic unlock transport failure');
      return Reflect.apply(query,client,args);
    }});
  };pool.on('acquire',acquire);
  try {
    await assert.rejects(()=>refreshMaxAnalytics('a',query,{now,reader:{async read(){return {coverage:'AVAILABLE',value:1,error:null};}}}),/synthetic unlock/);
    assert.equal(released,true);assert.equal(destroyArgument,true);
  }finally{pool.off('acquire',acquire);for(const [client,query]of originals)Object.defineProperty(client,'query',{configurable:true,value:query});const cleanup=await pool.connect();try{await cleanup.query('SELECT pg_advisory_unlock_all()');}finally{cleanup.release(true);}}
});

test('failed worker cancels and drains its sibling before account unlock',async()=>{
  await analyticsPublication('a',{remoteId:'mid_a'});await analyticsPublication('b',{remoteId:'mid_b'});
  const pool=getPool();let peerEntered!:()=>void;const ready=new Promise<void>(resolve=>{peerEntered=resolve;});
  let releasePeer!:()=>void;let peerExited=false;let exitAtUnlock=false;let injected=false;
  const originals=new Map<PoolClient,PoolClient['query']>();
  const acquire=(client:PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);Object.defineProperty(client,'query',{configurable:true,value:(...args:unknown[])=>{
    const text=typeof args[0]==='string'?args[0]:(args[0] as {text?:string})?.text??'';
    if(text.includes('insert into "publication_metrics"')&&!injected){injected=true;throw Error('synthetic metric write failure');}
    if(text.includes('pg_advisory_unlock('))exitAtUnlock=peerExited;
    return Reflect.apply(original,client,args);
  }});};pool.on('acquire',acquire);
  const reader={async read(expected:{remoteId:string},signal?:AbortSignal){
    if(expected.remoteId==='mid_a'){await ready;return {coverage:'AVAILABLE' as const,value:1,error:null};}
    await new Promise<void>((resolve,reject)=>{releasePeer=resolve;signal?.addEventListener('abort',()=>{peerExited=true;reject(Error('cancelled peer'));},{once:true});peerEntered();});
    peerExited=true;return {coverage:'AVAILABLE' as const,value:2,error:null};
  }};
  try{await assert.rejects(()=>refreshMaxAnalytics('a',query,{now,reader}),(error:unknown)=>(error as Error & {cause?:Error}).cause?.message==='synthetic metric write failure');assert.equal(exitAtUnlock,true,'unlock must follow sibling cancellation/drain');}
  finally{releasePeer?.();await new Promise(resolve=>setTimeout(resolve,30));pool.off('acquire',acquire);for(const [client,original]of originals)Object.defineProperty(client,'query',{configurable:true,value:original});}
});

test('cache eligibility is reloaded after a delayed lock acquisition',async()=>{
  await analyticsPublication('x');const pool=getPool();let reads=0;let enter!:()=>void;let releaseA!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;});const held=new Promise<void>(resolve=>{releaseA=resolve;});
  const reader={async read(){reads++;enter();await held;return {coverage:'AVAILABLE' as const,value:5,error:null};}};
  const a=refreshMaxAnalytics('a',query,{now,reader});await entered;
  let resumeB!:()=>void;let pause!:()=>void;const paused=new Promise<void>(resolve=>{pause=resolve;});const gate=new Promise<void>(resolve=>{resumeB=resolve;});
  const originals=new Map<PoolClient,PoolClient['query']>();
  const acquire=(client:PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);Object.defineProperty(client,'query',{configurable:true,value:(...args:unknown[])=>{
    if(typeof args[0]==='string'&&args[0].includes('pg_try_advisory_lock')){pause();return gate.then(()=>Reflect.apply(original,client,args));}return Reflect.apply(original,client,args);
  }});};pool.on('acquire',acquire);
  const b=refreshMaxAnalytics('a',query,{now,reader});await paused;
  try{releaseA();await a;resumeB();const result=await b;assert.equal(result.checked,0);assert.equal(reads,1);}
  finally{releaseA();resumeB();await Promise.allSettled([a,b]);pool.off('acquire',acquire);for(const [client,original]of originals)Object.defineProperty(client,'query',{configurable:true,value:original});}
});

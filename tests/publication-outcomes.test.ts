import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import { publications, postMedia, socialAccounts, users } from '../db/schema.ts';
import { processPublication } from '../lib/server/scheduler/processor.ts';
import type { PublishResult } from '../lib/server/connectors/types.ts';

// SQL contract fixture: real processor and Drizzle expressions, replaced DB wire.
// Real concurrency/transaction behavior is verified separately against PG/Redis.
function fixture() {
  const globals = globalThis as typeof globalThis & { __planlyDb?: unknown; __planlyPool?: unknown; __planlyPublicationLockPool?: unknown };
  const savedDb = globals.__planlyDb, savedPool = globals.__planlyPool, savedLockPool=globals.__planlyPublicationLockPool;
  const publication = { id:'outcome-pub', userId:'outcome-user', postId:'outcome-post', provider:'VK', status:'SCHEDULED', attemptCount:0, providerRemoteId:null as string|null, providerErrorCode:null as string|null, providerErrorMessage:null as string|null, socialBindingRevision:null, socialBindingDestinationId:null };
  const account = { id:'outcome-account', userId:'outcome-user', provider:'VK', enabled:true, connectionStatus:'CONNECTED', providerAccountId:'-123' };
  const post = { id:'outcome-post', userId:'outcome-user', status:'READY', baseText:'text' };
  const target = { id:'outcome-target', postId:post.id, textOverride:null };
  const writes: Array<{table:unknown;values:Record<string,unknown>;sql:string;params:unknown[]}> = [];
  const dialect = new PgDialect();
  const db = {
    select() {
      let table:unknown;
      const rows = () => table===publications ? [structuredClone({publication,target,post,account})] : table===postMedia ? [] : table===users ? [{id:publication.userId,role:'USER',accessExpiresAt:null}] : [];
      const query = {from(t:unknown){table=t;return this;},innerJoin(){return this;},leftJoin(){return this;},where(){return this;},orderBy(){return this;},for(){return this;},limit(){return this;},then(resolve:(value:unknown[])=>unknown){return Promise.resolve(rows()).then(resolve);}};
      return query;
    },
    update(table:unknown) {
      let values:Record<string,unknown> = {}, matches=false;
      const query = {set(v:Record<string,unknown>){values=v;return this;},where(condition:Parameters<PgDialect['sqlToQuery']>[0]){
        const q=dialect.sqlToQuery(condition);writes.push({table,values,sql:q.sql,params:q.params});
        matches=true;
        for(const [column,value] of [['status',publication.status],['attempt_count',publication.attemptCount]] as const){
          const m=q.sql.match(new RegExp('"'+column+'" = \\$(\\d+)'));
          if(m && q.params[Number(m[1])-1]!==value)matches=false;
        }
        if(q.sql.includes(' in (') && !['SCHEDULED','QUEUED'].includes(publication.status))matches=false;
        if(matches && table===publications){
          const next={...values};if(next.attemptCount && typeof next.attemptCount==='object')next.attemptCount=publication.attemptCount+1;
          Object.assign(publication,next);
        }
        if(matches && table===socialAccounts)Object.assign(account,values);
        return this;
      },returning(){return Promise.resolve(matches?[{id:publication.id,attemptCount:publication.attemptCount}]:[]);},then(resolve:(value:unknown)=>unknown){return Promise.resolve(undefined).then(resolve);}};
      return query;
    },
  };
  let locked=false;
  globals.__planlyDb=db;
  globals.__planlyPool={async connect(){throw new Error('Holding the query pool across provider IO can starve all DB operations');}};
  globals.__planlyPublicationLockPool={async connect(){return {async query(sql:string){if(sql.includes('pg_try_advisory_lock')){const acquired=!locked;if(acquired)locked=true;return {rows:[{locked:acquired}]};}if(sql.includes('pg_advisory_unlock'))locked=false;return {rows:[]};},release(){}};}};
  return {publication,account,writes,restore(){globals.__planlyDb=savedDb;globals.__planlyPool=savedPool;globals.__planlyPublicationLockPool=savedLockPool;}};
}

for(const outcome of ['failure','auth','throw','success'] as const) test(`late ${outcome} preserves an already published receipt`,async()=>{
  const f=fixture();
  try{
    const result=await processPublication(f.publication.id,()=>({provider:'VK',async publish():Promise<PublishResult>{
      f.publication.status='PUBLISHED';f.publication.providerRemoteId='-123_77';
      if(outcome==='throw')throw new Error('private transport detail');
      return outcome==='success'?{ok:true,remoteId:'-123_88'}:{ok:false,errorType:outcome==='auth'?'AUTH':'TEMPORARY',code:'STALE',message:'stale failure'};
    }}));
    assert.equal(f.publication.status,'PUBLISHED');assert.equal(f.publication.providerRemoteId,'-123_77');
    assert.equal(f.publication.providerErrorCode,null);assert.equal(f.account.connectionStatus,'CONNECTED');
    assert.deepEqual(result,{status:'PUBLISHED',skipped:true});
  }finally{f.restore();}
});

for(const outcome of ['failure','success'] as const) test(`late ${outcome} cannot acknowledge a different claimed attempt`,async()=>{
  const f=fixture();try{
    const result=await processPublication(f.publication.id,()=>({provider:'VK',async publish():Promise<PublishResult>{
      f.publication.attemptCount=2;
      return outcome==='success'?{ok:true,remoteId:'-123_88'}:{ok:false,errorType:'PERMANENT',code:'OLD',message:'old result'};
    }}));
    assert.equal(f.publication.status,'PUBLISHING');assert.equal(f.publication.providerRemoteId,null);assert.equal(f.publication.providerErrorCode,null);
    assert.deepEqual(result,{status:'PUBLISHING',skipped:true});
  }finally{f.restore();}
});

test('duplicate active processor cannot invalidate the sender or cause a second send',async()=>{
  const f=fixture();let sends=0;let release!:()=>void;let started!:()=>void;
  const gate=new Promise<void>(r=>{release=r;}),entry=new Promise<void>(r=>{started=r;});
  const resolver=()=>({provider:'VK' as const,async publish(){sends++;started();await gate;return {ok:true as const,remoteId:'-123_99'};}});
  let first:ReturnType<typeof processPublication>|undefined;
  try{
    first=processPublication(f.publication.id,resolver);await entry;
    const duplicate=await processPublication(f.publication.id,resolver);
    assert.equal(duplicate.status,'PUBLISHING');assert.equal(duplicate.skipped,true);assert.equal(f.publication.status,'PUBLISHING');
    release();assert.equal((await first).status,'PUBLISHED');assert.equal(f.publication.providerRemoteId,'-123_99');assert.equal(sends,1);
  }finally{release();await first?.catch(()=>{});f.restore();}
});

for(const revision of ['a'.repeat(40),'secret-build-input']) test(`real worker failure persists and emits only closed stage diagnostics (${revision.length===40?'known':'unknown'} revision)`,async()=>{
  const f=fixture(),savedLog=console.info,savedRevision=process.env.PLANLY_BUILD_REVISION;
  const logs:string[]=[];console.info=(value:unknown)=>{logs.push(String(value));};process.env.PLANLY_BUILD_REVISION=revision;
  try{
    const diagnostic={stage:'UPLOAD',uploadHttpStatus:405,uploadHostClass:'VK_RU_PHOTO_UPLOAD',uploadAttempt:'PRIMARY',signedUrl:'secret-signed-url',nested:{token:'secret-token'}};
    await processPublication(f.publication.id,()=>({provider:'VK',async publish(){return {ok:false,errorType:'PERMANENT',code:'VK_UPLOAD_HTTP_405',message:'Upload rejected.',vkDiagnostic:diagnostic} as Extract<PublishResult,{ok:false}>;}}));
    assert.ok(f.publication.providerErrorMessage?.includes('"uploadHttpStatus":405'));
    assert.equal(logs.length,1);
    assert.deepEqual(JSON.parse(logs[0]),{event:'VK_PUBLICATION_FAILURE',correlationId:'outcome-pub',buildRevision:revision.length===40?revision:null,diagnostic:{stage:'UPLOAD',uploadHttpStatus:405,uploadHostClass:'VK_RU_PHOTO_UPLOAD',uploadAttempt:'PRIMARY'}});
    assert.equal(JSON.stringify([logs,f.publication]).includes('secret-'),false);
  }finally{console.info=savedLog;if(savedRevision===undefined)delete process.env.PLANLY_BUILD_REVISION;else process.env.PLANLY_BUILD_REVISION=savedRevision;f.restore();}
});

test('server receipt rejection reason survives actual processor DB message and log without private fields',async()=>{
  const f=fixture(),savedLog=console.info;const logs:string[]=[];console.info=(value:unknown)=>logs.push(String(value));
  try{
    const safe={stage:'PHOTO_RECEIPT',method:'photos.saveWallPhoto',photoReceiptReason:'PHOTO_OWNER_MISMATCH'};
    const diagnostic={...safe,owner_id:89,photo_id:44,raw:{access_key:'private-saved-key'},signedUrl:'private-signed-url'};
    await processPublication(f.publication.id,()=>({provider:'VK',async publish(){return {ok:false,errorType:'PERMANENT',code:'VK_PHOTO_RECEIPT',message:'Photo rejected.',vkDiagnostic:diagnostic} as Extract<PublishResult,{ok:false}>;}}));
    assert.equal(f.publication.status,'FAILED');assert.equal(f.publication.providerRemoteId,null);
    assert.ok(f.publication.providerErrorMessage?.includes('"photoReceiptReason":"PHOTO_OWNER_MISMATCH"'));
    assert.equal(logs.length,1);assert.deepEqual(JSON.parse(logs[0]).diagnostic,safe);
    for(const value of ['private-','owner_id','photo_id','access_key','signedUrl'])assert.equal(JSON.stringify([logs,f.publication]).includes(value),false);
  }finally{console.info=savedLog;f.restore();}
});

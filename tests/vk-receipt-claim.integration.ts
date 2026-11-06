import test,{after} from 'node:test';
import assert,{AssertionError} from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import Redis from 'ioredis';
import {claimReceiptRelay,receiptRelayMarkerKey} from '../lib/server/vk/upload-receipt-claim.ts';
import {RECEIPT_OPERATION} from '../public/vk-upload-receipt.mjs';

// Explicit attested-runner target. The normal *.test.ts glob excludes this file.
// No marker write or cleanup is permitted before both runtime sentinels agree.
let postgres:Client|undefined,redis:Redis|undefined,guardProven=false,suffix='',nonce='';
const owners=[randomUUID(),randomUUID()],keys=owners.map(receiptRelayMarkerKey);
const loopback=new Set(['127.0.0.1','localhost','[::1]']);
function connectionMetadata(){
  assert.ok(process.env.VK_AUDIT_ISOLATED==='1','Receipt claim test requires the attested isolated runner');
  let database:URL,cache:URL;
  try{database=new URL(process.env.DATABASE_URL??'');cache=new URL(process.env.REDIS_URL??'');}
  catch{throw new Error('Isolated receipt claim connection metadata is unavailable');}
  const match=/^\/vk_audit_([a-f0-9]{16})$/.exec(database.pathname);
  assert.ok(['postgresql:','postgres:'].includes(database.protocol)&&loopback.has(database.hostname)&&!database.search&&!database.hash&&match,'Receipt claim PostgreSQL endpoint is outside the isolated namespace');
  assert.ok(cache.protocol==='redis:'&&loopback.has(cache.hostname)&&(cache.port||'6379')==='6379'&&cache.pathname==='/13'&&!cache.search&&!cache.hash,'Receipt claim Redis endpoint is outside the isolated namespace');
  assert.ok(keys.every((key,index)=>key===`planly:${RECEIPT_OPERATION}:${owners[index]}`),'Receipt claim cleanup keys are outside this test');
  return {database:database.toString(),cache:cache.toString(),suffix:match![1]};
}
after(async()=>{
  const failures:string[]=[];
  try{
    if(guardProven&&postgres&&redis){
      const check=await postgres.query<{nonce:unknown}>('SELECT nonce FROM vk_audit_runtime_sentinel');
      const cacheNonce=await redis.get(`vk-audit:${suffix}:sentinel`);
      assert.ok(check.rows.length===1&&check.rows[0].nonce===nonce&&cacheNonce===nonce,'Isolated receipt claim runtime identity changed before cleanup');
      // Only these two fresh UUID keys are ours. No wildcard/scan/flush/old marker.
      await redis.del(...keys);
    }
  }catch{failures.push('Owned receipt claim marker cleanup could not be verified');}
  try{await postgres?.end();}catch{failures.push('Isolated receipt claim PostgreSQL close failed');}
  if(redis){try{if(redis.status!=='wait'&&redis.status!=='end')await redis.quit();}catch{failures.push('Isolated receipt claim Redis close failed');}finally{redis.disconnect();}}
  if(failures.length)throw new Error(failures.join('; '));
});

test('attested PostgreSQL17/Redis7 receipt claim is atomic, permanent and terminal for one owner',async()=>{
  const metadata=connectionMetadata();suffix=metadata.suffix;
  postgres=new Client({connectionString:metadata.database,connectionTimeoutMillis:5000});
  redis=new Redis(metadata.cache,{lazyConnect:true,maxRetriesPerRequest:0,enableOfflineQueue:false,connectTimeout:5000,commandTimeout:5000,retryStrategy:()=>null});
  redis.on('error',()=>{/* Transport errors are reported below without connection values. */});
  try{
    await postgres.connect();await redis.connect();
    const version=await postgres.query<{version_num:number}>("SELECT current_setting('server_version_num')::int AS version_num");
    assert.ok(version.rows.length===1&&version.rows[0].version_num>=170000&&version.rows[0].version_num<180000,'Receipt claim test requires PostgreSQL17');
    const sentinel=await postgres.query<{nonce:unknown}>('SELECT nonce FROM vk_audit_runtime_sentinel');
    assert.ok(sentinel.rows.length===1&&typeof sentinel.rows[0].nonce==='string'&&/^[a-f0-9]{64}$/.test(sentinel.rows[0].nonce),'Receipt claim PostgreSQL runtime sentinel is invalid');
    nonce=sentinel.rows[0].nonce as string;
    const information=await redis.info('server');
    assert.ok(/^redis_version:7\./m.test(information),'Receipt claim test requires Redis7');
    assert.ok(await redis.get(`vk-audit:${suffix}:sentinel`)===nonce,'Receipt claim runtime sentinels do not agree');
    guardProven=true;
    const admitted=await Promise.all(Array.from({length:20},()=>claimReceiptRelay(owners[0],redis!)));
    assert.equal(admitted.filter(Boolean).length,1);
    assert.equal(await redis.get(keys[0]),'ATTEMPTED');assert.equal(await redis.ttl(keys[0]),-1);
    assert.equal(await claimReceiptRelay(owners[0],redis),false);
    assert.equal(await redis.get(keys[0]),'ATTEMPTED');assert.equal(await redis.ttl(keys[0]),-1);
    assert.equal(await claimReceiptRelay(owners[1],redis),true);
    assert.equal(await redis.get(keys[1]),'ATTEMPTED');assert.equal(await redis.ttl(keys[1]),-1);
  }catch(error){
    if(error instanceof AssertionError)throw error;
    throw new Error('Receipt claim integration could not verify or complete its isolated runtime');
  }
});

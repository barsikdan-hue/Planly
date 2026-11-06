import test from 'node:test';
import assert from 'node:assert/strict';
import type Redis from 'ioredis';
import {RECEIPT_OPERATION} from '../public/vk-upload-receipt.mjs';
const modulePath='../lib/server/vk/upload-receipt-claim.ts';
const claim=await import(modulePath).catch(()=>null);
function api(){assert.ok(claim?.receiptRelayMarkerKey&&claim?.claimReceiptRelay,'separate permanent receipt claim helper must exist');return claim;}
const connection=(set:(...args:unknown[])=>Promise<unknown>)=>({set}) as unknown as Pick<Redis,'set'>;

test('receipt marker binds its own operation and the exact owner identity',()=>{
  const p=api();assert.equal(p.receiptRelayMarkerKey('owner-a'),`planly:${RECEIPT_OPERATION}:owner-a`);assert.notEqual(p.receiptRelayMarkerKey('owner-a'),p.receiptRelayMarkerKey('owner-b'));
});
test('claim requests permanent NX once, with no expiry or reset, and only OK admits work',async()=>{
  const p=api(),calls:unknown[][]=[];
  for(const result of ['OK',null,'unexpected']){
    const admitted=await p.claimReceiptRelay('owner-a',connection(async(...args)=>{calls.push(args);return result;}));assert.equal(admitted,result==='OK');
  }
  assert.deepEqual(calls,Array.from({length:3},()=>[`planly:${RECEIPT_OPERATION}:owner-a`,'ATTEMPTED','NX']));
});
test('unknown reply after a potentially committed claim never deletes it or authorizes a retry',async()=>{
  const p=api(),stored=new Map<string,string>();let attempts=0,deletions=0;
  const wire={async set(key:string,value:string){attempts++;if(stored.has(key))return null;stored.set(key,value);throw Error('Synthetic unknown acknowledgement');},async del(){deletions++;}} as unknown as Pick<Redis,'set'>;
  await assert.rejects(()=>p.claimReceiptRelay('owner-a',wire));assert.equal(stored.get(p.receiptRelayMarkerKey('owner-a')),'ATTEMPTED');
  assert.equal(await p.claimReceiptRelay('owner-a',wire),false);assert.equal(attempts,2);assert.equal(deletions,0);
});
test('claim has a five-second deadline and does not delete a write whose acknowledgement arrives later',{timeout:10000},async()=>{
  const p=api();let complete:((value:'OK')=>void)|undefined,deletions=0;
  const wire={set:()=>new Promise<'OK'>(resolve=>{complete=resolve;}),async del(){deletions++;}} as unknown as Pick<Redis,'set'>;
  await assert.rejects(()=>p.claimReceiptRelay('owner-a',wire),/Admission deadline/);
  complete?.('OK');await Promise.resolve();assert.equal(deletions,0);
});

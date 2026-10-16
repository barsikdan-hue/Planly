import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('real storage GET headers/body and PUT retain individual and shared deadlines under garbage collection',()=>{
  const result=spawnSync(process.execPath,['--expose-gc','--experimental-strip-types',fileURLToPath(new URL('./helpers/storage-gc-fixture.mjs',import.meta.url))],{encoding:'utf8',timeout:20_000,windowsHide:true});
  assert.equal(result.status,0,'isolated transport fixture must finish within its independent watchdog');
  const cases=JSON.parse(result.stdout.trim());
  assert.equal(cases.length,12);
  assert.deepEqual(cases.map(entry=>[entry.budget,entry.gc,entry.variant]),[
    ['individual',false,'GET headers'],['individual',false,'GET body'],['individual',false,'PUT'],
    ['individual',true,'GET headers'],['individual',true,'GET body'],['individual',true,'PUT'],
    ['batch',false,'GET headers'],['batch',false,'GET body'],['batch',false,'PUT'],
    ['batch',true,'GET headers'],['batch',true,'GET body'],['batch',true,'PUT'],
  ]);
  for(const entry of cases){
    assert.deepEqual(entry,{budget:entry.budget,gc:entry.gc,variant:entry.variant,parentAborted:entry.budget==='batch',error:'TimeoutError',watchdogFired:false,transportClosed:true},`${entry.variant}, GC=${entry.gc}, budget=${entry.budget}: earliest individual/shared deadline must cancel real I/O before the fixture watchdog`);
  }
});

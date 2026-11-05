import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, sanitizeOutput, selectUnitFiles, verifyContainer, verifySourceProvenance } from '../scripts/verify-vk-audit.mjs';

test('isolated child environment drops ambient provider, DSN, GitHub and Node injection inputs', () => {
  const actual = cleanEnvironment({ PATH:'/bin', HOME:'/runner', TEMP:'/tmp', VK_SERVICE_TOKEN:'ambient-vk', DATABASE_URL:'ambient-db', REDIS_URL:'ambient-redis', GITHUB_TOKEN:'ambient-gh', NODE_OPTIONS:'--import=untrusted', HTTPS_PROXY:'ambient-proxy', S3_SECRET_ACCESS_KEY:'ambient-storage' });
  assert.deepEqual(actual, { PATH:'/bin', HOME:'/runner', TEMP:'/tmp', CI:'true', NEXT_TELEMETRY_DISABLED:'1', NODE_ENV:'test' });
});

test('GitHub source verification rejects dirty WIP while local evidence may identify it explicitly', () => {
  assert.doesNotThrow(()=>verifySourceProvenance(false,true));
  assert.doesNotThrow(()=>verifySourceProvenance(true,false));
  assert.throws(()=>verifySourceProvenance(true,true),/Clean committed source required/);
});

test('artifact output removes generated secrets and access-bearing URLs', () => {
  const actual = sanitizeOutput('password=a9f1secret ds=postgresql://person:pass@127.0.0.1/test upload=https://pu.vk.ru/upload?sig=secret access_token=abc123', ['a9f1secret']);
  assert.equal(actual, 'password=[REDACTED] ds=[REDACTED_CONNECTION] upload=[REDACTED_URL] access_token=[REDACTED]');
});

test('unit gate selects VK contract tests and scheduler outcome tests without integration suites', () => {
  assert.deepEqual(selectUnitFiles(['vk-connector.test.ts','vk-product.integration.test.ts','publication-outcomes.test.ts','other.test.ts','vk-audit-runner.test.mjs']), ['publication-outcomes.test.ts','vk-audit-runner.test.mjs','vk-connector.test.ts']);
});

test('container attestation rejects a foreign image or endpoint before any DB connection', () => {
  const id='a'.repeat(64);
  const container={Id:id,Config:{Image:'postgres:17-alpine'},State:{Running:true},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'5432'}]}}};
  assert.deepEqual(verifyContainer(container,id,'postgres:17-alpine',5432), {id,image:'postgres:17-alpine',port:5432});
  assert.throws(()=>verifyContainer({...container,Config:{Image:'postgres:16-alpine'}},id,'postgres:17-alpine',5432),/attestation/);
  assert.throws(()=>verifyContainer(container,'b'.repeat(64),'postgres:17-alpine',5432),/attestation/);
  assert.throws(()=>verifyContainer({...container,NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'6543'}]}}},id,'postgres:17-alpine',5432),/attestation/);
});

test('test preload blocks an accidental provider socket before DNS or transport', () => {
  const guard=new URL('../scripts/vk-audit-network-guard.mjs',import.meta.url).href;
  const result=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',"import net from 'node:net'; try { net.connect({host:'api.vk.com',port:443}); process.exitCode=3; } catch(error) { console.log(error.code); }"],{encoding:'utf8',env:cleanEnvironment(process.env)});
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'VK_AUDIT_NETWORK_BLOCKED');assert.equal(result.stderr,'');
});

test('test preload permits actual loopback HTTP fixture transport', () => {
  const guard=new URL('../scripts/vk-audit-network-guard.mjs',import.meta.url).href;
  const result=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',"import {createServer} from 'node:http'; const server=createServer((_q,r)=>r.end('fixture'));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{console.log(await (await fetch('http://127.0.0.1:'+server.address().port)).text());}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}"],{encoding:'utf8',env:cleanEnvironment(process.env),timeout:5000});
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'fixture');assert.equal(result.stderr,'');
});

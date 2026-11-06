import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import Redis from 'ioredis';

const require = createRequire(import.meta.url);
const osKeys = ['PATH','HOME','USERPROFILE','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR'];
export function cleanEnvironment(source) {
  const result = Object.fromEntries(osKeys.filter(key => typeof source[key] === 'string').map(key => [key,source[key]]));
  return {...result, CI:'true', NEXT_TELEMETRY_DISABLED:'1', NODE_ENV:'test'};
}
export function sanitizeOutput(value, secrets = []) {
  let result = String(value);
  for (const secret of [...new Set(secrets)].filter(value => typeof value === 'string' && value.length >= 8).sort((a,b)=>b.length-a.length)) result=result.split(secret).join('[REDACTED]');
  return result.replace(/\b(?:postgres(?:ql)?|rediss?):\/\/[^\s'"<>]+/gi,'[REDACTED_CONNECTION]')
    .replace(/https?:\/\/[^\s'"<>]+\?[^\s'"<>]+/gi,'[REDACTED_URL]')
    .replace(/\b(access_token|refresh_token|authorization)\s*[:=]\s*[^\s,}\]]+/gi,'$1=[REDACTED]');
}
export function selectUnitFiles(names) {
  return names.filter(name => (/^vk.*\.test\.(?:ts|mjs)$/.test(name) && !name.includes('.integration.')) || name==='publication-outcomes.test.ts').sort();
}
export function verifyContainer(container,id,image,port) {
  assert.match(id,/^[a-f0-9]{64}$/,'Container attestation failed');
  assert.equal(container.Id,id,'Container attestation failed');
  assert.equal(container.Config?.Image,image,'Container attestation failed');
  assert.equal(container.State?.Running,true,'Container attestation failed');
  assert.ok(container.NetworkSettings?.Ports?.[`${port}/tcp`]?.some(binding=>binding.HostPort===String(port) && ['127.0.0.1','0.0.0.0','::'].includes(binding.HostIp)),'Container endpoint attestation failed');
  return {id,image,port};
}
export function verifySourceProvenance(githubActions,dirtyWorktree) {
  if(githubActions)assert.equal(dirtyWorktree,false,'Clean committed source required on GitHub Actions');
}

const suites = ['vk-audit-races.integration.test.ts','vk-product.integration.test.ts','vk-credentials.integration.test.ts','publication-processor.integration.test.ts','scheduler-worker.integration.test.ts','social-connection-publication.integration.test.ts','vk-authorization.integration.test.ts','vk-receipt-claim.integration.ts'];
async function main(mode) {
  assert.ok(['--unit','--integration'].includes(mode),'Choose --unit or --integration');
  const root=process.cwd(), output=path.join(root,'.superpowers/vk-audit-ci');
  await mkdir(output,{recursive:true});
  const source=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:cleanEnvironment(process.env)}).stdout?.trim();
  assert.match(source ?? '',/^[a-f0-9]{40}$/,'Source revision unavailable');
  const worktree=spawnSync('git',['status','--porcelain'],{encoding:'utf8',env:cleanEnvironment(process.env)});
  assert.equal(worktree.status,0,'Source worktree state unavailable');
  const dirtyWorktree=worktree.stdout.trim().length>0;
  const guard=pathToFileURL(path.join(root,'scripts/vk-audit-network-guard.mjs')).href;
  const env={...cleanEnvironment(process.env),NODE_OPTIONS:`--import=${guard}`,PLANLY_BUILD_REVISION:source};
  const secrets=[];
  const evidence={mode:mode.slice(2),source,dirtyWorktree,capturedAt:new Date().toISOString(),node:process.version,commands:[],status:'RUNNING'};
  const save=()=>writeFile(path.join(output,`${evidence.mode}-result.json`),JSON.stringify(evidence,null,2));
  async function run(name,command,args,extraEnv={}) {
    const started=Date.now();
    const result=await new Promise(resolve=>{
      const child=spawn(command,args,{cwd:root,env:{...env,...extraEnv},stdio:['ignore','pipe','pipe']});
      let raw='',excess=false;
      for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{raw+=chunk;if(raw.length>32*1024*1024){excess=true;child.kill('SIGKILL');}});
      const timeout=setTimeout(()=>child.kill('SIGKILL'),20*60*1000);
      child.on('error',()=>{clearTimeout(timeout);resolve({code:127,raw:'Command could not start.'});});
      child.on('close',(code,signal)=>{clearTimeout(timeout);resolve({code:code ?? 128,raw:excess?'Output exceeded bounded capture.':raw,signal});});
    });
    const text=sanitizeOutput(result.raw,secrets);
    await writeFile(path.join(output,`${name}.log`),text);
    const counts=Object.fromEntries([...text.matchAll(/(?:#|ℹ)\s+(tests|pass|fail|skipped)\s+(\d+)/g)].map(match=>[match[1],Number(match[2])]));
    evidence.commands.push({name,command:[path.basename(command),...args],exitCode:result.code,signal:result.signal??null,elapsedMs:Date.now()-started,...(Object.keys(counts).length?{counts}:{})});
    await save();
    console.log(`${name}: exit ${result.code}${counts.tests===undefined?'':`, tests ${counts.tests}, pass ${counts.pass}, fail ${counts.fail}, skipped ${counts.skipped}`}`);
    if(result.code!==0){console.log(text.slice(-18000));throw new Error(`Check failed: ${name}`);}
  }
  let redis, regressionRedis;
  try {
    verifySourceProvenance(process.env.GITHUB_ACTIONS==='true',dirtyWorktree);
    if(mode==='--unit') {
      const selected=selectUnitFiles(await readdir(path.join(root,'tests')));
      assert.ok(selected.includes('vk-audit-connector.test.ts') && selected.includes('vk-publication-authorization.test.ts') && selected.includes('publication-outcomes.test.ts'),'Mandatory unit scenarios missing');
      await run('unit-contract',process.execPath,['--test','--test-reporter=spec','--test-concurrency=1','--experimental-strip-types',...selected.map(name=>`tests/${name}`)]);
    } else {
      // This mode is deliberately unavailable against an ambient/local DSN.
      assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI required');
      assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','GitHub-hosted disposable runner required');
      assert.equal(process.env.VK_AUDIT_DISPOSABLE_CI,'1','Disposable CI attestation required');
      assert.equal(process.env.VK_AUDIT_UNIT_REVISION,source,'Unit gate belongs to another revision');
      for(const suite of suites)await readFile(path.join(root,'tests',suite));
      const containers={};
      for(const [name,image,port,key] of [['postgres','postgres:17-alpine',5432,'VK_AUDIT_POSTGRES_CONTAINER'],['redis','redis:7-alpine',6379,'VK_AUDIT_REDIS_CONTAINER']]) {
        const id=process.env[key] ?? '';
        assert.match(id,/^[a-f0-9]{64}$/,'Container identity unavailable');
        const inspected=spawnSync('docker',['inspect',id],{encoding:'utf8',env:cleanEnvironment(process.env)});
        assert.equal(inspected.status,0,'Container attestation failed');
        containers[name]=verifyContainer(JSON.parse(inspected.stdout)[0],id,image,port);
      }
      const suffix=randomBytes(8).toString('hex'),database=`vk_audit_${suffix}`,user=`vk_audit_${suffix}`,password=randomBytes(32).toString('hex'),redisPassword=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex');
      const admin=new Client({host:'127.0.0.1',port:5432,database:'postgres',user:'postgres',password:'vk-audit-disposable-bootstrap',connectionTimeoutMillis:5000});
      let pgIdentity;
      try {
        await admin.connect();
        const {rows:[identity]}=await admin.query("SELECT current_setting('server_version_num')::int AS version_num, system_identifier::text FROM pg_control_system()");
        assert.ok(identity.version_num>=170000 && identity.version_num<180000,'PostgreSQL17 required');pgIdentity=identity;
        // Identifiers and passwords consist solely of locally generated hex.
        await admin.query(`CREATE ROLE ${user} LOGIN PASSWORD '${password}'`);
        await admin.query(`CREATE DATABASE ${database} OWNER ${user}`);
      } finally {await admin.end();}
      secrets.push(password,redisPassword,nonce);
      env.DATABASE_URL=`postgresql://${user}:${password}@127.0.0.1:5432/${database}`;
      env.REDIS_URL=`redis://:${redisPassword}@127.0.0.1:6379/13`;
      env.OWNER_EMAIL='owner@example.test';
      // Existing auth suites intentionally use this public synthetic password;
      // its salt/hash are generated for this run, never copied from user env.
      const ownerPassword='ci-test-owner-password',salt=randomBytes(16),derived=scryptSync(ownerPassword,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
      env.OWNER_PASSWORD_HASH=['scrypt','1','16384','8','1',salt.toString('base64url'),derived.toString('base64url')].join('$');
      env.SESSION_SECRET=randomBytes(32).toString('hex');
      env.VK_AUDIT_ISOLATED='1';
      secrets.push(env.DATABASE_URL,env.REDIS_URL,env.OWNER_PASSWORD_HASH,env.SESSION_SECRET,ownerPassword);
      redis=new Redis({host:'127.0.0.1',port:6379,db:13,maxRetriesPerRequest:0,lazyConnect:true});
      await redis.connect();
      const redisInfo=await redis.info('server'),redisVersion=/^redis_version:([^\r\n]+)/m.exec(redisInfo)?.[1],redisRunId=/^run_id:([^\r\n]+)/m.exec(redisInfo)?.[1];
      assert.match(redisVersion ?? '',/^7\./,'Redis7 required');assert.match(redisRunId ?? '',/^[a-f0-9]{40}$/,'Redis run identity unavailable');
      await redis.config('SET','requirepass',redisPassword);await redis.auth(redisPassword);
      const sentinel=`vk-audit:${suffix}:sentinel`;
      assert.equal(await redis.set(sentinel,nonce,'NX'),'OK');assert.equal(await redis.get(sentinel),nonce);
      const databaseClient=new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
      try {await databaseClient.connect();await databaseClient.query('CREATE TABLE vk_audit_runtime_sentinel (nonce text NOT NULL)');await databaseClient.query('INSERT INTO vk_audit_runtime_sentinel VALUES ($1)',[nonce]);assert.equal((await databaseClient.query('SELECT nonce FROM vk_audit_runtime_sentinel')).rows[0].nonce,nonce);}finally{await databaseClient.end();}
      evidence.isolation={containers,postgres:pgIdentity,redis:{version:redisVersion,runId:redisRunId,database:13},database,runSuffix:suffix,nonceVerified:true,providerCredentialsInherited:false,network:'loopback-only test preload',bullmq:require('bullmq/package.json').version,ioredis:require('ioredis/package.json').version};
      assert.equal(evidence.isolation.bullmq,'5.81.5','Pinned BullMQ required');assert.equal(evidence.isolation.ioredis,'5.11.1','Pinned ioredis required');
      await save();
      console.log('Disposable PostgreSQL17/Redis7 identities and nonce sentinels verified; child environment excludes ambient credentials.');
      await run('migrations','pnpm',['db:migrate']);
      await run('targeted-integration-suites',process.execPath,['--test','--test-reporter=spec','--test-concurrency=1','--experimental-strip-types',...suites.map(name=>`tests/${name}`)]);

      // Existing broad regression guards require /planly_test, and its additive
      // migration rehearsal creates its own child databases. Preserve these
      // guards in a separate DB/role and Redis DB14 on this attested CI instance.
      const regressionUser=`vk_full_${suffix}`,regressionPassword=randomBytes(32).toString('hex'),regressionNonce=randomBytes(32).toString('hex');
      const regressionAdmin=new Client({host:'127.0.0.1',port:5432,database:'postgres',user:'postgres',password:'vk-audit-disposable-bootstrap',connectionTimeoutMillis:5000});
      try {
        await regressionAdmin.connect();
        assert.equal((await regressionAdmin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,pgIdentity.system_identifier,'PostgreSQL instance changed');
        assert.equal((await regressionAdmin.query("SELECT count(*)::int AS count FROM pg_database WHERE datname='planly_test'")).rows[0].count,0,'Regression DB must not preexist');
        await regressionAdmin.query(`CREATE ROLE ${regressionUser} LOGIN CREATEDB PASSWORD '${regressionPassword}'`);
        await regressionAdmin.query(`CREATE DATABASE planly_test OWNER ${regressionUser}`);
      } finally {await regressionAdmin.end();}
      const regressionDatabaseUrl=`postgresql://${regressionUser}:${regressionPassword}@127.0.0.1:5432/planly_test`,regressionRedisUrl=`redis://:${redisPassword}@127.0.0.1:6379/14`;
      assert.equal(new URL(regressionDatabaseUrl).pathname,'/planly_test','Preserve full-suite database guard');
      secrets.push(regressionPassword,regressionNonce,regressionDatabaseUrl,regressionRedisUrl);
      const fullEnvironment={DATABASE_URL:regressionDatabaseUrl,REDIS_URL:regressionRedisUrl};
      const fullDb=new Client({connectionString:regressionDatabaseUrl,connectionTimeoutMillis:5000});
      try {await fullDb.connect();await fullDb.query('CREATE TABLE vk_audit_runtime_sentinel (nonce text NOT NULL)');await fullDb.query('INSERT INTO vk_audit_runtime_sentinel VALUES ($1)',[regressionNonce]);}finally{await fullDb.end();}
      regressionRedis=new Redis({host:'127.0.0.1',port:6379,password:redisPassword,db:14,maxRetriesPerRequest:0,lazyConnect:true});
      await regressionRedis.connect();assert.equal(await regressionRedis.set(sentinel,regressionNonce,'NX'),'OK');
      evidence.fullRegression={database:'planly_test',createdForRun:true,role:regressionUser,createdb:true,redisDatabase:14,nonceVerified:true};
      await save();
      await run('full-regression-migrations','pnpm',['db:migrate'],fullEnvironment);
      await run('full-suite','pnpm',['test'],fullEnvironment);
      await run('typecheck','pnpm',['typecheck'],fullEnvironment);
      await run('lint','pnpm',['lint'],fullEnvironment);
      await run('build','pnpm',['build'],{...fullEnvironment,NODE_ENV:'production'});
      assert.equal(await regressionRedis.get(sentinel),regressionNonce,'Regression Redis identity changed');
      const fullCheck=new Client({connectionString:regressionDatabaseUrl,connectionTimeoutMillis:5000});
      try {await fullCheck.connect();assert.equal((await fullCheck.query('SELECT nonce FROM vk_audit_runtime_sentinel')).rows[0].nonce,regressionNonce,'Regression PostgreSQL identity changed');}finally{await fullCheck.end();}
      assert.equal(await redis.get(sentinel),nonce,'Redis runtime changed during tests');
      const check=new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
      try{await check.connect();assert.equal((await check.query('SELECT nonce FROM vk_audit_runtime_sentinel')).rows[0].nonce,nonce,'PostgreSQL runtime changed during tests');}finally{await check.end();}
      evidence.finalNonceVerified=true;
    }
    evidence.status='PASS';
  } catch(error) {
    evidence.status='FAIL';
    // Infrastructure exceptions can carry credentials/SQL; retain a closed label.
    evidence.failure=error instanceof Error && /^Check failed: [a-z-]+$/.test(error.message)?error.message:'ISOLATION_OR_RUNNER_CHECK_FAILED';
    process.exitCode=1;
  } finally {
    if(redis)redis.disconnect();
    if(regressionRedis)regressionRedis.disconnect();
    await save();console.log(`${evidence.mode}: ${evidence.status}; source ${source}`);
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(()=>{console.error('VK_AUDIT_RUNNER_REFUSED');process.exitCode=1;});
}

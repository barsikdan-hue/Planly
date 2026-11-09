import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';

const files=[
  '.next/server/app/api/social-accounts/vk/upload-receipt-test/route.js',
  '.next/server/app/social-connections/vk-upload-receipt-test/route.js',
  'public/vk-upload-receipt.mjs','public/vk-upload-receipt-window.mjs','public/vk-upload-window-core.mjs',
  '.next/server/app/api/social-accounts/vk/callback/route.js',
];
const hashPattern=/^[a-f0-9]{64}$/;
const sourcePattern=/^[a-f0-9]{40}$/;
const imagePattern=/^sha256:[a-f0-9]{64}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function imageBuildEnvironment(source) {
  const keys=['PATH','HOME','USERPROFILE','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR'];
  return {...Object.fromEntries(keys.filter(key=>typeof source[key]==='string').map(key=>[key,source[key]])),CI:'true',DOCKER_BUILDKIT:'1'};
}
export function validateSourceIdentity(source,expected,dirty) {
  assert.match(source,sourcePattern,'Invalid source revision');
  assert.equal(source,expected,'Image source differs from verified unit/integration revision');
  assert.equal(dirty,false,'Image export requires clean committed source');
}
export function imageBuildArguments(source) {
  assert.match(source,sourcePattern);
  return ['build','--platform','linux/amd64','--label',`org.opencontainers.image.revision=${source}`,'--tag',`lentaro-vk-web:${source}`,'--file','.superpowers/vk-web-image/Dockerfile.web-image','.'];
}
export function deriveBuildRecipe(recipeText) {
  assert.equal((recipeText.match(/^RUN pnpm build\r?$/gm)??[]).length,1,'Expected exactly one literal compilation instruction');
  const derived=recipeText.replace(/^RUN pnpm build(?=\r?$)/m,'RUN --network=none pnpm build');
  return {recipeText:derived,originalSha256:sha(recipeText),derivedSha256:sha(derived),transformation:'RUN pnpm build -> RUN --network=none pnpm build'};
}
export function validateImageMetadata(row,source) {
  assert.match(source,sourcePattern);assert.match(row?.Id??'',imagePattern);
  assert.equal(row.Os,'linux');assert.equal(row.Architecture,'amd64');
  assert.equal(row.Config?.User,'node');assert.equal(row.Config?.WorkingDir,'/app');
  assert.equal(row.Config?.Labels?.['org.opencontainers.image.revision'],source);
  const allowed=new Set(['PATH','NODE_VERSION','YARN_VERSION','NODE_ENV','NEXT_TELEMETRY_DISABLED']);
  assert.ok(Array.isArray(row.Config.Env) && row.Config.Env.every(item=>typeof item==='string' && allowed.has(item.split('=',1)[0])),'Unexpected environment baked into image');
  assert.ok(Number.isSafeInteger(row.Size) && row.Size>0 && row.Size<=8*1024**3,'Image size outside export budget');
  return {imageId:row.Id,platform:'linux/amd64',user:'node',sizeBytes:row.Size};
}
export function validateFilesystemProof(proof,publicHashes) {
  assert.match(proof?.buildIdSha256??'',hashPattern);
  assert.equal(proof.files?.length,files.length);
  const seen=new Set();
  for(const item of proof.files){
    assert.ok(files.includes(item.path) && !seen.has(item.path));seen.add(item.path);
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes>0 && item.bytes<=16*1024**2);
    assert.match(item.sha256,hashPattern);
    if(item.path.startsWith('public/'))assert.equal(item.sha256,publicHashes[item.path],'Image public module differs from committed source');
  }
  return {buildIdSha256:proof.buildIdSha256,files:proof.files.map(({path,bytes,sha256})=>({path,bytes,sha256}))};
}
export function createImageManifest({source,image,proof,archive,recipe,runId,runAttempt}) {
  assert.match(source,sourcePattern);assert.match(image.imageId,imagePattern);assert.equal(image.platform,'linux/amd64');assert.equal(image.user,'node');
  assert.equal(archive.name,'vk-web-image.tar.gz');assert.match(archive.sha256,hashPattern);
  assert.ok(Number.isSafeInteger(archive.sizeBytes) && archive.sizeBytes>0 && archive.sizeBytes<=4*1024**3);
  assert.match(runId,/^[1-9]\d{0,19}$/);assert.match(runAttempt,/^[1-9]\d{0,5}$/);
  assert.match(recipe.originalSha256,hashPattern);assert.match(recipe.derivedSha256,hashPattern);assert.equal(recipe.transformation,'RUN pnpm build -> RUN --network=none pnpm build');
  return {schemaVersion:1,sourceSha:source,imageId:image.imageId,platform:image.platform,user:image.user,imageSizeBytes:image.sizeBytes,archive,
    recipe:{originalSha256:recipe.originalSha256,derivedSha256:recipe.derivedSha256,transformation:recipe.transformation},
    buildIdSha256:proof.buildIdSha256,files:proof.files,filesystemOnly:true,appStarted:false,providerCalls:0,compilationNetwork:'none',runId,runAttempt};
}

async function main() {
  assert.equal(process.argv[2],'--export');assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
  const env=imageBuildEnvironment(process.env),root=process.cwd();
  const git=args=>{const result=spawnSync('git',args,{env,encoding:'utf8'});assert.equal(result.status,0,'Source identity unavailable');return result.stdout.trim();};
  const source=git(['rev-parse','HEAD']);validateSourceIdentity(source,process.env.VK_WEB_IMAGE_SOURCE,git(['status','--porcelain']).length>0);
  const runId=process.env.VK_WEB_IMAGE_RUN_ID??'',runAttempt=process.env.VK_WEB_IMAGE_RUN_ATTEMPT??'';
  assert.match(runId,/^[1-9]\d{0,19}$/);assert.match(runAttempt,/^[1-9]\d{0,5}$/);
  const output=path.join(root,'.superpowers/vk-web-image');await mkdir(output,{recursive:true});
  const recipe=deriveBuildRecipe(await readFile(path.join(root,'Dockerfile'),'utf8'));
  await writeFile(path.join(output,'Dockerfile.web-image'),recipe.recipeText,{flag:'wx',mode:0o600});
  const publicHashes=Object.fromEntries(await Promise.all(files.filter(file=>file.startsWith('public/')).map(async file=>[file,sha(await readFile(path.join(root,file)))])));
  const dockerPrefix=['--host','unix:///var/run/docker.sock'];
  async function docker(args,timeoutMs=120_000) {
    const result=await new Promise((resolve,reject)=>{
      const child=spawn('docker',[...dockerPrefix,...args],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
      const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
      child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16*1024**2)child.kill('SIGKILL');});
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-64*1024);});
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderr});});
    });
    if(result.code!==0){
      // Build context excludes env files; no host credentials enter the child.
      // Still remove access-bearing URLs/fields from dependency diagnostics.
      const safe=result.stderr.replace(/https?:\/\/[^\s'"<>]+\?[^\s'"<>]+/gi,'[REDACTED_URL]').replace(/\b(access_token|refresh_token|authorization)\s*[:=]\s*[^\s,}\]]+/gi,'$1=[REDACTED]');
      console.error(safe.slice(-18000));throw new Error('IMAGE_COMMAND_FAILED');
    }
    return result.stdout;
  }
  console.log(`Building isolated Linux web image from ${source}`);
  await docker(imageBuildArguments(source),20*60_000);
  const [inspected]=JSON.parse(await docker(['image','inspect',`lentaro-vk-web:${source}`]));
  const image=validateImageMetadata(inspected,source);
  // This container executes only Node builtins and filesystem reads. It never
  // imports a Next route, starts the application or receives runtime secrets.
  const probe=`const fs=require('node:fs'),crypto=require('node:crypto');if(process.getuid()===0)throw Error('ROOT');const names=${JSON.stringify(files)};const files=names.map(path=>{const target='/app/'+path,real=fs.realpathSync(target),s=fs.lstatSync(target);if(!real.startsWith('/app/')||!s.isFile()||s.size<1||s.size>16777216)throw Error('FILE');return {path,bytes:s.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};});const id=fs.readFileSync('/app/.next/BUILD_ID');if(!/^[A-Za-z0-9_-]{1,128}$/.test(id.toString().trim()))throw Error('BUILD_ID');console.log(JSON.stringify({files,buildIdSha256:crypto.createHash('sha256').update(id).digest('hex')}));`;
  const proof=validateFilesystemProof(JSON.parse(await docker(['run','--rm','--network=none','--read-only','--user=node','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=64','--memory=256m','--entrypoint=node',image.imageId,'-e',probe])),publicHashes);
  assert.equal(git(['status','--porcelain']).length,0,'Tracked/untracked source changed during image build');
  const archiveName='vk-web-image.tar.gz',archivePath=path.join(output,archiveName),hash=createHash('sha256');let archiveBytes=0,rawBytes=0;
  const child=spawn('docker',[...dockerPrefix,'image','save',image.imageId],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',()=>{});
  const completed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('IMAGE_EXPORT_FAILED')));});
  const timer=setTimeout(()=>child.kill('SIGKILL'),10*60_000);
  try {
    await Promise.all([completed,pipeline(child.stdout,new Transform({transform(chunk,_encoding,callback){rawBytes+=chunk.length;callback(rawBytes>8*1024**3?new Error('RAW_ARCHIVE_BUDGET'):null,chunk);}}),createGzip({level:6}),new Transform({transform(chunk,_encoding,callback){archiveBytes+=chunk.length;hash.update(chunk);callback(archiveBytes>4*1024**3?new Error('ARCHIVE_BUDGET'):null,chunk);}}),createWriteStream(archivePath,{flags:'wx',mode:0o600}))]);
  } catch(error){child.kill('SIGKILL');throw error;} finally{clearTimeout(timer);}
  assert.equal((await stat(archivePath)).size,archiveBytes);
  const archive={name:archiveName,sha256:hash.digest('hex'),sizeBytes:archiveBytes};
  const manifest=createImageManifest({source,image,proof,archive,recipe,runId,runAttempt});
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(path.join(output,'SOURCE_REVISION'),source+'\n',{flag:'wx',mode:0o600});
  await writeFile(path.join(output,'SHA256SUMS'),`${archive.sha256}  ${archive.name}\n`,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({source,imageId:image.imageId,platform:image.platform,archiveSha256:archive.sha256,archiveBytes,filesystemOnly:true}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('VK_WEB_IMAGE_EXPORT_FAILED');process.exitCode=1;});

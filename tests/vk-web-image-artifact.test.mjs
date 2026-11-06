import test from 'node:test';
import assert from 'node:assert/strict';
import { imageBuildEnvironment, imageBuildArguments, validateImageMetadata, validateFilesystemProof, validateSourceIdentity, createImageManifest, deriveBuildRecipe } from '../scripts/export-vk-web-image.mjs';

const source='1'.repeat(40),imageId=`sha256:${'2'.repeat(64)}`;
const image=()=>({Id:imageId,Os:'linux',Architecture:'amd64',Size:123456,Config:{User:'node',WorkingDir:'/app',Env:['PATH=/usr/local/bin:/usr/bin','NODE_VERSION=22.13.0','YARN_VERSION=1.22.22','NODE_ENV=production','NEXT_TELEMETRY_DISABLED=1'],Labels:{'org.opencontainers.image.revision':source}}});
const proof=()=>({buildIdSha256:'3'.repeat(64),files:[
  {path:'.next/server/app/api/social-accounts/vk/upload-receipt-test/route.js',bytes:100,sha256:'4'.repeat(64)},
  {path:'.next/server/app/social-connections/vk-upload-receipt-test/route.js',bytes:101,sha256:'5'.repeat(64)},
  {path:'public/vk-upload-receipt.mjs',bytes:102,sha256:'6'.repeat(64)},
  {path:'public/vk-upload-receipt-window.mjs',bytes:103,sha256:'7'.repeat(64)},
  {path:'public/vk-upload-window-core.mjs',bytes:104,sha256:'8'.repeat(64)},
]});
const publicHashes={'public/vk-upload-receipt.mjs':'6'.repeat(64),'public/vk-upload-receipt-window.mjs':'7'.repeat(64),'public/vk-upload-window-core.mjs':'8'.repeat(64)};

test('image build drops ambient credentials, proxies, remote Docker and Node injection',()=>{
  assert.deepEqual(imageBuildEnvironment({PATH:'/bin',HOME:'/runner',NODE_OPTIONS:'--import=bad',DOCKER_HOST:'tcp://foreign',HTTP_PROXY:'credential-proxy',DATABASE_URL:'production',VK_SERVICE_TOKEN:'secret'}),{PATH:'/bin',HOME:'/runner',CI:'true',DOCKER_BUILDKIT:'1'});
  const args=imageBuildArguments(source);
  assert.deepEqual(args,['build','--platform','linux/amd64','--label',`org.opencontainers.image.revision=${source}`,'--tag',`lentaro-vk-web:${source}`,'--file','.superpowers/vk-web-image/Dockerfile.web-image','.']);
});

test('derived recipe disables network only for the one compilation instruction and refuses recipe drift',()=>{
  const text='FROM node:22.13.0 AS dependencies\nRUN pnpm install --frozen-lockfile\nFROM dependencies AS build\nRUN pnpm build\nUSER node\n';
  const derived=deriveBuildRecipe(text);
  assert.equal(derived.recipeText,'FROM node:22.13.0 AS dependencies\nRUN pnpm install --frozen-lockfile\nFROM dependencies AS build\nRUN --network=none pnpm build\nUSER node\n');
  assert.match(derived.originalSha256,/^[a-f0-9]{64}$/);assert.match(derived.derivedSha256,/^[a-f0-9]{64}$/);assert.notEqual(derived.originalSha256,derived.derivedSha256);
  assert.throws(()=>deriveBuildRecipe(text+'RUN pnpm build\n'));assert.throws(()=>deriveBuildRecipe(text.replace('RUN pnpm build','RUN npm run build')));
});

test('image validation binds source, immutable image id, platform and nonroot runtime without credential env',()=>{
  assert.deepEqual(validateImageMetadata(image(),source),{imageId,platform:'linux/amd64',user:'node',sizeBytes:123456});
  for(const override of [{Id:'mutable-tag'},{Architecture:'arm64'},{Os:'windows'},{Config:{...image().Config,User:'root'}},{Config:{...image().Config,Labels:{'org.opencontainers.image.revision':'9'.repeat(40)}}},{Config:{...image().Config,Env:['VK_SERVICE_TOKEN=must-not-be-baked']}}])assert.throws(()=>validateImageMetadata({...image(),...override},source));
});

test('filesystem proof requires both compiled routes and exact public bytes, rejects incomplete or forged receipts',()=>{
  assert.deepEqual(validateFilesystemProof(proof(),publicHashes),proof());
  const missing=proof();missing.files.pop();assert.throws(()=>validateFilesystemProof(missing,publicHashes));
  const wrong=proof();wrong.files[2].sha256='9'.repeat(64);assert.throws(()=>validateFilesystemProof(wrong,publicHashes));
  const duplicate=proof();duplicate.files[4]={...duplicate.files[3]};assert.throws(()=>validateFilesystemProof(duplicate,publicHashes));
  const empty=proof();empty.files[0].bytes=0;assert.throws(()=>validateFilesystemProof(empty,publicHashes));
});

test('artifact cannot claim an untested source or export a dirty checkout',()=>{
  assert.doesNotThrow(()=>validateSourceIdentity(source,source,false));
  assert.throws(()=>validateSourceIdentity(source,'9'.repeat(40),false));
  assert.throws(()=>validateSourceIdentity(source,source,true));
});

test('manifest binds the exported archive hash and size to the inspected image and checked files',()=>{
  const recipe=deriveBuildRecipe('FROM node:22.13.0\nRUN pnpm build\n');
  const manifest=createImageManifest({source,image:validateImageMetadata(image(),source),proof:validateFilesystemProof(proof(),publicHashes),archive:{name:'vk-web-image.tar.gz',sha256:'a'.repeat(64),sizeBytes:999},recipe,runId:'42000000000',runAttempt:'1'});
  assert.equal(manifest.sourceSha,source);assert.equal(manifest.imageId,imageId);assert.equal(manifest.platform,'linux/amd64');assert.deepEqual(manifest.archive,{name:'vk-web-image.tar.gz',sha256:'a'.repeat(64),sizeBytes:999});
  assert.equal(manifest.filesystemOnly,true);assert.equal(manifest.appStarted,false);assert.equal(manifest.providerCalls,0);
  assert.deepEqual(manifest.recipe,{originalSha256:recipe.originalSha256,derivedSha256:recipe.derivedSha256,transformation:'RUN pnpm build -> RUN --network=none pnpm build'});
  assert.throws(()=>createImageManifest({source,image:validateImageMetadata(image(),source),proof:proof(),archive:{name:'../unsafe.tar.gz',sha256:'a'.repeat(64),sizeBytes:999},recipe,runId:'42000000000',runAttempt:'1'}));
});

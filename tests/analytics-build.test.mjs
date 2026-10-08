import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const checker=fileURLToPath(new URL('../scripts/verify-analytics-build.mjs',import.meta.url));
const validCss='.analytics-controls{display:flex}.analytics-controls button{padding:9px 14px}.analytics-results td,.analytics-results th{padding:14px 10px}';
async function fixture(t,css,href='/_next/static/chunks/entry.css'){
  const root=await mkdtemp(path.join(tmpdir(),'planly-analytics-build-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'.next/server/app'),{recursive:true});
  await mkdir(path.join(root,'.next/static/chunks'),{recursive:true});
  await mkdir(path.join(root,'app'),{recursive:true});
  await writeFile(path.join(root,'app/globals.css'),validCss);
  await writeFile(path.join(root,'.next/server/app/index.html'),`<html><head><link rel="stylesheet" href="${href}"></head><body></body></html>`);
  await writeFile(path.join(root,'.next/static/chunks/entry.css'),css);
  return root;
}
const run=root=>spawnSync(process.execPath,[checker],{cwd:root,encoding:'utf8',timeout:10000});

test('release build rejects missing analytics styles even when source CSS contains them',async t=>{
  const root=await fixture(t,'.library-heading{display:flex}');const result=run(root);
  assert.equal(result.status,1);const diagnostic=JSON.parse(result.stdout);
  assert.equal(diagnostic.code,'ANALYTICS_CSS_MISSING');
  assert.equal(diagnostic.checks.controlsLayout,false);
  assert.ok(!result.stdout.includes(root));
});
test('release build accepts connected controls and table styles from the emitted route stylesheet',async t=>{
  const root=await fixture(t,validCss);const result=run(root);
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).code,'ANALYTICS_CSS_OK');
});
test('an orphan CSS file or commented selectors cannot hide missing route styles',async t=>{
  const root=await fixture(t,'/* '+validCss+' */');
  await writeFile(path.join(root,'.next/static/chunks/orphan.css'),validCss);
  const result=run(root);assert.equal(result.status,1);
  assert.equal(JSON.parse(result.stdout).code,'ANALYTICS_CSS_MISSING');
});
test('stylesheet links inside HTML comments do not connect orphan CSS to the route',async t=>{
  const root=await fixture(t,validCss);
  await writeFile(path.join(root,'.next/server/app/index.html'),'<html><head><!--\n<link rel="stylesheet" href="/_next/static/chunks/entry.css">\n--><!--<link rel="stylesheet" href="/_next/static/chunks/entry.css">--></head><body></body></html>');
  const result=run(root);assert.equal(result.status,1);
  const diagnostic=JSON.parse(result.stdout);
  assert.equal(diagnostic.code,'ANALYTICS_CSS_ASSET_INVALID');
  assert.equal(diagnostic.stylesheetCount,0);
  assert.deepEqual(diagnostic.checks,{controlsLayout:false,buttonSpacing:false,tableSpacing:false});
});
test('a stylesheet outside emitted static assets is rejected without fetching it',async t=>{
  const root=await fixture(t,validCss,'https://evil.test/secret.css');
  const result=run(root);assert.equal(result.status,1);
  assert.equal(JSON.parse(result.stdout).code,'ANALYTICS_CSS_ASSET_INVALID');
});

test('dynamic owner route styles are verified through the emitted root route manifest',async t=>{
  const root=await fixture(t,validCss);
  await rm(path.join(root,'.next/server/app/index.html'));
  const manifest={entryCSSFiles:{'[project]/app/layout':[{path:'static/chunks/entry.css',inlined:false}]}};
  await writeFile(path.join(root,'.next/server/app/page_client-reference-manifest.js'),`globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify(manifest)};\n`);
  const result=run(root);assert.equal(result.status,0,result.stdout);
  assert.equal(JSON.parse(result.stdout).code,'ANALYTICS_CSS_OK');
});

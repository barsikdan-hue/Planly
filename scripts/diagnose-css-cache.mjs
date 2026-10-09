// Disposable Linux CI experiment. Never invoke against a running service.
import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, rename, symlink, writeFile} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';

assert.equal(process.platform, 'linux');
assert.equal(process.env.PLANLY_CSS_CACHE_DIAGNOSTIC, 'isolated-ci');
const sourceRoot = process.cwd();
const scratchRoot = path.join(sourceRoot, '.superpowers');
await mkdir(scratchRoot, {recursive: true});
const experiment = await mkdtemp(path.join(scratchRoot, 'css-cache-'));
const project = path.join(experiment, 'project');
await mkdir(project);
execFileSync('tar', ['-x', '-C', project], {input: execFileSync('git', ['archive', 'HEAD'], {maxBuffer: 32 * 1024 * 1024})});
await symlink(path.join(sourceRoot, 'node_modules'), path.join(project, 'node_modules'), 'dir');
// Keep the shared dependency link inside Turbopack's filesystem root.
await writeFile(path.join(project, 'next.config.ts'), `export default {turbopack:{root:${JSON.stringify(sourceRoot)}}};\n`);
const cssPath = path.join(project, 'app/globals.css');
const current = await readFile(cssPath, 'utf8');
const marker = '/* Reviewed batch scheduling: long content remains readable on narrow screens. */';
assert.equal(current.split(marker).length, 2);
const baseline = current.slice(0, current.indexOf(marker));
const checker = path.join(sourceRoot, 'scripts/verify-analytics-build.mjs');
const next = path.join(sourceRoot, 'node_modules/next/dist/bin/next');
function build(stage) {
  const result = spawnSync(process.execPath, [next, 'build'], {cwd: project, encoding: 'utf8', env: {...process.env, NODE_ENV: 'production'}, maxBuffer: 4 * 1024 * 1024, timeout: 240000});
  assert.equal(result.status, 0, `CSS_CACHE_BUILD_FAILED_${stage}`);
  const verification = spawnSync(process.execPath, [checker], {cwd: project, encoding: 'utf8', timeout: 10000});
  assert.ok([0, 1].includes(verification.status), 'CSS_CACHE_VERIFIER_FAILED');
  return JSON.parse(verification.stdout);
}
await writeFile(cssPath, baseline);
const old = build('BASELINE');
assert.equal(old.checks.controlsLayout, true);
assert.equal(old.checks.schedulingLayout, false);
await cp(path.join(project, '.next/cache'), path.join(experiment, 'cache'), {recursive: true});
await rename(path.join(project, '.next'), path.join(experiment, 'old-output'));
await mkdir(path.join(project, '.next'));
await cp(path.join(experiment, 'cache'), path.join(project, '.next/cache'), {recursive: true});
await writeFile(cssPath, current);
const restored = build('RESTORED');
await rename(path.join(project, '.next'), path.join(experiment, 'restored-output'));
const fresh = build('FRESH_CONTROL');
console.log(JSON.stringify({code: 'CSS_CACHE_DIAGNOSTIC', old, restored, fresh}));
assert.equal(fresh.code, 'ANALYTICS_CSS_OK');
assert.equal(restored.code, 'ANALYTICS_CSS_OK', 'RESTORED_CACHE_LOST_CURRENT_CSS');
assert.deepEqual(restored.assets, fresh.assets, 'RESTORED_CACHE_DIFFERS_FROM_FRESH_BUILD');

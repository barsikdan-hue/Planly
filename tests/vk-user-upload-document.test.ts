import test from 'node:test';
import assert from 'node:assert/strict';
import {userUploadWindowResponse} from '../lib/server/vk/user-upload-window-document.ts';
test('transient token consent page is generic private top-level document with self-only transport',async()=>{
  const r=userUploadWindowResponse(),html=await r.text();
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  const csp=r.headers.get('content-security-policy');assert.ok(csp);assert.match(csp,/connect-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/form-action 'none'/);
  assert.match(html,/ключ VK/);assert.match(html,/только в памяти/);assert.match(html,/не создаётся/);assert.match(html,/vk-user-upload-window.mjs/);assert.match(html,/<button id="confirm" disabled>/);
  assert.doesNotMatch(html,/<script(?! type="module" src=)/);assert.doesNotMatch(html,/access_token|refresh_token|https:\/\/pu\./);
});

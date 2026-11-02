import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadWindowResponse} from '../lib/server/vk/upload-window-document.ts';
test('first-party page denies embedding and exposes no session or upload capability',async()=>{
  const r=uploadWindowResponse();const html=await r.text();
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
  assert.match(r.headers.get('content-security-policy')!,/connect-src 'self'/);
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.match(html,/id="confirm" disabled/);assert.match(html,/src="\/vk-upload-window.mjs"/);
  assert.doesNotMatch(html,/access_token|planly_session|uploadUrl|<form|onclick=/);
});

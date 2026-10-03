import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./helpers/tsx-loader.mjs', import.meta.url);
const { Composer } = await import('../components/planner/composer.tsx');
const { Poster } = await import('../components/planner/common.tsx');
const { blankPost } = await import('../lib/planner.ts');
const draft = { ...blankPost(), text: 'Ordered media audit', mediaIds: ['B', 'A'] };
const media = [
  { id: 'A', name: 'AUDIT_A', url: '/audit-A.png', type: 'image/png', size: 1 },
  { id: 'B', name: 'AUDIT_B', url: '/audit-B.mp4', type: 'video/mp4', size: 1 },
];
function previewSources(post, library) {
  const html = renderToStaticMarkup(React.createElement(Composer, {
    draft: post, setDraft() {}, media: library, upload: async () => [], save() {}, publishNow() {},
    accounts: { telegram: true, max: true },
  }));
  const tags = [...html.matchAll(/<(?:img|video)[^>]*>/g)].map(match => match[0])
    .filter(tag => tag.includes('class="preview-media"'));
  return tags.map(tag => tag.match(/src="([^"]+)"/)[1]);
}
function posterMedia(post, library) {
  const html = renderToStaticMarkup(React.createElement(Poster, { post, media: library }));
  return html.match(/<(img|video)[^>]*src="([^"]+)"/)?.slice(1);
}
test('rendered Composer preview follows post attachment order, not library order', () => {
  assert.deepEqual(previewSources(draft, media), ['/audit-B.mp4', '/audit-A.png']);
});
test('rendered Poster cover follows first post attachment, not library order', () => {
  assert.deepEqual(posterMedia(draft, media), ['video', '/audit-B.mp4']);
});
test('rendered media order stays stable when the library is reordered', () => {
  for (const library of [media, [...media].reverse()]) {
    assert.deepEqual(previewSources(draft, library), ['/audit-B.mp4', '/audit-A.png']);
    assert.deepEqual(posterMedia(draft, library), ['video', '/audit-B.mp4']);
  }
});
test('rendered preview and cover skip missing selections while preserving available order', () => {
  const post = { ...draft, mediaIds: ['missing', 'B', 'also-missing', 'A'] };
  assert.deepEqual(previewSources(post, media), ['/audit-B.mp4', '/audit-A.png']);
  assert.deepEqual(posterMedia(post, media), ['video', '/audit-B.mp4']);
});
test('rendered preview has no media and cover keeps the text fallback when all selections are missing', () => {
  const post = { ...draft, mediaIds: ['missing'] };
  assert.deepEqual(previewSources(post, media), []);
  assert.equal(posterMedia(post, media), undefined);
  const html = renderToStaticMarkup(React.createElement(Poster, { post, media }));
  assert.ok(html.includes('Ordered media audit'));
});

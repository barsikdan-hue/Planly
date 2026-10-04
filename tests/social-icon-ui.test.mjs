import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
register('./helpers/tsx-loader.mjs', import.meta.url);
let SocialIcon;
before(async () => { ({ SocialIcon } = await import('../components/planner/common.tsx')); });
for (const small of [false, true]) test(`MAX uses a recognizable accessible symbol in ${small ? 'compact' : 'regular'} icons`, () => {
  const html = renderToStaticMarkup(React.createElement(SocialIcon, { network: 'max', small }));
  assert.match(html, /<svg\b/, 'MAX must render its messenger symbol rather than a word placeholder');
  assert.match(html, /aria-label="MAX"/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /viewBox="0 0 100 100"/);
  assert.match(html, new RegExp(`width="${small ? 13 : 18}"`));
  assert.equal(html.includes('<b>MAX</b>'), false);
});
test('Telegram keeps its existing symbol and accessible name', () => {
  const html = renderToStaticMarkup(React.createElement(SocialIcon, { network: 'telegram' }));
  assert.match(html, /aria-label="Telegram"/);
  assert.match(html, /lucide-send/);
});

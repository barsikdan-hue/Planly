import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./helpers/planner-lifecycle-loader.mjs', import.meta.url);

let Composer;
let blankPost;

before(async () => {
  ({ Composer } = await import('../components/planner/composer.tsx'));
  ({ blankPost } = await import('../lib/planner.ts'));
});

test('Create Post hides the removed AI placeholder and keeps the core publication actions', () => {
  const draft = { ...blankPost(), text: 'Customer-ready post' };
  const html = renderToStaticMarkup(React.createElement(Composer, {
    draft,
    setDraft() {},
    media: [],
    upload: async () => [],
    save() {},
    publishNow() {},
    accounts: { telegram: true, max: true },
  }));

  assert.equal(html.includes('AI-помощник'), false, 'Removed AI promise must not appear in Create Post');
  assert.equal(html.includes('Сохранить черновик'), true);
  assert.equal(html.includes('Запланировать'), true);
  assert.equal(html.includes('Опубликовать сейчас'), true);
});

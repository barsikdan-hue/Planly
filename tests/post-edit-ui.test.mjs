import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./helpers/tsx-loader.mjs', import.meta.url);
const { Composer } = await import('../components/planner/composer.tsx');
const { blankPost, fromServerPost } = await import('../lib/planner.ts');
const reason = 'Публикация уже отправлена. Создай отдельную копию.';
const props = draft => ({ draft, setDraft() {}, media: [], upload: async () => [], save() {}, publishNow() {},
  duplicatePost() {}, accounts: { telegram: true, max: true } });

test('server edit block survives UI mapping even when visible status is scheduled', () => {
  const post = fromServerPost({ id: 'mixed', title: null, baseText: 'Original', status: 'READY', mediaIds: [],
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), editBlockedReason: reason,
    targets: [{ id: 'target', socialAccountId: 'account', provider: 'max', textOverride: null,
      scheduledAt: '2030-01-01T09:00:00Z', publication: { status: 'SCHEDULED', remoteId: null, remoteUrl: null, error: null } }],
  });
  assert.equal(post.status, 'scheduled');
  assert.equal(post.editBlockedReason, reason);
});

test('blocked existing Composer renders local work and copy action without edit or submit controls', () => {
  const draft = { ...blankPost(), id: 'published', text: 'Current unsaved local revision', editBlockedReason: reason,
    overrides: { telegram: 'Local Telegram revision' } };
  const html = renderToStaticMarkup(React.createElement(Composer, props(draft)));
  assert.ok(html.includes('Current unsaved local revision'));
  assert.ok(html.includes('Local Telegram revision'));
  assert.ok(html.includes(reason));
  assert.ok(html.includes('Дублировать в черновик'));
  assert.doesNotMatch(html, /<textarea|type="file"|type="date"|type="time"/);
  assert.doesNotMatch(html, /Сохранить черновик|Опубликовать сейчас|>Запланировать</);
});

test('fresh server reason locks a currently open editor independently of stale draft metadata', () => {
  const draft = { ...blankPost(), id: 'just-published', text: 'Keep local text' };
  const html = renderToStaticMarkup(React.createElement(Composer, { ...props(draft), editBlockedReason: reason }));
  assert.ok(html.includes(reason));
  assert.doesNotMatch(html, /<textarea/);
});

test('new draft and legacy editable originals retain normal editor controls', () => {
  for (const draft of [{ ...blankPost(), text: 'Draft', editBlockedReason: reason },
    { ...blankPost(), id: 'scheduled', text: 'Editable schedule' }]) {
    const html = renderToStaticMarkup(React.createElement(Composer, props(draft)));
    assert.match(html, /<textarea/);
    assert.ok(html.includes('Сохранить черновик'));
  }
});

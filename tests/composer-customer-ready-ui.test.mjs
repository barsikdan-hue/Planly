import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

function renderComposer(draft) {
  return renderToStaticMarkup(React.createElement(Composer, {
    draft,
    setDraft() {},
    media: [],
    upload: async () => [],
    save() {},
    publishNow() {},
    accounts: { telegram: true, max: true },
  }));
}

test('Create Post hides the removed AI placeholder and keeps draft saving', () => {
  const html = renderComposer({ ...blankPost(), text: 'Customer-ready post' });

  assert.equal(html.includes('AI-помощник'), false, 'Removed AI promise must not appear in Create Post');
  assert.equal(html.includes('Сохранить черновик'), true);
});

test('new Create Post defaults to Сейчас and hides scheduling fields', () => {
  const html = renderComposer({ ...blankPost(), text: 'Publish now' });

  assert.equal(html.includes('>Сейчас</button>'), true, 'Create Post must expose an explicit Сейчас mode');
  assert.equal(html.includes('type="date"'), false, 'Schedule date must stay hidden in Сейчас mode');
  assert.equal(html.includes('type="time"'), false, 'Schedule time must stay hidden in Сейчас mode');
  assert.equal(html.includes('Опубликовать сейчас'), true);
});

test('scheduled post opens in Запланировать mode and keeps its schedule controls', () => {
  const html = renderComposer({ ...blankPost(), id: 'post-1', status: 'scheduled', text: 'Scheduled post' });

  assert.equal(html.includes('>Сейчас</button>'), true, 'Both publication modes must remain visible');
  assert.equal(html.includes('type="date"'), true);
  assert.equal(html.includes('type="time"'), true);
  assert.equal(html.includes('Опубликовать сейчас'), false, 'Scheduled edit must not default to immediate publication action');
  assert.equal((html.match(/Запланировать/g) ?? []).length >= 2, true, 'Scheduled mode and scheduled action must both be present');
});

test('full Composer remounts from render-safe state when editor identity changes', () => {
  const appSource = readFileSync(new URL('../components/planner/app.tsx', import.meta.url), 'utf8');

  assert.equal(appSource.includes('const [editorKey, setEditorKey] = useState(initialEditorToken);'), true);
  assert.equal(appSource.includes('const updateEditorToken = useCallback((token: string) => {'), true);
  assert.equal(appSource.includes('editorToken.current = token;'), true);
  assert.equal(appSource.includes('setEditorKey(token);'), true);
  assert.equal(appSource.includes('<Composer key={editorKey} {...composer}/>'), true);
  assert.equal(appSource.includes('key={editorToken.current}'), false, 'React refs must not be read during render');
});

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./helpers/tsx-loader.mjs', import.meta.url);
let PlannerApp;
let Settings;
const accounts = [
  { id: 'tg', provider: 'telegram', providerAccountId: null, displayName: 'Telegram', enabled: false, connectionStatus: 'DISCONNECTED' },
  { id: 'mx', provider: 'max', providerAccountId: '123', displayName: 'MAX', enabled: true, connectionStatus: 'CONNECTED' },
];

before(async () => {
  ({ default: PlannerApp } = await import('../components/planner/app.tsx'));
  ({ Settings } = await import('../components/planner/settings.tsx'));
});

test('sidebar omits editor shortcut while keeping the content destination', () => {
  const html = renderToStaticMarkup(React.createElement(PlannerApp));
  assert.equal(html.includes('Создать пост'), false);
  assert.ok(html.includes('Библиотека'));
});

test('sidebar omits social accounts destination while keeping Settings', () => {
  const html = renderToStaticMarkup(React.createElement(PlannerApp));
  assert.equal(html.includes('>Соцсети<'), false);
  assert.ok(html.includes('Настройки'));
});

test('Settings includes existing Telegram and MAX connection controls below its page heading', () => {
  const html = renderToStaticMarkup(React.createElement(Settings, {
    name: 'Данил', saveName() {}, accounts, toggle() {}, async connect() {},
  }));
  assert.ok(html.includes('destination-tg'), 'Telegram connection field is missing from Settings');
  assert.ok(html.includes('destination-mx'), 'MAX connection field is missing from Settings');
  assert.ok(html.includes('account-tg'));
  assert.ok(html.includes('account-mx'));
  assert.ok(html.includes('1 из 2 подключены'));
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.ok(html.includes('<h2>Социальные сети</h2>'));
  assert.ok(html.includes('<h3>Telegram</h3>'));
});

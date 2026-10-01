import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loginPage = await readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8');
const loginCss = await readFile(new URL('../app/login/login.css', import.meta.url), 'utf8');

test('owner login imports scoped styles', () => {
  assert.match(loginPage, /import\s+["']\.\/login\.css["'];?/);
});

test('owner login has card, form and error styles', () => {
  for (const selector of ['.login-shell', '.login-card', '.login-brand', '.login-error']) {
    assert.ok(loginCss.includes(selector), `missing ${selector}`);
  }
  assert.match(loginCss, /\.login-card\s+form/);
  assert.match(loginCss, /\.login-card\s+button/);
});

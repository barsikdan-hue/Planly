import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlannerView } from '../lib/planner-navigation.ts';

test('legacy social account links resolve to Settings', () => {
  assert.equal(normalizePlannerView('socials'), 'settings');
});

test('editor route remains reachable without a sidebar shortcut', () => {
  assert.equal(normalizePlannerView('create'), 'create');
});

test('normal planner destinations remain reachable', () => {
  for (const view of ['dashboard', 'calendar', 'content', 'media', 'analytics', 'settings']) {
    assert.equal(normalizePlannerView(view), view);
  }
});

test('unknown destinations are rejected so the caller can retain its fallback', () => {
  assert.equal(normalizePlannerView(''), null);
  assert.equal(normalizePlannerView('missing-page'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as editability from '../lib/server/post-editability.ts';
const current = { title: null, baseText: 'Preserved text', status: 'READY' as const, mediaIds: ['owned-media'], targets: [{ provider: 'max' as const, textOverride: null, scheduledAt: '2030-01-01T07:00:00Z' }] };
const cancellation = { ...current, status: 'DRAFT' as const, targets: [{ ...current.targets[0], scheduledAt: null }] };
test('expired access permits only cancellation without content, account or media mutation', () => {
  assert.ok(editability.isOnlyPostCancellation);
  assert.equal(editability.isOnlyPostCancellation(current, cancellation), true);
  assert.equal(editability.isOnlyPostCancellation(current, { ...cancellation, baseText: 'Changed' }), false);
  assert.equal(editability.isOnlyPostCancellation(current, { ...cancellation, mediaIds: [] }), false);
  assert.equal(editability.isOnlyPostCancellation(current, { ...cancellation, targets: [] }), false);
  assert.equal(editability.isOnlyPostCancellation(current, current), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { PostDto } from '../lib/contracts/planner.ts';
const modulePath = '../lib/server/managed-post-view.ts';
const view = await import(modulePath).catch(() => null);
const post = { id: 'post', title: 'Scheduled', baseText: 'Allowed scheduled text', status: 'READY', editBlockedReason: null,
  mediaIds: ['private-media'], createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z',
  targets: [{ id: 'target', provider: 'max', socialAccountId: 'private-account', textOverride: 'private override', scheduledAt: '2030-01-02T07:00:00.000Z', publication: null }] } as PostDto;
test('managed schedule projection is explicit and excludes private media/account fields', () => {
  assert.ok(view?.managedPostView, 'managed schedule projection must exist');
  const result = view.managedPostView(post);
  assert.equal(result?.id, post.id);
  assert.equal(result?.targets[0].scheduledAt, post.targets[0].scheduledAt);
  assert.equal(JSON.stringify(result).includes('private-'), false);
});
test('private drafts never enter managed schedule even with a draft target date', () => {
  assert.ok(view?.managedPostView);
  assert.equal(view.managedPostView({ ...post, status: 'DRAFT' }), null);
});
test('unscheduled ready content stays private and published archived history remains visible', () => {
  assert.ok(view?.managedPostView);
  assert.equal(view.managedPostView({ ...post, targets: [{ ...post.targets[0], scheduledAt: null }] }), null);
  const published = { ...post, status: 'ARCHIVED', editBlockedReason: 'Published', targets: [{ ...post.targets[0], publication: { status: 'PUBLISHED', remoteId: 'remote', remoteUrl: 'https://example.test/published', error: 'private-diagnostic' } }] } as PostDto;
  assert.equal(view.managedPostView(published)?.targets[0].publication?.status, 'PUBLISHED');
  assert.equal(JSON.stringify(view.managedPostView(published)).includes('private-'), false);
});

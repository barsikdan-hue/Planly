import test from 'node:test';
import assert from 'node:assert/strict';
import { savePostInputSchema } from '../lib/contracts/planner.ts';

for (const status of ['DRAFT', 'READY'] as const) {
  test(`${status} accepts owned media references without requiring a caption`, () => {
    const parsed = savePostInputSchema.parse({
      baseText: ' \n ', status, mediaIds: ['photo'],
      targets: [{ provider: 'telegram' }, { provider: 'max' }],
    });
    assert.equal(parsed.baseText, '');
    assert.deepEqual(parsed.mediaIds, ['photo']);
    assert.deepEqual(parsed.targets.map(t => [t.provider, t.textOverride]), [['telegram', null], ['max', null]]);
  });

  test(`${status} rejects a post with neither text nor media`, () => {
    for (const baseText of ['', ' \n ']) {
      assert.equal(savePostInputSchema.safeParse({ baseText, status, targets: [], mediaIds: [] }).success, false);
    }
  });
}

test('media-only content still obeys media and target validation', () => {
  const input = { baseText: '', status: 'READY', targets: [{ provider: 'telegram' }], mediaIds: ['photo'] };
  for (const invalid of [
    { ...input, mediaIds: [''] },
    { ...input, mediaIds: ['photo', 'photo'] },
    { ...input, mediaIds: Array.from({ length: 21 }, (_, i) => String(i)) },
    { ...input, targets: [{ provider: 'telegram' }, { provider: 'telegram' }] },
    { ...input, baseText: 'x'.repeat(20_001) },
  ]) assert.equal(savePostInputSchema.safeParse(invalid).success, false);
});

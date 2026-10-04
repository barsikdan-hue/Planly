import test from 'node:test';
import assert from 'node:assert/strict';

async function contracts() {
  try {
    return await import('../lib/contracts/library.ts');
  } catch (error) {
    assert.fail(`Library contracts must exist: ${String(error)}`);
  }
}

for (const kind of ['create', 'update'] as const) {
  const base = kind === 'update' ? { status: 'READY' } : {};
  for (const [name, text, mediaIds] of [
    ['text-only', 'hello', []],
    ['media-only', ' \n ', ['photo']],
    ['text+media', 'hello', ['photo', 'video']],
  ] as const) {
    test(`${kind} accepts ${name} library content and trims title/text`, async () => {
      const { createLibraryItemInputSchema, updateLibraryItemInputSchema } = await contracts();
      const schema = kind === 'create' ? createLibraryItemInputSchema : updateLibraryItemInputSchema;
      const parsed = schema.parse({ ...base, title: '  Title  ', text: ` ${text} `, mediaIds: [...mediaIds] });
      assert.equal(parsed.title, 'Title');
      assert.equal(parsed.text, text.trim());
      assert.deepEqual(parsed.mediaIds, [...mediaIds]);
    });
  }

  for (const [name, invalid] of [
    ['empty content', { text: ' \n ', mediaIds: [] }],
    ['long title', { title: 'x'.repeat(201) }],
    ['long text', { text: 'x'.repeat(20_001) }],
    ['too many media', { mediaIds: Array.from({ length: 21 }, (_, i) => `media-${i}`) }],
    ['duplicate media', { mediaIds: ['photo', 'photo'] }],
    ['empty media identifier', { mediaIds: [''] }],
  ] as const) {
    test(`${kind} rejects ${name}`, async () => {
      const { createLibraryItemInputSchema, updateLibraryItemInputSchema } = await contracts();
      const schema = kind === 'create' ? createLibraryItemInputSchema : updateLibraryItemInputSchema;
      assert.equal(schema.safeParse(Object.assign({ ...base, text: 'hello', mediaIds: [] }, invalid)).success, false);
    });
  }

  test(`${kind} accepts exact content limits and optional/null title`, async () => {
    const { createLibraryItemInputSchema, updateLibraryItemInputSchema } = await contracts();
    const schema = kind === 'create' ? createLibraryItemInputSchema : updateLibraryItemInputSchema;
    for (const title of [undefined, null, 'x'.repeat(200)]) {
      assert.equal(schema.safeParse({ ...base, title, text: 'x'.repeat(20_000), mediaIds: Array.from({ length: 20 }, (_, i) => `media-${i}`) }).success, true);
    }
  });
}

test('create input cannot carry a client-controlled status', async () => {
  const { createLibraryItemInputSchema } = await contracts();
  const parsed = createLibraryItemInputSchema.parse({ text: 'hello', mediaIds: [], status: 'USED' });
  assert.equal('status' in parsed, false);
});

test('update accepts READY/ARCHIVED but rejects USED and missing status', async () => {
  const { updateLibraryItemInputSchema } = await contracts();
  for (const status of ['READY', 'ARCHIVED']) {
    assert.equal(updateLibraryItemInputSchema.safeParse({ text: 'hello', mediaIds: [], status }).success, true);
  }
  for (const status of ['USED', undefined]) {
    assert.equal(updateLibraryItemInputSchema.safeParse({ text: 'hello', mediaIds: [], status }).success, false);
  }
});

// Catches unkeyed dispatch and malformed acknowledgement admission in the actual client.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryItem as create, type PlanlyApiError } from '../lib/client/planly-api.ts';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const createItem = create as (input: { text: string; mediaIds: string[] }, key?: string) => ReturnType<typeof create>;
const input = { text: 'Original', mediaIds: ['b','a'] }, key = 'c0600000-0000-4000-8000-000000000001';
test('Library client sends explicit identity without changing ordered payload', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/library-items'); assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('idempotency-key'), key);
    assert.deepEqual(JSON.parse(String(init?.body)), input);
    return Response.json({ id: 'ack' });
  };
  assert.equal((await createItem(input, key)).id, 'ack');
});
test('Library missing or malformed identity fails before fetch', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ id: 'ack' }); };
  for (const value of [undefined, '', 'bad']) await assert.rejects(() => createItem(input, value));
  assert.equal(calls, 0);
});
test('Library malformed acknowledgement is unknown outcome; stable conflict body survives', async () => {
  for (const body of [null, {}, { id: '' }, { id: ' ' }, { id: 42 }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(() => createItem(input, key), (error: PlanlyApiError) => error.status === 502);
  }
  for (const [status, code] of [[409, 'LIBRARY_CREATION_KEY_CONFLICT'], [410, 'LIBRARY_CREATION_RESULT_DELETED']] as const) {
    globalThis.fetch = async () => Response.json({ error: 'Resolution required', code }, { status });
    await assert.rejects(() => createItem(input, key), (error: PlanlyApiError) => error.status === status && (error.body as { code: string }).code === code);
  }
});

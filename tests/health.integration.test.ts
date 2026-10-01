import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../db/index.ts';
import { GET } from '../app/api/health/route.ts';

after(closeDb);

test('health endpoint proves database connectivity without exposing configuration', async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  const text = await response.clone().text().catch(() => '');
  assert.doesNotMatch(text, /DATABASE_URL|postgresql:\/\/|password|secret/i);
});

import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { socialAccounts, users } from '../db/schema.ts';
import { ensureOwnerSocialAccounts, listSocialAccounts, setSocialAccountEnabled } from '../lib/server/social-accounts.ts';

const ownerA = 'social-owner-a';
const ownerB = 'social-owner-b';

beforeEach(async () => {
  const db = getDb();
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values([
    { id: ownerA, email: 'social-a@example.test', displayName: 'Owner A' },
    { id: ownerB, email: 'social-b@example.test', displayName: 'Owner B' },
  ]);
});
after(closeDb);

test('owner bootstrap creates exactly Telegram and MAX disconnected rows without credentials', async () => {
  await ensureOwnerSocialAccounts(ownerA);
  await ensureOwnerSocialAccounts(ownerA);
  const rows = await listSocialAccounts(ownerA);
  assert.deepEqual(rows.map(x => x.provider).sort(), ['max', 'telegram']);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(x => x.connectionStatus === 'DISCONNECTED'));
  assert.ok(rows.every(x => x.enabled === false));
});

test('another owner cannot toggle a guessed social account id', async () => {
  await ensureOwnerSocialAccounts(ownerA);
  await ensureOwnerSocialAccounts(ownerB);
  const [accountA] = await listSocialAccounts(ownerA);
  await assert.rejects(() => setSocialAccountEnabled(ownerB, accountA.id, true), /not found/i);
  const unchanged = (await listSocialAccounts(ownerA)).find(x => x.id === accountA.id);
  assert.equal(unchanged?.enabled, false);
});

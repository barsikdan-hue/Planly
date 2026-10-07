import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, getDb } from '../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, sessions, socialAccounts, users } from '../db/schema.ts';
import { ensureOwnerSocialAccounts, listSocialAccounts, setSocialAccountEnabled } from '../lib/server/social-accounts.ts';

const ownerA = 'social-owner-a';
const ownerB = 'social-owner-b';

beforeEach(async () => {
  const db = getDb();
  await db.delete(publications);
  await db.delete(postMedia);
  await db.delete(postTargets);
  await db.delete(posts);
  await db.delete(mediaAssets);
  await db.delete(sessions);
  await db.delete(socialAccounts);
  await db.delete(users);
  await db.insert(users).values([
    { id: ownerA, email: 'social-a@example.test', displayName: 'Owner A' },
    { id: ownerB, email: 'social-b@example.test', displayName: 'Owner B' },
  ]);
});
after(closeDb);

test('owner bootstrap creates exactly Telegram, MAX and VK disconnected rows without credentials', async () => {
  await ensureOwnerSocialAccounts(ownerA);
  await ensureOwnerSocialAccounts(ownerA);
  const rows = await listSocialAccounts(ownerA);
  assert.deepEqual(rows.map(x => x.provider).sort(), ['max', 'telegram', 'vk']);
  assert.equal(rows.length, 3);
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

test('MAX owner connection validates remote bot and chat before persisting canonical destination', async()=>{
 const {connectTelegramAccount}=await import('../lib/server/social-accounts.ts');
 await ensureOwnerSocialAccounts(ownerA);const account=(await listSocialAccounts(ownerA)).find(x=>x.provider==='max')!;
 const original=globalThis.fetch;const previous=process.env.MAX_BOT_TOKEN;process.env.MAX_BOT_TOKEN='MAX_test_only';let calls=0;
 globalThis.fetch=async url=>{calls++;const path=new URL(String(url)).pathname;return Response.json(path==='/me'?{user_id:7,is_bot:true,username:'test_bot'}:path.endsWith('/members/me')?{user_id:7,is_bot:true,is_admin:true,permissions:['write']}:{chat_id:-12345,type:'chat',status:'active',title:'MAX test'});};
 try{
  const result=await connectTelegramAccount(ownerA,account.id,'-12345');
  assert.ok(!('ok' in result));if(!('ok' in result)){assert.equal(result.connectionStatus,'CONNECTED');assert.equal(result.providerAccountId,'-12345');}
  assert.equal(calls,3);await assert.rejects(()=>connectTelegramAccount(ownerB,account.id,'-12345'),/not found/i);assert.equal(calls,3);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.MAX_BOT_TOKEN;else process.env.MAX_BOT_TOKEN=previous;}
});

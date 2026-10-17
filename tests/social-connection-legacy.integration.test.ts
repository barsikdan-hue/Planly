import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../db/index.ts';
import { users, socialAccounts } from '../db/schema.ts';
import { connectSocialAccount, ensureOwnerSocialAccounts } from '../lib/server/social-accounts.ts';

after(closeDb);
test('active USER cannot acquire enabled destination through bot-only legacy connect', async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, 'e2-bot-only'));
  await db.insert(users).values({ id:'e2-bot-only', email:'e2-bot-only@example.test', displayName:'Test user', authInitialized:true, accessState:'ACTIVE' });
  await ensureOwnerSocialAccounts('e2-bot-only');
  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.userId,'e2-bot-only'));
  const original=globalThis.fetch;
  process.env.MAX_BOT_TOKEN='MAX_TEST_ONLY_secret'; process.env.TELEGRAM_BOT_TOKEN='123456:TEST_only_never_real_secret';
  globalThis.fetch=async url=>{
    const path=new URL(String(url)).pathname;
    if(path.startsWith('/bot')) return Response.json({ok:true,result:path.endsWith('/getMe')?{id:123456,is_bot:true}:path.endsWith('/getChat')?{id:-12345,type:'channel',title:'Test'}:{user:{id:123456,is_bot:true},status:'administrator',can_post_messages:true}});
    return Response.json(path==='/me'?{user_id:7,is_bot:true}:path.endsWith('/members/me')?{user_id:7,is_bot:true,is_admin:true,permissions:['write']}:{chat_id:-12345,type:'chat',status:'active',title:'Test'});
  };
  try {
    const result=await connectSocialAccount('e2-bot-only',account.id,'-12345');
    assert.equal('ok' in result && result.ok===false,true,'bot ownership is not proof of this human permission');
    const [row]=await db.select().from(socialAccounts).where(eq(socialAccounts.id,account.id));
    assert.equal(row.enabled,false); assert.equal(row.providerAccountId,null);
  } finally { globalThis.fetch=original; await db.delete(users).where(eq(users.id,'e2-bot-only')); }
});

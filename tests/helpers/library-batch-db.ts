import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {getDb,getPool} from '../../db/index.ts';
import {users,sessions,socialAccounts,socialBindings,libraryItems,libraryItemMedia,mediaAssets,posts,postTargets,publications,libraryBatchConsentOperations} from '../../db/schema.ts';
import {sessionTokenHash} from '../../lib/server/auth/session.ts';
import {socialConnectionConfig} from '../../lib/server/social-connections/config.ts';
export const owner='batch-user',other='batch-other',admin='batch-admin',configured='batch-owner';
export const now=new Date('2029-12-31T00:00:00Z');
export const settings={startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[1,2,3,4,5,6,7],times:['10:00','18:00']};
export const options={now:()=>now,mirrorQueue:async()=>undefined,storage:{signedGetUrl:async(key:string)=>`https://private.example.test/${key}`}};
export const token=(who=owner)=>`synthetic-batch-session-${who}`;
export const input={sourceIds:['source-a','source-b'],accountIds:[`${owner}-TELEGRAM`,`${owner}-MAX`],settings};
export async function addSession(who=owner,raw=token(who),expires=new Date('2031-01-01')) {await getDb().insert(sessions).values({id:randomUUID(),userId:who,tokenHash:sessionTokenHash(raw),sessionVersion:1,expiresAt:expires});return raw;}
export async function seedBatchFixture(){
 const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('/planly_test'))throw new Error('Disposable DB required');
 process.env.TELEGRAM_BOT_TOKEN='123456:synthetic_fixture_token_only_12345';process.env.MAX_BOT_TOKEN='synthetic_fixture_token_only_12345';process.env.TELEGRAM_MINI_APP_URL='https://t.me/fixture_bot';process.env.MAX_MINI_APP_URL='https://max.ru/fixture_bot';
 const db=getDb();await db.delete(users);
 for(const who of [owner,other,admin,configured]){
 await db.insert(users).values({id:who,email:who===configured?process.env.OWNER_EMAIL!:`${who}@example.test`,displayName:who,role:who===admin?'ADMIN':'USER',accessState:'ACTIVE',authInitialized:true,sessionVersion:1});await addSession(who);
 for(const provider of ['TELEGRAM','MAX'] as const){const id=`${who}-${provider}`,destination=`-${100+ [owner,other,admin,configured].indexOf(who)*2+(provider==='MAX'?1:0)}`;
 await db.insert(socialAccounts).values({id,userId:who,provider,providerAccountId:destination,displayName:provider,enabled:true,connectionStatus:'CONNECTED',bindingRevision:1});
 await db.insert(socialBindings).values({accountId:id,userId:who,provider,destinationId:destination,humanId:'123',botId:'456',sessionVersion:1,revision:1,configRevision:socialConnectionConfig(provider).revision,checkedAt:now,updatedAt:now});}
 }
 for(const id of input.sourceIds)await db.insert(libraryItems).values({id,userId:owner,title:id,bodyText:`Text ${id}`,status:'READY',createdAt:now,updatedAt:now});
 await db.insert(mediaAssets).values({id:'batch-media',userId:owner,storageKey:'batch-media',originalName:'picture.png',mimeType:'image/png',byteSize:100,checksum:'fixture',width:100,height:100,updatedAt:now});
 await db.insert(libraryItemMedia).values({libraryItemId:'source-a',mediaId:'batch-media',position:0});
}
export async function counts(){const db=getDb();return {posts:(await db.select().from(posts)).length,targets:(await db.select().from(postTargets)).length,publications:(await db.select().from(publications)).length,receipts:(await db.select().from(libraryBatchConsentOperations)).length};}
export async function waitForBlocked(clientPid:number){const deadline=Date.now()+5000;while(Date.now()<deadline){const r=await getPool().query("select 1 from pg_stat_activity where wait_event_type='Lock' and $1=any(pg_blocking_pids(pid))",[clientPid]);if(r.rowCount)return;await new Promise(r=>setTimeout(r,10));}throw new Error('Expected native lock wait');}
export async function blocker(sql:string,args:unknown[]){const c=await getPool().connect();await c.query('BEGIN');await c.query(sql,args);const r=await c.query('select pg_backend_pid() pid');return {client:c,pid:r.rows[0].pid,release:async()=>{await c.query('COMMIT');c.release();}};}
export async function removeSession(who=owner){await getDb().delete(sessions).where(eq(sessions.userId,who));}

// Native advisory barriers stay in test-owned PostgreSQL objects, never production hooks.
export async function pauseBatchWrite(table:'posts'|'library_batch_consent_operations',event:'INSERT'|'UPDATE'='INSERT'){
 const c=await getPool().connect(),key=781934;
 await c.query('select pg_advisory_lock($1)',[key]);
 await c.query(`CREATE FUNCTION batch_test_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='batch-user' THEN PERFORM pg_advisory_xact_lock(781934); END IF; RETURN NEW; END $$`);
 await c.query(`CREATE TRIGGER batch_test_pause BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION batch_test_pause()`);
 const pid=(await c.query('select pg_backend_pid() pid')).rows[0].pid;
 return {client:c,pid,unlock:()=>c.query('select pg_advisory_unlock($1)',[key]),close:async()=>{await c.query('select pg_advisory_unlock($1)',[key]);await c.query(`DROP TRIGGER IF EXISTS batch_test_pause ON ${table}`);await c.query('DROP FUNCTION IF EXISTS batch_test_pause()');c.release();}};
}
export async function waitUntil(check:()=>Promise<boolean>){const deadline=Date.now()+5000;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Expected native state transition');}

import test,{beforeEach,after,mock} from 'node:test';
import {Client} from 'pg';
import {sessionTokenHash} from '../lib/server/auth/session.ts';
import {updateLibraryItem,deleteLibraryItem} from '../lib/server/library-items.ts';
import {deleteMediaAsset} from '../lib/server/media.ts';
import {createSocialConnectionLifecycle} from '../lib/server/social-connections/lifecycle.ts';
import {setUserAccessState} from '../lib/server/auth/access.ts';
import {previewSchedulingPlan} from '../lib/server/scheduling-plan-preview.ts';
import {commitSchedulingPlan} from '../lib/server/scheduling-plan-commit.ts';
import {createPost,updatePost,listPlannerPosts} from '../lib/server/posts.ts';
import {processPublication} from '../lib/server/scheduler/processor.ts';
import {startPublicationWorker} from '../lib/server/scheduler/worker.ts';
import {getPublicationQueue,ensurePublicationJob,closePublicationQueue} from '../lib/server/scheduler/queue.ts';
import {closeRedisConnection} from '../lib/server/scheduler/redis.ts';
import {reconcileScheduledJobs,applyPublicationQueueChanges} from '../lib/server/scheduler/reconcile.ts';
import type {PublicationQueueChange} from '../lib/server/publications.ts';
import type {ConnectorResolver} from '../lib/server/connectors/types.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,inArray} from 'drizzle-orm';
import {getDb,getPool,closeDb} from '../db/index.ts';
import {users,sessions,libraryItems,socialAccounts,posts,publications,mediaAssets,libraryBatchConsentOperations} from '../db/schema.ts';
import {owner,other,admin,configured,now,options,token,input,seedBatchFixture,counts,addSession,blocker,waitForBlocked,removeSession,pauseBatchWrite,waitUntil} from './helpers/library-batch-db.ts';
import * as api from '../lib/server/library-batch.ts';
function service(){return api;}
beforeEach(async()=>{await seedBatchFixture();await getPublicationQueue().obliterate({force:true});});after(async()=>{await getDb().delete(users).where(inArray(users.id,[owner,other,admin,configured]));await getPublicationQueue().obliterate({force:true});await closePublicationQueue();await closeRedisConnection();await closeDb();});
async function descriptor(){const preview=await service().previewLibraryBatch(token(),input,options);assert.ok(preview.complete);return {operationId:randomUUID(),...preview.descriptor};}
async function request(){const value=await descriptor();return {operationId:value.operationId,intent:value.intent,snapshotFingerprint:value.snapshotFingerprint,previewProof:value.previewProof};}
const code=(expected:string)=>(error:unknown)=>!!error&&typeof error==='object'&&'code'in error&&error.code===expected;
test('preview writes nothing; one consent atomically creates two Posts and four durable publications',async()=>{
 const req=await request();assert.deepEqual(await counts(),{posts:0,targets:0,publications:0,receipts:0});
 const result=await service().commitLibraryBatch(token(),req,options);assert.equal(result.replayed,false);assert.equal(result.receipt.rows.length,2);assert.deepEqual(await counts(),{posts:2,targets:4,publications:4,receipts:1});
 for(const p of await getDb().select().from(posts)){assert.equal(p.creationKey,null);assert.equal(p.creationInputHash,null);}
 for(const p of await getDb().select().from(publications)){assert.equal(p.socialBindingRevision,1);assert.ok(p.socialBindingDestinationId);}
});
test('invalid second source rolls back the entire consent',async()=>{const req=await request();await getDb().update(libraryItems).set({bodyText:'changed'}).where(eq(libraryItems.id,'source-b'));await assert.rejects(service().commitLibraryBatch(token(),req,options),code('BATCH_PREVIEW_STALE'));assert.deepEqual(await counts(),{posts:0,targets:0,publications:0,receipts:0});});
test('cross USER and ADMIN foreign IDs are unavailable; fresh ADMIN and configured OWNER denied',async()=>{
 await assert.rejects(service().previewLibraryBatch(token(other),input,options),code('BATCH_UNAVAILABLE'));
 for(const who of [admin,configured]){assert.equal(await service().canPreviewLibraryBatch(token(who),options),false);await assert.rejects(service().previewLibraryBatch(token(who),input,options),code('BATCH_FORBIDDEN'));}
 const req=await request();await assert.rejects(service().commitLibraryBatch(token(other),req,options));await assert.rejects(service().readLibraryBatchOperation(token(other),req.operationId,options),code('BATCH_RESULT_NOT_FOUND'));
});
test('same concurrent operation replays identical IDs; changed frozen intent conflicts',async()=>{const req=await request();const results=await Promise.all([service().commitLibraryBatch(token(),req,options),service().commitLibraryBatch(token(),req,options)]);assert.deepEqual(results[0].receipt,results[1].receipt);assert.equal(results.filter(r=>r.replayed).length,1);const changed=structuredClone(req);changed.intent.rows.reverse();await assert.rejects(service().commitLibraryBatch(token(),changed,options),code('BATCH_OPERATION_CONFLICT'));});
test('different concurrent keys cannot convert a source twice',async()=>{const req=await request();const results=await Promise.allSettled([service().commitLibraryBatch(token(),req,options),service().commitLibraryBatch(token(),{...req,operationId:randomUUID()},options)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await counts(),{posts:2,targets:4,publications:4,receipts:1});});
test('historical replay survives USED, new session, role/binding changes, proof expiry and mirror failure',async()=>{const req=await request();let mirrors=0;const saved=await service().commitLibraryBatch(token(),req,{...options,mirrorQueue:async()=>{mirrors++;throw new Error('synthetic mirror loss');}});await removeSession();const fresh=await addSession(owner,'new-session');await getDb().update(users).set({role:'ADMIN'}).where(eq(users.id,owner));await getDb().update(socialAccounts).set({enabled:false,bindingRevision:2}).where(eq(socialAccounts.userId,owner));const replay=await service().commitLibraryBatch(fresh,req,{...options,now:()=>new Date(now.getTime()+700000),mirrorQueue:async()=>{mirrors++;}});assert.deepEqual(saved.receipt,replay.receipt);assert.equal(replay.replayed,true);assert.equal(mirrors,1);assert.deepEqual((await service().readLibraryBatchOperation(fresh,req.operationId,options)).receipt,saved.receipt);const [stored]=await getDb().select().from(libraryBatchConsentOperations);assert.deepEqual(stored.canonicalIntent,req.intent);});
test('deleted result is terminal 410 and never recreated',async()=>{const req=await request();const saved=await service().commitLibraryBatch(token(),req,options);await getDb().delete(posts).where(eq(posts.id,saved.receipt.rows[0].postId));await assert.rejects(service().commitLibraryBatch(token(),req,options),code('BATCH_RESULT_DELETED'));assert.equal((await counts()).posts,1);assert.equal((await counts()).receipts,1);});
for(const mutation of ['account','media','slot','proof'] as const)test(`fresh ${mutation} change refuses without replacement slots`,async()=>{const req=await request();if(mutation==='account')await getDb().update(socialAccounts).set({enabled:false}).where(eq(socialAccounts.id,input.accountIds[0]));if(mutation==='media')await getDb().update(mediaAssets).set({checksum:'changed'}).where(eq(mediaAssets.id,'batch-media'));if(mutation==='slot')req.intent.rows[1].targets.forEach((t:{scheduledAt:string})=>{t.scheduledAt=req.intent.rows[0].targets[0].scheduledAt;});const opts=mutation==='proof'?{...options,now:()=>new Date(now.getTime()+600001)}:options;await assert.rejects(service().commitLibraryBatch(token(),req,opts));assert.equal((await counts()).posts,0);});
for(const lock of ['owner','source'] as const)test(`expiry during ${lock} lock wait denies admission`,async()=>{const req=await request();let clock=now;const held=await blocker(lock==='owner'?'select id from users where id=$1 for update':'select id from library_items where id=$1 for update',[lock==='owner'?owner:'source-a']);const pending=service().commitLibraryBatch(token(),req,{...options,now:()=>clock});const rejected=assert.rejects(pending,code('BATCH_UNAUTHORIZED'));await waitForBlocked(held.pid);clock=new Date('2032-01-01');await held.release();await rejected;assert.equal((await counts()).posts,0);});
test('logout while admission waits on owner is detected independently from initial session lookup',async()=>{const req=await request();const held=await blocker('select id from users where id=$1 for update',[owner]);const pending=service().commitLibraryBatch(token(),req,options);const rejected=assert.rejects(pending,code('BATCH_UNAUTHORIZED'));await waitForBlocked(held.pid);await removeSession();await held.release();await rejected;assert.equal((await counts()).posts,0);});

test('real PostgreSQL COMMIT followed by lost acknowledgement returns uncertain and recovers original receipt',async()=>{
 const req=await request();const original=Client.prototype.query;let lost=false;
 const patched=mock.method(Client.prototype,'query',function(this:Client,...args:unknown[]){const query=args[0] as string|{text:string};const text=typeof query==='string'?query:query.text;const result=Reflect.apply(original,this,args);if(text.toLowerCase()==='commit'&&!lost){lost=true;return Promise.resolve(result).then(()=>{throw new Error('Synthetic lost COMMIT acknowledgement');});}return result;});
 try{await assert.rejects(service().commitLibraryBatch(token(),req,options),code('BATCH_RESULT_UNCERTAIN'));}finally{patched.mock.restore();}
 assert.equal(lost,true);assert.deepEqual(await counts(),{posts:2,targets:4,publications:4,receipts:1});const historical=await service().readLibraryBatchOperation(token(),req.operationId,options);const replay=await service().commitLibraryBatch(token(),req,options);assert.deepEqual(replay.receipt,historical.receipt);assert.equal(replay.replayed,true);
});
test('partial mirror then repeated reconciliation and concurrent ensure retain exact job identities and runAt',async()=>{
 const req=await request();const saved=await service().commitLibraryBatch(token(),req,{...options,mirrorQueue:async(changes:PublicationQueueChange[])=>{await applyPublicationQueueChanges(changes.slice(0,1));throw new Error('partial mirror');}});
 assert.equal((await getPublicationQueue().getJobs(['delayed','waiting','active'])).length,1);
 await reconcileScheduledJobs();await reconcileScheduledJobs();
 await Promise.all(saved.receipt.rows.flatMap(r=>r.targets).flatMap(t=>[ensurePublicationJob(t.publicationId,new Date(t.scheduledAt)),ensurePublicationJob(t.publicationId,new Date(t.scheduledAt))]));
 const jobs=await getPublicationQueue().getJobs(['delayed','waiting','active']);assert.equal(jobs.length,4);assert.equal(new Set(jobs.map(j=>j.id)).size,4);
 for(const target of saved.receipt.rows.flatMap(r=>r.targets)){const job=await getPublicationQueue().getJob(target.publicationId);assert.ok(job);assert.equal(job.timestamp+Number(job.opts.delay),Date.parse(target.scheduledAt));}
 assert.deepEqual(await counts(),{posts:2,targets:4,publications:4,receipts:1});
});
test('actual Worker startup/restart and periodic reconciliation restore future jobs after complete Redis queue loss',async()=>{
 const saved=await service().commitLibraryBatch(token(),await request(),options);let calls=0;const resolver:ConnectorResolver=provider=>({provider,async publish(){calls++;return {ok:true,remoteId:'mock'};}});
 let runtime=await startPublicationWorker(resolver,{reconcileIntervalMs:0});await runtime.worker.waitUntilReady();assert.equal((await getPublicationQueue().getJobs(['delayed'])).length,4);await runtime.close();
 await getPublicationQueue().obliterate({force:true});runtime=await startPublicationWorker(resolver,{reconcileIntervalMs:25});await runtime.worker.waitUntilReady();assert.equal((await getPublicationQueue().getJobs(['delayed'])).length,4);
 try{for(const target of saved.receipt.rows.flatMap(r=>r.targets)){const job=await getPublicationQueue().getJob(target.publicationId);await job?.remove();}await waitUntil(async()=> (await getPublicationQueue().getJobs(['delayed'])).length===4);assert.equal(calls,0);}finally{await runtime.close();}
});
test('whole queue loss never resurrects cancelled, AUTH or ambiguous rows',async()=>{
 const saved=await service().commitLibraryBatch(token(),await request(),options),targets=saved.receipt.rows.flatMap(r=>r.targets);
 await getDb().update(publications).set({status:'CANCELLED'}).where(eq(publications.id,targets[0].publicationId));
 await getDb().update(publications).set({status:'REQUIRES_RECONNECT',normalizedErrorType:'AUTH'}).where(eq(publications.id,targets[1].publicationId));
 await getDb().update(publications).set({status:'FAILED',providerErrorCode:'AMBIGUOUS_DELIVERY'}).where(eq(publications.id,targets[2].publicationId));
 await getPublicationQueue().obliterate({force:true});await reconcileScheduledJobs();await reconcileScheduledJobs();const jobs=await getPublicationQueue().getJobs(['delayed','waiting']);assert.deepEqual(jobs.map(j=>j.id),[targets[3].publicationId]);
});
for(const kind of ['commit','replay'] as const)for(const mutation of ['logout','revoke','block','expiry'] as const)test(`${kind} owner wait observes ${mutation} before any result`,async()=>{
 const req=await request();if(kind==='replay')await service().commitLibraryBatch(token(),req,options);
 const held=await blocker('select id from users where id=$1 for update',[owner]);let clock=now;
 const pending=service().commitLibraryBatch(token(),req,{...options,now:()=>clock});const rejected=assert.rejects(pending,code('BATCH_UNAUTHORIZED'));await waitForBlocked(held.pid);
 if(mutation==='logout')await removeSession();if(mutation==='revoke')await held.client.query('update users set session_version=session_version+1 where id=$1',[owner]);if(mutation==='block')await held.client.query("update users set access_state='BLOCKED' where id=$1",[owner]);if(mutation==='expiry')clock=new Date('2032-01-01');
 await held.release();await rejected;assert.equal((await counts()).receipts,kind==='replay'?1:0);
});
test('session lock serializes logout while fresh commit waits on source; logout cannot retroactively undo admitted receipt',async()=>{
 const req=await request(),held=await blocker('select id from library_items where id=$1 for update',['source-a']);
 const pending=service().commitLibraryBatch(token(),req,options);await waitForBlocked(held.pid);
 const committing=(await held.client.query('select pid from pg_stat_activity where $1=any(pg_blocking_pids(pid))',[held.pid])).rows[0].pid;
 const logout=removeSession();await waitForBlocked(committing);await held.release();await pending;await logout;
 await assert.rejects(service().readLibraryBatchOperation(token(),req.operationId,options),code('BATCH_UNAUTHORIZED'));assert.equal((await counts()).receipts,1);
});
test('callback exit expiry rolls back every insertion even after durable receipt INSERT',async()=>{
 const req=await request(),gate=await pauseBatchWrite('library_batch_consent_operations');let clock=now;
 const pending=service().commitLibraryBatch(token(),req,{...options,now:()=>clock});const rejected=assert.rejects(pending,code('BATCH_UNAUTHORIZED'));
 try{await waitForBlocked(gate.pid);clock=new Date('2032-01-01');await gate.unlock();await rejected;assert.deepEqual(await counts(),{posts:0,targets:0,publications:0,receipts:0});}finally{await gate.close();}
});
test('replay result SHARE lock wait rechecks expiry; source row is irrelevant to historical recovery',async()=>{
 const req=await request(),saved=await service().commitLibraryBatch(token(),req,options),held=await blocker('select id from posts where id=$1 for update',[saved.receipt.rows[0].postId]);let clock=now;
 const pending=service().commitLibraryBatch(token(),req,{...options,now:()=>clock}),rejected=assert.rejects(pending,code('BATCH_UNAUTHORIZED'));await waitForBlocked(held.pid);clock=new Date('2032-01-01');await held.release();await rejected;assert.equal((await counts()).receipts,1);
});
for(const kind of ['source','media','account'] as const)test(`native ${kind} mutation winning its row lock invalidates all admission`,async()=>{
 const req=await request(),table={source:'library_items',media:'media_assets',account:'social_accounts'}[kind],id={source:'source-b',media:'batch-media',account:input.accountIds[0]}[kind];
 const held=await blocker(`select id from ${table} where id=$1 for update`,[id]);const pending=service().commitLibraryBatch(token(),req,options),rejected=assert.rejects(pending);await waitForBlocked(held.pid);
 await held.client.query(kind==='source'?"update library_items set status='ARCHIVED' where id=$1":kind==='media'?"update media_assets set checksum='edited' where id=$1":'update social_accounts set enabled=false where id=$1',[id]);await held.release();await rejected;assert.equal((await counts()).posts,0);
});
test('opposite source/account selection orders do not deadlock or convert twice',async()=>{
 const first=await request(),secondPreview=await service().previewLibraryBatch(token(),{...input,sourceIds:[...input.sourceIds].reverse(),accountIds:[...input.accountIds].reverse()},options);
 assert.ok(secondPreview.complete);const {intent,snapshotFingerprint,previewProof}=secondPreview.descriptor;const descriptor={intent,snapshotFingerprint,previewProof};const results=await Promise.allSettled([service().commitLibraryBatch(token(),first,options),service().commitLibraryBatch(token(),{operationId:randomUUID(),...descriptor},options)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await counts()).posts,2);
});
test('legacy source conversion racing consent serializes through owner and cannot duplicate',async()=>{
 const req=await request();const legacy=createPost(owner,{title:'old',baseText:'Text source-a',status:'DRAFT',targets:[],mediaIds:[]},{...options,sourceLibraryItemId:'source-a'});
 const batch=service().commitLibraryBatch(token(),req,options);const results=await Promise.allSettled([legacy,batch]);assert.ok(results.some(r=>r.status==='fulfilled'));const rows=await getDb().select().from(posts);assert.equal(rows.filter(p=>p.sourceLibraryItemId==='source-a').length,1);if(results[1].status==='fulfilled')assert.equal(rows.length,2);else assert.equal(rows.length,1);
});
test('occupied accepted minute rejects entire batch without allocator fallback',async()=>{
 const req=await request();await createPost(owner,{baseText:'Other scheduled post',status:'READY',targets:[{provider:'telegram',textOverride:null,scheduledAt:req.intent.rows[0].targets[0].scheduledAt}],mediaIds:[]},options);
 await assert.rejects(service().commitLibraryBatch(token(),req,options),code('BATCH_SLOT_CONFLICT'));assert.equal((await counts()).posts,1);assert.equal((await counts()).receipts,0);
});
test('foreign attached media fails before signing; incomplete content/slots never issue proof',async()=>{
 await getDb().update(mediaAssets).set({userId:other}).where(eq(mediaAssets.id,'batch-media'));let signed=0;await assert.rejects(service().previewLibraryBatch(token(),input,{...options,storage:{signedGetUrl:async()=>{signed++;return 'x';}}}),code('BATCH_UNAVAILABLE'));assert.equal(signed,0);
 await getDb().update(mediaAssets).set({userId:owner}).where(eq(mediaAssets.id,'batch-media'));
 const limited=await service().previewLibraryBatch(token(),{...input,settings:{...input.settings,times:['10:00']}},options);assert.equal(limited.complete,false);assert.equal(limited.descriptor,null);
 await getDb().update(libraryItems).set({bodyText:'x'.repeat(5000)}).where(eq(libraryItems.id,'source-b'));const invalid=await service().previewLibraryBatch(token(),input,options);assert.equal(invalid.complete,false);assert.equal(invalid.rows[1].issue,'CONTENT_INVALID');
});
async function cancelInput(postId:string){const post=(await listPlannerPosts(owner)).find(p=>p.id===postId)!;return {title:post.title,baseText:post.baseText,status:'DRAFT' as const,mediaIds:post.mediaIds,targets:post.targets.map(t=>({provider:t.provider,textOverride:t.textOverride,scheduledAt:null}))};}
test('whole Post cancellation wins native publication locks before competing claim; stale enqueue cannot send',async()=>{
 const req=await request(),saved=await service().commitLibraryBatch(token(),req,options),row=saved.receipt.rows[1],gate=await pauseBatchWrite('posts','UPDATE');const change=await cancelInput(row.postId);let calls=0;
 const cancelled=updatePost(owner,row.postId,change,options);let delivery:ReturnType<typeof processPublication>|undefined;
 try{await waitForBlocked(gate.pid);const editorPid=(await gate.client.query('select pid from pg_stat_activity where $1=any(pg_blocking_pids(pid))',[gate.pid])).rows[0].pid;
 delivery=processPublication(row.targets[0].publicationId,provider=>({provider,async publish(){calls++;return {ok:true,remoteId:'mock'};}}));await waitForBlocked(editorPid);await gate.unlock();await cancelled;assert.equal((await delivery).status,'CANCELLED');await reconcileScheduledJobs();await ensurePublicationJob(row.targets[0].publicationId,new Date(row.targets[0].scheduledAt));await processPublication(row.targets[0].publicationId,provider=>({provider,async publish(){calls++;return {ok:true,remoteId:'mock'};}}));assert.equal(calls,0);
 }finally{await gate.unlock();await Promise.allSettled([cancelled,delivery].filter(Boolean));await gate.close();}
});
test('claim wins before cancellation and partial published Post cannot cancel its other target',async()=>{
 const saved=await service().commitLibraryBatch(token(),await request(),options),row=saved.receipt.rows[1],change=await cancelInput(row.postId);let release!:()=>void,entered!:()=>void,calls=0;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
 const delivered=processPublication(row.targets[0].publicationId,provider=>({provider,async publish(){calls++;entered();await gate;return {ok:true,remoteId:'mock'};}}));await ready;
 try{await assert.rejects(updatePost(owner,row.postId,change,options),error=>error instanceof Error&&error.name==='PostEditConflictError');}finally{release();await delivered;}
 await assert.rejects(updatePost(owner,row.postId,change,options),error=>error instanceof Error&&error.name==='PostEditConflictError');assert.equal(calls,1);
 const history=await getDb().select().from(publications).where(eq(publications.postId,row.postId));assert.deepEqual(history.map(p=>p.status).sort(),['PUBLISHED','SCHEDULED']);await processPublication(row.targets[0].publicationId,provider=>({provider,async publish(){calls++;return {ok:true,remoteId:'mock'};}}));assert.equal(calls,1);
});


test('corrupt foreign Post linked to own Library source is unavailable and never projected',async()=>{
 await getDb().insert(posts).values({id:'foreign-linked-secret',userId:other,sourceLibraryItemId:'source-a',baseText:'private'});
 await assert.rejects(service().previewLibraryBatch(token(),input,options),code('BATCH_UNAVAILABLE'));
});
test('receipt refuses corrupted publication binding inserted by native test trigger and rolls back all parents',async()=>{
 const req=await request(),pool=getPool();
 await pool.query("CREATE FUNCTION batch_corrupt_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.social_binding_revision=999; RETURN NEW; END $$");
 await pool.query('CREATE TRIGGER batch_corrupt_publication BEFORE INSERT ON publications FOR EACH ROW EXECUTE FUNCTION batch_corrupt_publication()');
 try{await assert.rejects(service().commitLibraryBatch(token(),req,options),code('BATCH_RESULT_UNCERTAIN'));assert.equal((await counts()).posts,0);assert.equal((await counts()).receipts,0);}finally{await pool.query('DROP TRIGGER batch_corrupt_publication ON publications');await pool.query('DROP FUNCTION batch_corrupt_publication()');}
});



test('historical recovery after block/restore and new session ignores obsolete binding epoch',async()=>{
 const req=await request(),saved=await service().commitLibraryBatch(token(),req,options);await setUserAccessState(owner,'BLOCKED');await setUserAccessState(owner,'ACTIVE');
 const [user]=await getDb().select().from(users).where(eq(users.id,owner));const raw='restored-session';await getDb().insert(sessions).values({id:randomUUID(),userId:owner,tokenHash:sessionTokenHash(raw),sessionVersion:user.sessionVersion,expiresAt:new Date('2031-01-01')});
 assert.deepEqual((await service().commitLibraryBatch(raw,req,options)).receipt,saved.receipt);
});
test('real Library edit winning source wait invalidates preview; later delete preserves historical receipt',async()=>{
 const req=await request(),held=await blocker('select id from library_items where id=$1 for update',['source-b']);
 const edited=updateLibraryItem(owner,'source-b',{title:'edited',text:'edited body',mediaIds:[],status:'READY'});await waitForBlocked(held.pid);
 const pending=service().commitLibraryBatch(token(),req,options),rejected=assert.rejects(pending,code('BATCH_PREVIEW_STALE'));await held.release();await edited;await rejected;
 const next=await request(),saved=await service().commitLibraryBatch(token(),next,options);await deleteLibraryItem(owner,'source-b');assert.deepEqual((await service().commitLibraryBatch(token(),next,options)).receipt,saved.receipt);
});
test('real connection pause and attached-media delete wait behind admission; accepted receipt survives',async()=>{
 const req=await request(),gate=await pauseBatchWrite('library_batch_consent_operations');const pending=service().commitLibraryBatch(token(),req,options);let pause:Promise<unknown>|undefined,remove:Promise<void>|undefined;
 try{await waitForBlocked(gate.pid);const committing=(await gate.client.query('select pid from pg_stat_activity where $1=any(pg_blocking_pids(pid))',[gate.pid])).rows[0].pid;
 pause=createSocialConnectionLifecycle({now:()=>now.getTime()}).pause(token(),input.accountIds[0],1);
 remove=deleteMediaAsset(owner,'batch-media',{...options.storage,put:async()=>{throw new Error('no IO');},delete:async()=>{throw new Error('no IO');}});const rejected=assert.rejects(remove,/attached/);await waitForBlocked(committing);await gate.unlock();const saved=await pending;await pause;await rejected;assert.deepEqual((await service().commitLibraryBatch(token(),req,options)).receipt,saved.receipt);
 }finally{await gate.unlock();await Promise.allSettled([pending,pause,remove].filter(Boolean));await gate.close();}
});
test('real connection release winning before admission rejects the frozen account',async()=>{
 const req=await request();await createSocialConnectionLifecycle({now:()=>now.getTime()}).release(token(),input.accountIds[0],1);await assert.rejects(service().commitLibraryBatch(token(),req,options),code('BATCH_ACCOUNT_UNAVAILABLE'));assert.equal((await counts()).posts,0);
});
test('Phase9 and Library batch competing for the exact minute admit only one plan',async()=>{
 const draft=await createPost(owner,{baseText:'phase9',status:'DRAFT',targets:[{provider:'telegram',textOverride:null,scheduledAt:null}],mediaIds:[]},options);
 const preview=await previewSchedulingPlan(owner,{postIds:[draft.id],settings:input.settings},options),req=await request();assert.equal(preview.complete,true);
 const phase9={operationId:randomUUID(),settings:input.settings,rows:preview.rows.map(r=>({postId:r.post.id,fingerprint:r.fingerprint!,scheduledAt:r.scheduledAt!,reviewed:true as const}))};
 const results=await Promise.allSettled([commitSchedulingPlan(owner,phase9,options),service().commitLibraryBatch(token(),req,options)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rows=await getDb().select().from(publications);assert.equal(rows.length,results[0].status==='fulfilled'?1:4);
});



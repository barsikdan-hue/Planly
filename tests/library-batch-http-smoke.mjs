import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {eq,inArray} from 'drizzle-orm';
import {startLibraryBatchRuntime} from './helpers/library-batch-http.mjs';
import {posts,postTargets,publications,libraryItems,libraryItemMedia,libraryBatchConsentOperations,users} from '../db/schema.ts';
import {createPost,updatePost} from '../lib/server/posts.ts';

export async function runLibraryBatchHttpSmoke(){
 const f=await startLibraryBatchRuntime(),{call,api,db,ids,a,b,admin,input}=f;
 const read=async(response,status)=>{assert.equal(response.status,status);assert.match(response.headers.get('cache-control')||'',/private.*no-store/);return response.json();};
 try{
  await read(await call('/preview'),401);assert.deepEqual(await read(await call('/preview',a),200),{eligible:true});assert.deepEqual(await read(await call('/preview',admin),200),{eligible:false});
  await read(await call('/preview',admin,'POST',{...input,sourceIds:[f.sources[0]],accountIds:f.accounts[0]}),403);
  await read(await call('/preview',b,'POST',input),404);await read(await call('/preview',admin,'POST',input),403);
  const unavailable=await read(await call('/preview',a,'POST',{...input,sourceIds:[f.negativeSource]}),200);assert.equal(unavailable.complete,false);assert.equal(unavailable.descriptor,null);assert.ok(unavailable.rows.some(r=>r.issue==='CONTENT_INVALID'));
  const preview=await read(await call('/preview',a,'POST',input),200);assert.equal(preview.complete,true);assert.equal((await db.select().from(posts).where(eq(posts.userId,ids[1]))).length,0);
  const withMedia=preview.rows.find(r=>r.item.mediaIds.length);assert.deepEqual(withMedia.item.mediaIds.map(id=>preview.media.find(m=>m.id===id).mimeType),['image/png','video/mp4']);
  for(const media of preview.media){const bytes=Buffer.from(await (await fetch(media.previewUrl)).arrayBuffer());assert.ok(bytes.length>0);if(media.mimeType==='video/mp4')assert.deepEqual(bytes,f.mp4);const unsigned=new URL(media.previewUrl);unsigned.search='';assert.equal((await fetch(unsigned)).status,403);for(const cookie of [b,admin]){const listed=await read(await api('/api/media',cookie),200);assert.ok(!JSON.stringify(listed).includes(media.id));assert.equal((await api(`/api/media/${media.id}`,cookie,'DELETE')).status,404);}}
  await db.insert(libraryItemMedia).values({libraryItemId:f.privateIds[1],mediaId:preview.media[0].id,position:0});
  const foreignRelation=await read(await call('/preview',b,'POST',{...input,sourceIds:[f.privateIds[1]],accountIds:f.accounts[2]}),404);assert.ok(!JSON.stringify(foreignRelation).includes('X-Amz'));await db.delete(libraryItemMedia).where(eq(libraryItemMedia.libraryItemId,f.privateIds[1]));
  const commit={operationId:randomUUID(),intent:preview.descriptor.intent,snapshotFingerprint:preview.descriptor.snapshotFingerprint,previewProof:preview.descriptor.previewProof};
  const occupant=await createPost(ids[1],{title:null,baseText:'Future fixture occupied slot',status:'READY',mediaIds:[],targets:[{provider:'telegram',textOverride:null,scheduledAt:commit.intent.rows[0].targets[0].scheduledAt}]});
  const rollback=await read(await call('/commit',a,'POST',commit),409);assert.equal(rollback.code,'BATCH_SLOT_CONFLICT');assert.equal(rollback.commitApplied,false);
  assert.equal((await db.select().from(posts).where(eq(posts.userId,ids[1]))).length,1);assert.equal((await db.select().from(libraryBatchConsentOperations).where(eq(libraryBatchConsentOperations.userId,ids[1]))).length,0);assert.ok((await db.select().from(libraryItems).where(inArray(libraryItems.id,input.sourceIds))).every(item=>item.status==='READY'));
  await updatePost(ids[1],occupant.id,{title:null,baseText:'Future fixture occupied slot',status:'DRAFT',mediaIds:[],targets:[{provider:'telegram',textOverride:null,scheduledAt:null}]});
  const accepted=await read(await call('/commit',a,'POST',commit),200);assert.equal(accepted.replayed,false);assert.equal(accepted.receipt.rows.length,2);assert.equal(accepted.receipt.rows.flatMap(r=>r.targets).length,4);
  for(const [extra,payload,status] of [[{origin:'https://evil.example.test'},commit,403],[{'x-planly-library-batch':'0'},commit,403],[{}, {...commit,unknown:true},422],[{}, {...commit,userId:ids[2]},403]]){const failure=await read(await call('/commit',a,'POST',payload,extra),status);assert.equal(failure.commitApplied,undefined);}
  const malformed=await fetch(f.base+'/api/library/batch-consent/commit',{method:'POST',headers:{cookie:a,origin:f.base,'x-planly-library-batch':'1','content-type':'application/json'},body:'{'});assert.equal((await read(malformed,400)).commitApplied,undefined);
  for(const cookie of [b,admin])assert.equal((await read(await call('/operations/'+commit.operationId,cookie),404)).commitApplied,undefined);
  const recovered=await read(await call('/operations/'+commit.operationId,a),200);assert.deepEqual(recovered.receipt,accepted.receipt);assert.equal((await read(await call('/commit',a,'POST',commit),200)).replayed,true);
  const ownPublications=await db.select().from(publications).where(eq(publications.userId,ids[1]));assert.equal(ownPublications.filter(p=>p.status==='SCHEDULED').length,4);assert.ok(ownPublications.every(p=>p.attemptCount===0&&p.providerRemoteId===null));
  assert.equal((await db.select().from(libraryBatchConsentOperations).where(eq(libraryBatchConsentOperations.userId,ids[1]))).length,1);assert.equal((await db.select().from(postTargets).where(inArray(postTargets.postId,accepted.receipt.rows.map(r=>r.postId)))).length,4);
  await db.update(users).set({role:'ADMIN'}).where(eq(users.id,ids[1]));assert.equal((await read(await call('/commit',a,'POST',commit),200)).replayed,true);
  await db.delete(posts).where(eq(posts.id,accepted.receipt.rows[0].postId));const gone=await read(await call('/operations/'+commit.operationId,a),410);assert.equal(gone.commitApplied,undefined);assert.deepEqual(gone.result.postIds,accepted.receipt.rows.map(r=>r.postId));
  assert.equal((await db.select().from(libraryItems).where(inArray(libraryItems.id,f.copied[1]))).filter(i=>i.status==='READY').length,2);
  console.log('PASS compiled Library batch: explicit consent, private ordered media, ownership, fresh rollback, immutable recovery, terminal deletion; provider IO 0');
 }finally{await f.cleanup();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await runLibraryBatchHttpSmoke();

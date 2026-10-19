// Real compiled Next/auth/storage/queue, disposable users only, no running worker.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,and,inArray} from 'drizzle-orm';
import {startLibraryBatchRuntime} from './helpers/library-batch-http.mjs';
import {libraryItems,posts,publications,sharedFeedDecisions} from '../db/schema.ts';

export async function runSharedFeedHttpSmoke(){
 const f=await startLibraryBatchRuntime(),{api,db,ids,a,b,admin}=f;
 const read=async(response,status)=>{assert.equal(response.status,status);assert.match(response.headers.get('cache-control')||'',/no-store/);return response.json();};
 const feed=async cookie=>(await read(await api('/api/shared-feed',cookie),200)).items;
 const post=async(cookie,id)=>(await read(await api('/api/posts',cookie),200)).find(row=>row.id===id);
 const decide=(cookie,input)=>api('/api/shared-feed/decisions',cookie,'POST',input);
 const decision=(item,kind='LIKE',time='2030-01-02T10:00:00.000Z')=>({operationId:randomUUID(),shareId:item.id,sourceRevision:item.updatedAt,decision:kind,...(kind==='LIKE'?{approval:{providers:['telegram','max'],scheduledAt:time,inputMethod:'gesture'}}:{})});
 try{
  await read(await api('/api/shared-feed'),401);
  // Exercise the existing editorial loading path via actual HTTP, not direct DB inserts.
  const form=new FormData();form.set('file',new File([f.media[1].bytes],'editorial-fixture.png',{type:'image/png'}));
  const uploaded=await read(await fetch(f.backend+'/api/media',{method:'POST',headers:{cookie:admin},body:form}),201);
  const text='Synthetic editorial upload — exact first line\nFull second line retained.';
  const createKey=randomUUID(),body={title:'Editorial API fixture',text,mediaIds:[uploaded.id]};
  const source=await read(await api('/api/library-items',admin,'POST',body,{'idempotency-key':createKey}),201);
  assert.equal((await read(await api('/api/library-items',admin,'POST',body,{'idempotency-key':createKey}),201)).id,source.id);
  await read(await api('/api/admin/shared-library/'+source.id,admin,'POST',{shared:true}),200);
  const item=(await feed(a)).find(row=>row.title===body.title);assert.ok(item);assert.equal(item.text,text);assert.equal(item.media.length,1);
  assert.equal((await feed(b)).find(row=>row.id===item.id).text,text);
  await read(await api('/api/admin/shared-library/'+source.id,a,'POST',{shared:false}),403);
  const before=(await db.select().from(posts).where(eq(posts.userId,ids[1]))).length;
  const input=decision(item),response=await read(await decide(a,input),201);
  assert.equal(response.replayed,false);assert.ok(response.receipt.postId&&response.receipt.personalItemId);
  const receipt=response.receipt;
  assert.equal((await db.select().from(posts).where(eq(posts.userId,ids[1]))).length,before+1);
  const duplicate=await Promise.all([decide(a,input),decide(a,input)]);
  for(const retry of duplicate)assert.deepEqual((await read(retry,201)).receipt,receipt);
  assert.equal((await db.select().from(posts).where(eq(posts.userId,ids[1]))).length,before+1);
  const lookup='/api/shared-feed/decisions/'+input.operationId;
  assert.deepEqual((await read(await api(lookup,a),200)).receipt,receipt);
  await read(await api(lookup,b),404);await read(await api(lookup,admin),404);
  assert.equal(await post(b,receipt.postId),undefined);assert.equal(await post(admin,receipt.postId),undefined);
  assert.ok(!(await feed(a)).some(row=>row.id===item.id));assert.ok((await feed(b)).some(row=>row.id===item.id));
  const reject=decision(item,'DISLIKE'),postCount=(await db.select().from(posts).where(eq(posts.userId,ids[2]))).length;
  const rejected=await read(await decide(b,reject),201);assert.equal(rejected.receipt.postId,null);assert.equal(rejected.receipt.personalItemId,null);
  assert.equal((await db.select().from(posts).where(eq(posts.userId,ids[2]))).length,postCount);assert.ok(!(await feed(b)).some(row=>row.id===item.id));
  const own=await post(a,receipt.postId);assert.equal(own.baseText,text);assert.equal(own.mediaIds.length,1);assert.notEqual(own.mediaIds[0],uploaded.id);
  const bootstrap=await read(await api('/api/bootstrap',a),200);assert.ok(bootstrap.posts.some(post=>post.id===receipt.postId));
  const privateAsset=bootstrap.media.find(asset=>asset.id===own.mediaIds[0]);assert.ok(privateAsset);assert.deepEqual(Buffer.from(await (await fetch(privateAsset.previewUrl)).arrayBuffer()),f.media[1].bytes);
  for(const cookie of [b,admin]){const other=await read(await api('/api/media',cookie),200);assert.ok(!JSON.stringify(other).includes(privateAsset.id));await read(await api('/api/media/'+privateAsset.id,cookie,'DELETE'),404);}
  // Removing/changing the shared original cannot rewrite approved private content.
  await read(await api('/api/admin/shared-library/'+source.id,admin,'POST',{shared:false}),200);
  await read(await api('/api/library-items/'+source.id,admin,'PATCH',{...body,text:'Changed original',status:'READY'}),200);
  assert.deepEqual((await read(await decide(a,input),201)).receipt,receipt);assert.equal((await post(a,receipt.postId)).baseText,text);
  const target=own.targets.find(target=>target.provider==='telegram');assert.ok(target.cancelApproval?.eligible);
  const preview=target.cancelApproval,cancel={expectedPublicationId:preview.expectedPublicationId,expectedPublicationUpdatedAt:preview.expectedPublicationUpdatedAt,expectedTargetUpdatedAt:preview.expectedTargetUpdatedAt,expectedBindingRevision:preview.expectedBindingRevision};
  await read(await fetch(`${f.base}/api/posts/${receipt.postId}/targets/${target.id}/cancel-approval`,{method:'POST',signal:AbortSignal.timeout(10000),headers:{cookie:a,'content-type':'application/json','X-Planly-Social-Connection':'1',origin:f.base},body:JSON.stringify(cancel)}),200);
  const after=await post(a,receipt.postId);assert.ok(after.targets.find(row=>row.provider==='telegram').approvalCancelledAt);assert.equal(after.targets.find(row=>row.provider==='max').approvalCancelledAt,null);
  const rows=await db.select().from(publications).where(and(eq(publications.userId,ids[1]),eq(publications.postId,receipt.postId)));
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.attemptCount===0&&row.providerRemoteId===null));
  assert.equal((await db.select().from(sharedFeedDecisions).where(inArray(sharedFeedDecisions.userId,ids))).length,2);
  assert.equal((await db.select().from(libraryItems).where(eq(libraryItems.id,receipt.personalItemId)))[0].status,'USED');
  console.log('PASS compiled Lentaro: ADMIN upload/create/share, independent A/B feed decisions, exact recovery, private media, calendar and per-network cancellation; provider IO 0');
 }finally{await f.cleanup();}
}
await runSharedFeedHttpSmoke();

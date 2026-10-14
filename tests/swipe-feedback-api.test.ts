import {eq} from 'drizzle-orm';
import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {getDb,closeDb} from '../db/index.ts';
import {users} from '../db/schema.ts';
import {createLibraryItem} from '../lib/server/library-items.ts';
import {createOwnerSession,SESSION_COOKIE_NAME} from '../lib/server/auth/session.ts';
import {revokeUserSessions} from '../lib/server/auth/access.ts';
import {PATCH} from '../app/api/library-items/[id]/route.ts';
import {GET} from '../app/api/swipe-feedback/route.ts';
import {GET as EXPORT} from '../app/api/swipe-feedback/export/route.ts';
import {patchLibraryItemInputSchema} from '../lib/contracts/library.ts';
const owner='feedback-api',other='feedback-api-other';
beforeEach(async()=>{await getDb().delete(users);await getDb().insert(users).values([owner,other].map(id=>({id,email:id===owner?process.env.OWNER_EMAIL!:id+'@example.test',displayName:id})));});
after(async()=>{await getDb().delete(users);await closeDb();});
async function headers(id=owner){return {cookie:`${SESSION_COOKIE_NAME}=${encodeURIComponent(await createOwnerSession(id))}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()};}
test('authenticated summary/export are private no-store and reject owner selectors after auth',async()=>{
 for(const route of [GET,EXPORT]){
  const noAuth=await route(new Request('http://localhost/api/swipe-feedback?ownerId=other'));assert.equal(noAuth.status,401);assert.equal(noAuth.headers.get('cache-control'),'private, no-store');
  const invalid=await route(new Request('http://localhost/api/swipe-feedback?ownerId=other',{headers:await headers()}));assert.equal(invalid.status,403);
  const response=await route(new Request('http://localhost/api/swipe-feedback',{headers:await headers()}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual((await response.json()).aggregate,{likes:0,dislikes:0,total:0,likeRatio:null});
 }
});
test('PATCH marked DISLIKE is durable keyed and owner isolated; malformed/full-update marker rejected',async()=>{
 const item=await createLibraryItem(owner,{text:'secret body',title:'secret title',mediaIds:[]});const h=await headers();
 const body={status:'ARCHIVED',expectedUpdatedAt:item.updatedAt,swipeReview:{inputMethod:'keyboard'}};
 const request=()=>new Request(`http://localhost/api/library-items/${item.id}`,{method:'PATCH',headers:h,body:JSON.stringify(body)});
 const context={params:Promise.resolve({id:item.id})};assert.equal((await PATCH(request(),context)).status,200);assert.equal((await PATCH(request(),context)).status,200);
 const snapshot=await (await EXPORT(new Request('http://localhost/api/swipe-feedback/export',{headers:h}))).json();assert.equal(snapshot.receipts.length,1);assert.equal(snapshot.current[0].inputMethod,'keyboard');assert.ok(!JSON.stringify(snapshot).includes('secret'));
 assert.equal(patchLibraryItemInputSchema.safeParse({status:'READY',text:'bypass',mediaIds:[],swipeReview:{inputMethod:'button'}}).success,false);
 assert.equal(patchLibraryItemInputSchema.safeParse({...body,text:'bypass',mediaIds:[]}).success,false);
 const changed=new Request('http://localhost/api/library-items/a',{method:'PATCH',headers:h,body:JSON.stringify({...body,swipeReview:{inputMethod:'button'}})});assert.equal((await PATCH(changed,context)).status,409);
 await getDb().update(users).set({email:'retired@example.test'}).where(eq(users.id,owner));await getDb().update(users).set({email:process.env.OWNER_EMAIL!}).where(eq(users.id,other));
 await revokeUserSessions(owner);
 const foreign=await (await EXPORT(new Request('http://localhost/api/swipe-feedback/export',{headers:await headers(other)}))).json();assert.equal(foreign.receipts.length,0);
 assert.equal((await EXPORT(new Request('http://localhost/api/swipe-feedback/export',{headers:h}))).status,401);
});

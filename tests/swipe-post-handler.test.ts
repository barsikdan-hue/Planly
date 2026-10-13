import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCreatePost } from '../lib/server/create-post-handler.ts';
import { ZodError } from 'zod';
const saved={id:'saved',title:null,baseText:'Body',status:'READY' as const,targets:[{id:'target',socialAccountId:'tg',provider:'telegram' as const,textOverride:null,scheduledAt:'2000-01-01T00:00:00Z'}],mediaIds:[],createdAt:'2000-01-01T00:00:00Z',updatedAt:'2000-01-01T00:00:00Z'};
test('executed POST marked original/replay never inline ticks; ordinary immediate still ticks',async()=>{
 for(const {marked,scheduledAt} of [{marked:true,scheduledAt:'2099-01-01T00:00:00Z'},{marked:true,scheduledAt:'2000-01-01T00:00:00Z'},{marked:false,scheduledAt:'2000-01-01T00:00:00Z'}]){
  let ticks=0,lists=0;const body={baseText:'Body',status:'READY',targets:[{provider:'telegram',scheduledAt}],mediaIds:[],...(marked?{sourceLibraryItemId:'source',sourceLibraryUpdatedAt:'2000-01-01T00:00:00Z',requireFreeSlot:true,swipeReview:{inputMethod:'button'}}:{})};
  const response=await handleCreatePost(new Request('http://planly.test/api/posts',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'11111111-1111-4111-8111-111111111111'},body:JSON.stringify(body)}),{
   requireOwner:async()=>({id:'owner'}),create:async(_owner,input,options)=>{assert.equal(options?.swipeReview?.inputMethod,marked?'button':undefined);assert.equal(input.status,'READY');return saved;},list:async()=>{lists++;return[saved];},tick:async()=>{ticks++;},
  });assert.equal(response.status,201);assert.equal(ticks,marked?0:1);assert.equal(lists,marked?0:1);
 }
});
test('handler identifies precreate marked validation but keeps arbitrary create errors unclassified',async()=>{
 const deps={requireOwner:async()=>({id:'owner'}),create:async()=>{throw new ZodError([{code:'custom',path:[],message:'Unknown after-create error'}]);},list:async()=>[],tick:async()=>undefined};
 const invalid=await handleCreatePost(new Request('http://planly.test/api/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({swipeReview:{inputMethod:'button'}})}),deps);
 assert.equal(invalid.status,422);assert.equal((await invalid.json()).code,'SWIPE_APPROVAL_INVALID');
 const unknown=await handleCreatePost(new Request('http://planly.test/api/posts',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'11111111-1111-4111-8111-111111111111'},body:JSON.stringify({baseText:'Body',status:'READY',targets:[{provider:'telegram',scheduledAt:'2099-01-01T00:00:00Z'}],mediaIds:[],sourceLibraryItemId:'source',sourceLibraryUpdatedAt:'2000-01-01T00:00:00Z',requireFreeSlot:true,swipeReview:{inputMethod:'button'}})}),deps);
 assert.equal(unknown.status,422);assert.equal((await unknown.json()).code,undefined);
});

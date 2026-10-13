import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSwipeApproval } from '../lib/client/swipe-planner.ts';
import { createPostSourceSchema } from '../lib/contracts/planner.ts';
import { creationInputHash } from '../lib/server/post-idempotency.ts';
const item = { id:'source', title:'Title', text:'Body', status:'READY' as const, mediaIds:[], sourcePostId:null, createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' };
test('new Swipe rejects draft and marks manual/next free-slot intent and method', () => {
  assert.throws(() => buildSwipeApproval(item,{mode:'draft',providers:[],scheduledAt:null}));
  for (const mode of ['manual','next'] as const) {
    const input = buildSwipeApproval(item,{mode,providers:['telegram'],scheduledAt:'2099-01-01T07:00:00Z',inputMethod:'keyboard'});
    assert.equal(input.requireFreeSlot,true);
    assert.deepEqual(input.swipeReview,{inputMethod:'keyboard'});
    assert.equal(input.status,'READY');
  }
});
test('marker requires source/revision/free=true and affects intent hash', () => {
  const context = {sourceLibraryItemId:item.id,sourceLibraryUpdatedAt:item.updatedAt,requireFreeSlot:true,swipeReview:{inputMethod:'button' as const}};
  assert.deepEqual(createPostSourceSchema.parse(context),context);
  for(const removed of ['sourceLibraryItemId','sourceLibraryUpdatedAt','requireFreeSlot']) {
    const invalid = {...context}; delete invalid[removed as keyof typeof invalid];
    assert.equal(createPostSourceSchema.safeParse(invalid).success,false);
  }
  const input=buildSwipeApproval(item,{mode:'next',providers:['telegram'],scheduledAt:'2099-01-01T07:00:00Z'});
  assert.notEqual(creationInputHash(input,item.id,context),creationInputHash(input,item.id,{...context,swipeReview:{inputMethod:'gesture'}}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const path='../lib/contracts/shared-feed.ts';
const contract=await import(path).catch(()=>null);
const base={operationId:randomUUID(),shareId:randomUUID(),sourceRevision:'2026-10-19T10:00:00.000Z'};
test('shared decision requires exact strict intent and per-card approval',()=>{
 assert.ok(contract?.sharedFeedDecisionInputSchema,'shared feed intent schema must exist');
 const parse=contract.sharedFeedDecisionInputSchema;
 assert.equal(parse.safeParse({...base,decision:'DISLIKE'}).success,true);
 const like={...base,decision:'LIKE',approval:{providers:['telegram','max'],scheduledAt:'2030-01-01T10:00:00.000Z',inputMethod:'gesture'}};
 assert.equal(parse.safeParse(like).success,true);
 for(const invalid of [{...base,decision:'LIKE'},{...like,decision:'DISLIKE'},{...like,userId:'other'}, {...like,approval:{...like.approval,providers:['telegram','telegram']}},{...like,approval:{...like.approval,providers:['vk']}},{...like,approval:{...like.approval,scheduledAt:'2030-01-01T10:00:01.000Z'}},{...like,approval:{...like.approval,extra:1}}])assert.equal(parse.safeParse(invalid).success,false);
});
test('receipt schema rejects partial and inconsistent durable results',()=>{
 assert.ok(contract?.sharedFeedDecisionReceiptSchema,'shared feed receipt schema must exist');
 const parse=contract.sharedFeedDecisionReceiptSchema;
 const receipt={...base,decision:'DISLIKE',personalItemId:null,postId:null,scheduledAt:null};
 assert.equal(parse.safeParse(receipt).success,true);
 assert.equal(parse.safeParse({...receipt,decision:'LIKE'}).success,false);
 assert.equal(parse.safeParse({...receipt,postId:'unexpected'}).success,false);
 assert.equal(parse.safeParse({...receipt,decision:'LIKE',personalItemId:randomUUID(),postId:randomUUID(),scheduledAt:'2030-01-01T10:00:00.000Z'}).success,true);
});

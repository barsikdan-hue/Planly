import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../lib/client/planly-api.ts';
test('batch transport uses private no-store requests, additive mutation header and no identity selector',async()=>{
 assert.equal(typeof api.loadLibraryBatchEligibility,'function');const original=globalThis.fetch,calls:{url:string;init?:RequestInit}[]=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({eligible:true});};
 try{await api.loadLibraryBatchEligibility();await api.previewLibraryBatchRequest({sourceIds:['one'],accountIds:['tg'],settings:{startDate:'2030-01-01',endDate:'2030-01-02',weekdays:[1],times:['10:00']}});await api.commitLibraryBatchRequest({} as never);await api.loadLibraryBatchOperation('11111111-1111-4111-8111-111111111111');
 assert.deepEqual(calls.map(c=>c.url),['/api/library/batch-consent/preview','/api/library/batch-consent/preview','/api/library/batch-consent/commit','/api/library/batch-consent/operations/11111111-1111-4111-8111-111111111111']);
 for(const call of calls)assert.equal(call.init?.cache,'no-store');for(const call of calls.slice(1,3)){assert.equal(new Headers(call.init?.headers).get('X-Planly-Library-Batch'),'1');assert.equal(new Headers(call.init?.headers).get('content-type'),'application/json');assert.equal(call.init?.method,'POST');assert.equal(String(call.init?.body).includes('ownerId'),false);}
 }finally{globalThis.fetch=original;}
});

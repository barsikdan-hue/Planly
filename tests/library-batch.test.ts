import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { getTableConfig } from 'drizzle-orm/pg-core';

const contracts = await import('../lib/contracts/library-batch.ts').catch(() => null);
const browser = await import('../lib/library-batch.ts').catch(() => null);
const hashes = await import('../lib/server/library-batch-hash.ts').catch(() => null);
const proofs = await import('../lib/server/library-batch-proof.ts').catch(() => null);
const schema = await import('../db/schema.ts');
const settings = {startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[2],times:['10:00','18:00']};
const target = {accountId:'tg',provider:'TELEGRAM' as const,destinationId:'-1001',scheduledAt:'2030-01-01T07:00:00Z'};
const row = {sourceId:'source-a',sourceRevision:'2029-12-01T00:00:00.123Z',contentHash:'a'.repeat(64),targets:[target]};
const intent = {contractVersion:1 as const,kind:'LIBRARY_BATCH_FUTURE' as const,settings,rows:[row]};
const operationId = 'a96f4792-3dc2-4d72-b3fb-74bdbe6eff91';

test('strict preview rejects identity selectors, duplicate IDs and all finite bounds',()=>{
  assert.ok(contracts,'library batch contracts exist');
  const input={sourceIds:['a'],accountIds:['tg'],settings};
  assert.ok(contracts.libraryBatchPreviewInputSchema.safeParse(input).success);
  for(const patch of [{userId:'foreign'},{sourceIds:[]},{sourceIds:['a','a']},{sourceIds:Array.from({length:21},(_,i)=>String(i))},{accountIds:[]},{accountIds:['tg','tg']},{accountIds:['a','b','c']},{sourceIds:['x'.repeat(201)]}])
    assert.equal(contracts.libraryBatchPreviewInputSchema.safeParse({...input,...patch}).success,false,JSON.stringify(patch));
  for(const patch of [{weekdays:[2,2]},{times:['10:00','10:00']},{endDate:'2030-02-01'},{startDate:'2030-02-30'},{extra:true}])
    assert.equal(contracts.libraryBatchPreviewInputSchema.safeParse({...input,settings:{...settings,...patch}}).success,false);
});

test('intent rejects unknown identity/state, duplicate sources/providers and inconsistent target sets',()=>{
  assert.ok(contracts);
  assert.ok(contracts.libraryBatchIntentSchema.safeParse(intent).success);
  for(const patch of [{ownerId:'a'},{sessionVersion:1},{contractVersion:2},{kind:'NOW'},{rows:[]},{rows:[row,row]},{rows:[{...row,userId:'a'}]},
    {rows:[{...row,targets:[target,{...target,accountId:'other'}]}]}, {rows:[{...row,targets:[{...target,provider:'VK'}]}]},
    {rows:[row,{...row,sourceId:'b',targets:[{...target,accountId:'other',scheduledAt:'2030-01-01T15:00:00Z'}]}]},
    {rows:[{...row,targets:[{...target,scheduledAt:'2030-01-01T07:00:00.0001Z'}]}]},
    {rows:[{...row,sourceRevision:'2029-12-01T00:00:00.1234Z'}]},
    {rows:[{...row,targets:[{...target,scheduledAt:'2030-01-01T07:00:01Z'}]}]}])
    assert.equal(contracts.libraryBatchIntentSchema.safeParse({...intent,...patch}).success,false,JSON.stringify(patch));
});

test('canonical intent fixes key/settings/target order and UTC without changing selection order or strings',()=>{
  assert.ok(browser);
  const max={accountId:'max',provider:'MAX' as const,destinationId:'channel',scheduledAt:'2030-01-01T10:00:00+03:00'};
  const a={...intent,rows:[{...row,targets:[max,target]}]};
  const b={...intent,settings:{...settings,times:['18:00','10:00']},rows:[{...row,sourceRevision:'2029-12-01T03:00:00.123+03:00',targets:[target,max]}]};
  assert.deepEqual(browser.canonicalLibraryBatchIntent(a),browser.canonicalLibraryBatchIntent(b));
  assert.deepEqual(Object.keys(browser.canonicalLibraryBatchIntent(a)),['contractVersion','kind','settings','rows']);
  assert.equal(browser.canonicalLibraryBatchIntent(a).rows[0].targets[0].scheduledAt,'2030-01-01T07:00:00.000Z');
  const pair={...intent,rows:[row,{...row,sourceId:'b',targets:[{...target,scheduledAt:'2030-01-01T15:00:00Z'}]}]};
  assert.notDeepEqual(browser.canonicalLibraryBatchIntent(pair),browser.canonicalLibraryBatchIntent({...pair,rows:[...pair.rows].reverse()}));
});

test('request digest is purpose-separated frozen intent and changes for accepted version/destination/time',()=>{
  assert.ok(hashes);assert.ok(browser);
  const canonical='{"contractVersion":1,"kind":"LIBRARY_BATCH_FUTURE","settings":{"startDate":"2030-01-01","endDate":"2030-01-01","weekdays":[2],"times":["10:00","18:00"]},"rows":[{"sourceId":"source-a","sourceRevision":"2029-12-01T00:00:00.123Z","contentHash":"'+ 'a'.repeat(64)+'","targets":[{"accountId":"tg","provider":"TELEGRAM","destinationId":"-1001","scheduledAt":"2030-01-01T07:00:00.000Z"}]}]}';
  assert.equal(hashes.libraryBatchRequestHash(intent),createHash('sha256').update('planly.library-batch.intent.v1\n'+canonical).digest('hex'));
  for(const changed of [{...row,sourceRevision:'2029-12-01T00:00:00.124Z'},{...row,contentHash:'b'.repeat(64)},{...row,targets:[{...target,destinationId:'-1002'}]},{...row,targets:[{...target,scheduledAt:'2030-01-01T15:00:00Z'}]}])
    assert.notEqual(hashes.libraryBatchRequestHash({...intent,rows:[changed]}),hashes.libraryBatchRequestHash(intent));
});

test('content digest preserves exact text and ordered metadata, independently from display URLs',()=>{
  assert.ok(hashes);
  const media={id:'m',position:0,checksum:'checksum',mimeType:'image/png',byteSize:10,width:null,height:null,durationMs:null};
  const input={title:null,baseText:'  Текст\n',media:[media]};
  assert.equal(hashes.libraryBatchContentHash(input),createHash('sha256').update(JSON.stringify(input)).digest('hex'));
  for(const patch of [{title:''},{baseText:'Текст'},{media:[{...media,checksum:'changed'}]},{media:[{...media,width:1}]}]) assert.notEqual(hashes.libraryBatchContentHash({...input,...patch}),hashes.libraryBatchContentHash(input));
});

test('snapshot digest canonicalizes database dates/order and includes changing eligibility separately from intent',()=>{
  assert.ok(hashes);
  const snapshot={contractVersion:1 as const,owner:{id:'owner',role:'USER' as const,authInitialized:true,accessState:'ACTIVE' as const,sessionVersion:1},intentHash:'a'.repeat(64),
    sources:[{id:'s',userId:'owner',title:null,bodyText:'body',status:'READY' as const,updatedAt:new Date('2030-01-01T00:00:00Z'),linkedPostId:null}],attachments:[],media:[],accounts:[],bindings:[],configs:[]};
  const digest=hashes.libraryBatchSnapshotHash(snapshot);
  assert.equal(digest,hashes.libraryBatchSnapshotHash({...snapshot,sources:[{...snapshot.sources[0],updatedAt:'2030-01-01T03:00:00+03:00'}]}));
  assert.notEqual(digest,hashes.libraryBatchSnapshotHash({...snapshot,owner:{...snapshot.owner,sessionVersion:2}}));
  assert.notEqual(digest,hashes.libraryBatchSnapshotHash({...snapshot,sources:[{...snapshot.sources[0],status:'USED'}]}));
});

test('commit and retained receipt are strict versioned mappings with canonical operation ID',()=>{
  assert.ok(contracts);
  const commit={operationId,intent,snapshotFingerprint:'b'.repeat(64),previewProof:'proof'};
  assert.ok(contracts.libraryBatchCommitInputSchema.safeParse(commit).success);
  for(const patch of [{operationId:operationId.toUpperCase()},{operationId:'bad'},{ownerId:'foreign'},{requestHash:'a'.repeat(64)},{snapshotFingerprint:'no'},{previewProof:''}]) assert.equal(contracts.libraryBatchCommitInputSchema.safeParse({...commit,...patch}).success,false);
  const receipt={contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',operationId,requestHash:'a'.repeat(64),acceptedSnapshotFingerprint:'b'.repeat(64),confirmedAt:'2030-01-01T00:00:00.123Z',rows:[{...row,postId:'p',targets:[{...target,targetId:'t',publicationId:'pub'}]}]};
  assert.ok(contracts.libraryBatchReceiptSchema.safeParse(receipt).success);
  for(const patch of [{contractVersion:2},{previewUrl:'secret'},{rows:[{...receipt.rows[0],bodyText:'private'}]},{rows:[receipt.rows[0],receipt.rows[0]]}]) assert.equal(contracts.libraryBatchReceiptSchema.safeParse({...receipt,...patch}).success,false);
});

test('preview proof binds owner, request and snapshot, rejects tampering/future/expiry at ten minutes',()=>{
  assert.ok(proofs);
  const expected={ownerId:'owner',requestHash:'a'.repeat(64),snapshotFingerprint:'b'.repeat(64)};
  const now=new Date('2030-01-01T00:00:00Z');
  const proof=proofs.signLibraryBatchPreview(expected,now);
  assert.equal(proofs.verifyLibraryBatchPreview(proof,expected,now),true);
  assert.equal(proofs.verifyLibraryBatchPreview(proof,expected,new Date(now.getTime()+599999)),true);
  for(const time of [now.getTime()-1,now.getTime()+600000,now.getTime()+600001]) assert.equal(proofs.verifyLibraryBatchPreview(proof,expected,new Date(time)),false);
  for(const patch of [{ownerId:'other'},{requestHash:'c'.repeat(64)},{snapshotFingerprint:'c'.repeat(64)}]) assert.equal(proofs.verifyLibraryBatchPreview(proof,{...expected,...patch},now),false);
  for(const broken of ['',proof+'x','x'+proof,proof.split('.')[0]+'.AA']) assert.equal(proofs.verifyLibraryBatchPreview(broken,expected,now),false);
  assert.throws(()=>proofs.signLibraryBatchPreview({...expected,ownerId:''},now));
});

test('even authenticated proof payloads reject unknown/version/TTL fields and another purpose',()=>{
  assert.ok(proofs);
  const now=new Date('2030-01-01T00:00:00Z');
  const expected={ownerId:'owner',requestHash:'a'.repeat(64),snapshotFingerprint:'b'.repeat(64)};
  const payload={v:1,...expected,issuedAt:now.toISOString(),expiresAt:'2030-01-01T00:10:00.000Z'};
  const forge=(value:unknown,domain='planly.library-batch.preview.v1')=>{
    const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');
    const mac=createHmac('sha256',process.env.SESSION_SECRET!).update(domain+'\n'+encoded).digest('base64url');
    return encoded+'.'+mac;
  };
  assert.equal(proofs.verifyLibraryBatchPreview(forge(payload),expected,now),true);
  for(const patch of [{v:2},{extra:true},{expiresAt:'2030-01-01T00:11:00.000Z'},{issuedAt:'invalid'}]) assert.equal(proofs.verifyLibraryBatchPreview(forge({...payload,...patch}),expected,now),false);
  assert.equal(proofs.verifyLibraryBatchPreview(forge(payload,'planly.session.v1'),expected,now),false);
});

test('durable consent has owner+operation uniqueness and only an owner foreign key',()=>{
  assert.ok('libraryBatchConsentOperations' in schema,'consent table exists');
  const table=getTableConfig(schema.libraryBatchConsentOperations);
  assert.deepEqual(table.primaryKeys[0].columns.map(column=>column.name),['user_id','operation_id']);
  assert.deepEqual(table.foreignKeys.map(key=>key.reference().columns.map(column=>column.name)),[['user_id']]);
  assert.deepEqual(table.columns.map(column=>column.name),['user_id','operation_id','request_hash','canonical_intent','accepted_snapshot_fingerprint','receipt','created_at']);
});

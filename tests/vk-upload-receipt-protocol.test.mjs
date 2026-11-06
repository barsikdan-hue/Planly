import test from 'node:test';
import assert from 'node:assert/strict';
const protocol=await import('../public/vk-upload-receipt.mjs').catch(()=>null);
function api(){assert.ok(protocol?.sanitizeUploadReceipt&&protocol?.safeReceiptResult,'separate receipt protocol must exist');return protocol;}
const receipt=()=>({server:17,photo:' [{"opaque":"photo"}] ',hash:' signed-hash '});

test('receipt publication has a distinct fixed identity and first-party endpoint',()=>{
  const p=api();assert.equal(p.RECEIPT_OPERATION,'vk-upload-receipt-20261106-01');assert.equal(p.RECEIPT_POST_OPERATION,'planly-vk-receipt-post-20261106-01');
  assert.equal(p.RECEIPT_MESSAGE,'Тест Lentaro 06.11.2026: серверная загрузка новой картинки в VK');
  assert.equal(p.RECEIPT_WINDOW_PATH,'/social-connections/vk-upload-receipt-test');assert.equal(p.RECEIPT_ENDPOINT,'/api/social-accounts/vk/upload-receipt-test');
});
test('receipt sanitizer freezes an exact opaque three-field copy and drops unrelated provider fields',()=>{
  const p=api(),raw={...receipt(),access_token:'must-not-escape',nested:{secret:'must-not-escape'}},safe=p.sanitizeUploadReceipt(raw);
  assert.deepEqual(safe,receipt());assert.equal(Object.isFrozen(safe),true);assert.notEqual(safe,raw);assert.equal(JSON.stringify(safe).includes('must-not-escape'),false);
  raw.photo='changed';assert.equal(safe.photo,receipt().photo);
});
test('malformed, empty and oversized receipts are never usable as upload proof',()=>{
  const p=api();
  for(const raw of [null,[],{}, {...receipt(),server:0},{...receipt(),server:-1},{...receipt(),server:1.5},{...receipt(),server:Number.MAX_SAFE_INTEGER+1},{...receipt(),server:'17'},
    {...receipt(),photo:''},{...receipt(),photo:' '},{...receipt(),photo:'[]'},{...receipt(),photo:' [ \n ] '},{...receipt(),photo:'x'.repeat(1_048_577)},
    {...receipt(),hash:''},{...receipt(),hash:' '},{...receipt(),hash:'x'.repeat(8193)},{...receipt(),get photo(){throw Error('private-getter-error');}}]){
    assert.equal(p.sanitizeUploadReceipt(raw),undefined);
  }
});
test('only valid UPLOAD_CONFIRMED can carry a private receipt; malformed success becomes invalid response',()=>{
  const p=api();assert.deepEqual(p.safeReceiptResult({status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:receipt(),raw:'must-not-escape'}),{status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:receipt()});
  for(const value of [undefined,null,{}, {...receipt(),photo:'[]'}])assert.deepEqual(p.safeReceiptResult({status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:value}),{status:'UPSTREAM_RESPONSE_INVALID',httpStatus:200});
  for(const status of ['UPSTREAM_UNCONFIRMED','UPSTREAM_HTTP_REJECTED','CANCELLED','ALREADY_ATTEMPTED','OWNER_SESSION_REQUIRED'])assert.equal(Object.hasOwn(p.safeReceiptResult({status,receipt:receipt()}),'receipt'),false);
});
test('receipt result metadata is closed and rejects arbitrary provider echoes or throwing accessors',()=>{
  const p=api(),diagnostic={allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION',raw:'must-not-escape'};
  assert.deepEqual(p.safeReceiptResult({status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic,receipt:receipt(),access_token:'must-not-escape'}),{status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION'}});
  assert.deepEqual(p.safeReceiptResult({status:'private-status',httpStatus:900,receipt:receipt()}),{status:'SERVER_UPLOAD_UNCONFIRMED'});
  assert.deepEqual(p.safeReceiptResult({get status(){throw Error('must-not-escape');}}),{status:'SERVER_UPLOAD_UNCONFIRMED'});
});

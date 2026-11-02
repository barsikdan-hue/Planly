import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRejection,diagnosticMarkerKey} from '../lib/server/vk/upload-rejection.ts';
import {DIAGNOSTIC_OPERATION,sanitizeRejectionDiagnostic} from '../public/vk-upload-diagnostic.mjs';

test('405 HTML and advertised method are classified without reflecting raw response',()=>{
  const d=classifyRejection({'content-type':'text/html; charset=utf-8',allow:'GET, HEAD'},Buffer.from('<h1>405 Not Allowed</h1>private-signed-url'),'COMPLETE');
  assert.deepEqual(d,{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION'});
  assert.equal(JSON.stringify(d).includes('private'),false);
});
test('bounded VK error code is retained but description and unexpected headers are discarded',()=>{
  const d=classifyRejection({'content-type':'application/json',allow:'POST, OPTIONS','set-cookie':'secret'},Buffer.from(JSON.stringify({error:{error_code:100,error_msg:'secret-token'}})),'COMPLETE');
  assert.deepEqual(d,{allowPost:'YES',contentType:'JSON',body:'JSON_ERROR',vkErrorCode:100});
  assert.deepEqual(classifyRejection({allow:'private-secret'},Buffer.alloc(0),'COMPLETE'),{allowPost:'INVALID',contentType:'MISSING',body:'EMPTY'});
});
test('oversized/incomplete responses and hostile metadata do not expose private text',()=>{
  for(const body of ['LIMIT','INCOMPLETE'] as const){
    const d=classifyRejection({},Buffer.from('private-secret'),body);assert.equal(d.body,body);assert.equal(JSON.stringify(d).includes('private'),false);
  }
  assert.equal(sanitizeRejectionDiagnostic({allowPost:'private',contentType:'HTML',body:'OTHER'}),undefined);
  assert.deepEqual(sanitizeRejectionDiagnostic({allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION',private:'secret'}),{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION'});
  assert.equal(classifyRejection({},Buffer.alloc(4097),'COMPLETE').body,'LIMIT');
  assert.equal(diagnosticMarkerKey('synthetic-owner'),`planly:${DIAGNOSTIC_OPERATION}:synthetic-owner`);
  assert.equal(diagnosticMarkerKey('synthetic-owner').startsWith('planly:vk-server-upload-test:20261030:'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOwnerAdmissionHandler} from '../lib/server/vk/owner-admission.ts';

for(const [name,status,label] of [
  ['UnauthorizedError',401,'OWNER_SESSION_REQUIRED'],
  ['ForbiddenError',403,'OWNER_ACCESS_DENIED'],
  ['SessionAccessError',403,'OWNER_ACCESS_DENIED'],
  ['Error',503,'ADMISSION_UNAVAILABLE'],
] as const){
  test(`admission distinguishes ${name} without reflecting exception details`,async()=>{
    const error=new Error('private signed URL and token');error.name=name;
    const handler=makeOwnerAdmissionHandler(async()=>{throw error;});
    const response=await handler(new Request('https://stage.lentaro.ru/api/social-accounts/vk/upload-test'));
    assert.equal(response.status,status);
    assert.deepEqual(await response.json(),{status:label});
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
}
test('admission success requires completion of the existing authorization chain',async()=>{
  let authorized=false;
  const handler=makeOwnerAdmissionHandler(async()=>{authorized=true;});
  const response=await handler(new Request('https://stage.lentaro.ru/api/social-accounts/vk/upload-test'));
  assert.equal(authorized,true);assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:'OWNER_SESSION_RECOGNIZED'});
});

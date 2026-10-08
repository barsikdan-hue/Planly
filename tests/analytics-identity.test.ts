import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationIdentity} from '../lib/server/analytics/repository.ts';

test('legacy MAX delivery with a mid prefix remains eligible for provider identity verification',()=>{
  const publication={provider:'MAX',providerRemoteId:'mid.synthetic_42',analyticsDestinationId:null} as Parameters<typeof publicationIdentity>[0];
  assert.deepEqual(publicationIdentity(publication),{remoteId:'mid.synthetic_42',destinationId:null});
  assert.equal(publicationIdentity({...publication,providerRemoteId:null}),null);
  assert.equal(publicationIdentity({...publication,providerRemoteId:'mid.x/42'}),null);
});

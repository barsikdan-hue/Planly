import {requireApiOwner} from '../../../../../lib/server/auth/owner.ts';
import {requireOwnerProviderAccess} from '../../../../../lib/server/auth/access.ts';
import {makeReceiptRelayHandler} from '../../../../../lib/server/vk/upload-relay.ts';
import {relayUploadReceipt} from '../../../../../lib/server/vk/upload-relay-transport.ts';
import {makeOwnerAdmissionHandler} from '../../../../../lib/server/vk/owner-admission.ts';
import {claimReceiptRelay} from '../../../../../lib/server/vk/upload-receipt-claim.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=makeOwnerAdmissionHandler(async request=>{
  const owner=await requireApiOwner(request);requireOwnerProviderAccess(owner);
});
export const POST=makeReceiptRelayHandler({
  authorize:async request=>{const owner=await requireApiOwner(request);requireOwnerProviderAccess(owner);return owner.id;},
  claim:claimReceiptRelay,
  upload:relayUploadReceipt,
});

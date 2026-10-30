import {requireApiOwner} from '../../../../../lib/server/auth/owner.ts';
import {requireOwnerProviderAccess} from '../../../../../lib/server/auth/access.ts';
import {getRedisConnection} from '../../../../../lib/server/scheduler/redis.ts';
import {makeRelayHandler} from '../../../../../lib/server/vk/upload-relay.ts';
import {relayUpload} from '../../../../../lib/server/vk/upload-relay-transport.ts';
import {makeOwnerAdmissionHandler} from '../../../../../lib/server/vk/owner-admission.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=makeOwnerAdmissionHandler(async request=>{
  const owner=await requireApiOwner(request);requireOwnerProviderAccess(owner);
});
export const POST=makeRelayHandler({
  authorize:async request=>{const owner=await requireApiOwner(request);requireOwnerProviderAccess(owner);return owner.id;},
  claim:async ownerId=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      return await Promise.race([getRedisConnection().set(`planly:vk-server-upload-test:20261030:${ownerId}`,'ATTEMPTED','NX').then(result=>result==='OK'),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Admission deadline')),5000);})]);
    }finally{clearTimeout(timer);}
  },
  upload:relayUpload,
});

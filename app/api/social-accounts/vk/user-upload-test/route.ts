import {requireApiOwner} from '../../../../../lib/server/auth/owner.ts';
import {requireOwnerProviderAccess} from '../../../../../lib/server/auth/access.ts';
import {getRedisConnection} from '../../../../../lib/server/scheduler/redis.ts';
import {makeOwnerAdmissionHandler} from '../../../../../lib/server/vk/owner-admission.ts';
import {makeUserUploadHandler,runUserUpload,USER_UPLOAD_OPERATION} from '../../../../../lib/server/vk/user-upload-test.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=makeOwnerAdmissionHandler(async request=>{const owner=await requireApiOwner(request);requireOwnerProviderAccess(owner);});
export const POST=makeUserUploadHandler({
  authorize:async request=>{const owner=await requireApiOwner(request);requireOwnerProviderAccess(owner);return owner.id;},
  claim:async ownerId=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([getRedisConnection().set(`planly:${USER_UPLOAD_OPERATION}:${ownerId}`,'ATTEMPTED','NX').then(result=>result==='OK'),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Claim deadline')),5000);})]);}
    finally{clearTimeout(timer);}
  },
  upload:runUserUpload,
});

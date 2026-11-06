import type Redis from 'ioredis';
import {getRedisConnection} from '../scheduler/redis.ts';
import {RECEIPT_OPERATION} from '../../../public/vk-upload-receipt.mjs';

export const receiptRelayMarkerKey=(ownerId:string)=>`planly:${RECEIPT_OPERATION}:${ownerId}`;
export async function claimReceiptRelay(ownerId:string,connection:Pick<Redis,'set'>=getRedisConnection()):Promise<boolean>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([connection.set(receiptRelayMarkerKey(ownerId),'ATTEMPTED','NX').then(result=>result==='OK'),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Admission deadline')),5000);})]);
  }finally{clearTimeout(timer);}
  // A rejected or timed-out acknowledgement may follow a committed NX. Never
  // expire, delete or release the marker to make an uncertain upload retryable.
}

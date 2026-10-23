import {parentPort,workerData} from 'node:worker_threads';
import {submitLibraryBatch} from '../../lib/library-batch-recovery.ts';
const signal=new Int32Array(workerData.buffer,0,2),bytes=new Uint8Array(workerData.buffer,8);
function storageCall(action,key,value){
 Atomics.store(signal,0,0);parentPort.postMessage({type:'storage',action,key,value});Atomics.wait(signal,0,0);
 const response=JSON.parse(new TextDecoder().decode(bytes.subarray(0,Atomics.load(signal,1))));if(response.error)throw Error(response.error);return response.value;
}
const storage={get length(){return storageCall('length');},key:index=>storageCall('key',index),getItem:key=>storageCall('get',key),setItem:(key,value)=>storageCall('set',key,value),removeItem:key=>storageCall('remove',key)};
try{await submitLibraryBatch(storage,workerData.pending,async()=>{parentPort.postMessage({type:'dispatched',operationId:workerData.pending.input.operationId});throw Error('synthetic response loss');},()=>true);parentPort.postMessage({type:'done',unexpectedSuccess:true});}
catch(error){parentPort.postMessage({type:'done',error:error.message});}

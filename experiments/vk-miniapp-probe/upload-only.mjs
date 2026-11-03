import {inspectPreconditions} from './single-photo-test.mjs';
export const UPLOAD_ONLY_OPERATION='planly-vk-upload-only-20261029-01';
export function claimUploadOnly(storage){
  if(storage.getItem(UPLOAD_ONLY_OPERATION)!==null)return false;
  storage.setItem(UPLOAD_ONLY_OPERATION,'ATTEMPTED');
  return storage.getItem(UPLOAD_ONLY_OPERATION)==='ATTEMPTED';
}
export async function uploadOnly(options){
  const {active,claim,uploadUrl,image,fetchImpl=globalThis.fetch}=options;
  if(inspectPreconditions(options)!=='READY')return {status:'PRECONDITION_FAILED'};
  try{if(!claim())return {status:'ALREADY_ATTEMPTED'};}catch{return {status:'MARKER_UNAVAILABLE'};}
  let httpStatus=null;
  try{
    const form=new FormData();form.append('photo',image,'planly-upload-only.png');
    const response=await fetchImpl(uploadUrl,{method:'POST',body:form,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30_000)});
    if(!active())return {status:'CANCELLED_AFTER_START'};
    httpStatus=Number.isSafeInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
    if(!response.ok)return {status:'HTTP_REJECTED',httpStatus};
    const body=await response.text();
    if(!active())return {status:'CANCELLED_AFTER_START'};
    if(body.length>1_100_000)return {status:'RESPONSE_INVALID',httpStatus};
    let parsed;try{parsed=JSON.parse(body);}catch{return {status:'RESPONSE_INVALID',httpStatus};}
    if(!Number.isSafeInteger(parsed?.server)||parsed.server<=0||typeof parsed.photo!=='string'||!parsed.photo.trim()||parsed.photo.trim()==='[]'||parsed.photo.length>1_048_576
      ||typeof parsed.hash!=='string'||!parsed.hash.trim()||parsed.hash.length>8192)return {status:'RESPONSE_INVALID',httpStatus};
    return {status:'UPLOAD_CONFIRMED',httpStatus};
  }catch(error){
    const errorKind=['TypeError','AbortError','TimeoutError'].includes(error?.name)?error.name:'OTHER';
    return {status:httpStatus===null?'FETCH_UNCONFIRMED':'BODY_UNCONFIRMED',errorKind};
  }
}

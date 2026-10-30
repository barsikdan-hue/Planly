import {inspectPreconditions} from './single-photo-test.mjs';
export const SERVER_UPLOAD_OPERATION='planly-vk-server-upload-only-20261030-01';
export function claimServerUpload(storage){
  if(storage.getItem(SERVER_UPLOAD_OPERATION)!==null)return false;
  storage.setItem(SERVER_UPLOAD_OPERATION,'ATTEMPTED');return storage.getItem(SERVER_UPLOAD_OPERATION)==='ATTEMPTED';
}
const endpoint='/api/social-accounts/vk/upload-test';
export async function serverUploadOnly(options){
  const {active,claim,uploadUrl,image,fetchImpl=globalThis.fetch}=options;
  if(inspectPreconditions(options)!=='READY'||new URL(uploadUrl).hostname!=='pu.vk.ru')return {status:'PRECONDITION_FAILED'};
  try{
    const admission=await fetchImpl(endpoint,{method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10_000)});
    if(!active())return {status:'CANCELLED'};
    if(!admission.ok){
      const denied=await admission.json();
      if(admission.status===401&&denied?.status==='OWNER_SESSION_REQUIRED')return {status:'OWNER_SESSION_REQUIRED'};
      if(admission.status===403&&denied?.status==='OWNER_ACCESS_DENIED')return {status:'OWNER_ACCESS_DENIED'};
      return {status:'ADMISSION_UNAVAILABLE'};
    }
    const admitted=await admission.json();if(admitted?.status!=='OWNER_SESSION_RECOGNIZED')return {status:'OWNER_SESSION_REQUIRED'};
    const bytes=new Uint8Array(await image.arrayBuffer());if(!active())return {status:'CANCELLED'};
    const parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
    const imageBase64=btoa(parts.join(''));
    try{if(!claim())return {status:'ALREADY_ATTEMPTED'};}catch{return {status:'MARKER_UNAVAILABLE'};}
    const response=await fetchImpl(endpoint,{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({groupId:242095689,uploadUrl,imageBase64}),signal:AbortSignal.timeout(45_000)});
    const result=await response.json();
    const statuses=['UPLOAD_CONFIRMED','UPSTREAM_HTTP_REJECTED','UPSTREAM_RESPONSE_INVALID','UPSTREAM_UNCONFIRMED','ALREADY_ATTEMPTED','OWNER_SESSION_REQUIRED','INVALID_INPUT','FORBIDDEN','CANCELLED'];
    if(!statuses.includes(result?.status))return {status:'SERVER_UPLOAD_UNCONFIRMED'};
    return {status:result.status,...(Number.isSafeInteger(result.httpStatus)&&result.httpStatus>=100&&result.httpStatus<=599?{httpStatus:result.httpStatus}:{})};
  }catch{return {status:'SERVER_UPLOAD_UNCONFIRMED'};}
}

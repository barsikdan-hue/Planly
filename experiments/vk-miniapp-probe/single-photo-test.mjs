export const LEGACY_TEST_MESSAGE='Тест Planly: автоматическая загрузка нового изображения в VK';
export const LEGACY_TEST_OPERATION='planly-vk-newphoto-20261029-01';
export const TEST_MESSAGE='Тест Lentaro 06.11.2026: новая картинка и текст через VK API';
export const TEST_OPERATION='planly-vk-newphoto-20261106-01';
const positive=n=>Number.isSafeInteger(n)&&n>0;
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
// Display-only candidate identification. This does not authorize an upload host.
export function safeUploadHost(uploadUrl,sensitiveToken){
  try{
    const host=new URL(uploadUrl).hostname;
    if(sensitiveToken&&host.includes(sensitiveToken.toLowerCase()))return 'REDACTED';
    return /^(?:pu\d*|ps\d*|cs\d+|sun\d+-\d+)\.(?:vk\.com|vk\.ru|vkuserphoto\.ru|userapi\.com)$/.test(host)?host:'REDACTED';
  }catch{return 'REDACTED';}
}
export function inspectPreconditions({active,uploadUrl,image,sensitiveToken}){
  let url;
  try{url=new URL(uploadUrl);}catch{return 'UPLOAD_URL_INVALID';}
  if(url.protocol!=='https:')return 'UPLOAD_SCHEME';
  if(!/^pu\d*\.vk\.com$/.test(url.hostname)&&url.hostname!=='pu.vk.ru')return 'UPLOAD_HOST';
  if(url.port||url.username||url.password||url.hash)return 'UPLOAD_URL_COMPONENTS';
  if(sensitiveToken&&(url.toString().includes(sensitiveToken)||[...url.searchParams.values()].some(value=>value.includes(sensitiveToken))))return 'UPLOAD_TOKEN_IN_URL';
  if(!(image instanceof Blob))return 'IMAGE_MISSING';
  if(image.type!=='image/png')return 'IMAGE_TYPE';
  if(image.size<1||image.size>1_000_000)return 'IMAGE_SIZE';
  if(!active())return 'CANCELLED';
  return 'READY';
}
export async function publishOne(options){
  return publishFixed(options,TEST_OPERATION,TEST_MESSAGE);
}
export async function publishReceiptPost(options){
  return publishFixed(options,RECEIPT_POST_OPERATION,RECEIPT_MESSAGE);
}
async function publishFixed(options,operation,message){
  const {active,claim,uploadUrl,image,upload,api}=options;
  if(inspectPreconditions(options)!=='READY')return {phase:'TEST_PRECONDITION_FAILED'};
  try{if(!claim())return {phase:'TEST_ALREADY_ATTEMPTED'};}catch{return {phase:'TEST_PRECONDITION_FAILED'};}
  let stage=operation===RECEIPT_POST_OPERATION?'SERVER_UPLOAD_PENDING':'UPLOAD_STARTED';
  try{
    const raw=await upload(new URL(uploadUrl).toString(),image);
    stage='UPLOAD_RESPONSE_RECEIVED';
    if(!active()||!positive(raw?.server)||!text(raw.photo,1_048_576)||raw.photo.trim()==='[]'||!text(raw.hash,8192))throw {};
    stage='SAVE_STARTED';
    const saved=await api('photos.saveWallPhoto',{group_id:242095689,server:raw.server,photo:raw.photo,hash:raw.hash});
    stage='SAVE_RESPONSE_RECEIVED';
    if(!active()||!Array.isArray(saved)||saved.length!==1||!positive(saved[0]?.id)
      ||(saved[0].owner_id!==-242095689&&(!positive(options.uploadUserId)||saved[0].owner_id!==options.uploadUserId))
      ||saved[0].access_key!==undefined)throw {};
    stage='POST_STARTED';
    const receipt=await api('wall.post',{owner_id:-242095689,from_group:1,message,
      attachments:`photo${saved[0].owner_id}_${saved[0].id}`,guid:operation});
    stage='POST_RESPONSE_RECEIVED';
    if(!positive(receipt?.post_id))throw {};
    return {phase:'TEST_POST_CONFIRMED',postId:receipt.post_id};
  }catch(error){
    const code=error?.error_data?.error_code??error?.error_code;
    const diagnostic=error?.relayResult?safeReceiptResult(error.relayResult):null;
    return {phase:'TEST_OUTCOME_UNKNOWN',stage,errorCode:Number.isSafeInteger(code)&&code>=0&&code<1_000_000?code:null,
      ...(diagnostic?{uploadDiagnostic:{status:diagnostic.status,...(diagnostic.httpStatus?{httpStatus:diagnostic.httpStatus}:{}),...(diagnostic.diagnostic?{diagnostic:diagnostic.diagnostic}:{})}}:{})};
  }
}

export async function readTestResult(api,uploadUserId){
  return readFixedTestResult(api,TEST_MESSAGE,uploadUserId);
}
export async function readReceiptPostResult(api,uploadUserId){
  return readFixedTestResult(api,RECEIPT_MESSAGE,uploadUserId);
}
export async function readLegacyTestResult(api,uploadUserId){
  return readFixedTestResult(api,LEGACY_TEST_MESSAGE,uploadUserId);
}
async function readFixedTestResult(api,message,uploadUserId){
  try{
    const result=await api('wall.get',{domain:'club242095689',count:5,offset:0,filter:'owner',extended:0});
    if(!result||!Number.isSafeInteger(result.count)||result.count<0||!Array.isArray(result.items)||result.items.length>5)throw {};
    const match=result.items.find(post=>positive(post?.id)&&post.owner_id===-242095689&&post.text===message
      &&Array.isArray(post.attachments)&&post.attachments.some(a=>a?.type==='photo'&&positive(a.photo?.id)&&a.photo.access_key===undefined
        &&(a.photo.owner_id===-242095689||(positive(uploadUserId)&&a.photo.owner_id===uploadUserId))));
    return match?{status:'MATCH_FOUND',postId:match.id}:{status:'NO_MATCH_IN_SAMPLE'};
  }catch{return {status:'READ_UNAVAILABLE'};}
}

export async function uploadPhoto(url,image){
  const form=new FormData();form.append('photo',image,'planly-test.png');
  const response=await fetch(url,{method:'POST',body:form,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw {};
  const body=await response.text();if(body.length>1_100_000)throw {};
  return JSON.parse(body);
}

export function claimTest(storage){
  if(storage.getItem(TEST_OPERATION)!==null)return false;
  storage.setItem(TEST_OPERATION,'ATTEMPTED');
  return storage.getItem(TEST_OPERATION)==='ATTEMPTED';
}
import {RECEIPT_POST_OPERATION,RECEIPT_MESSAGE,safeReceiptResult} from '../../public/vk-upload-receipt.mjs';
export function claimReceiptPost(storage){
  if(storage.getItem(RECEIPT_POST_OPERATION)!==null)return false;
  storage.setItem(RECEIPT_POST_OPERATION,'ATTEMPTED');
  return storage.getItem(RECEIPT_POST_OPERATION)==='ATTEMPTED';
}

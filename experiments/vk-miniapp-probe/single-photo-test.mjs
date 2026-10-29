export const TEST_MESSAGE='Тест Planly: автоматическая загрузка нового изображения в VK';
export const TEST_OPERATION='planly-vk-newphoto-20261029-01';
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
  const {active,claim,uploadUrl,image,upload,api}=options;
  if(inspectPreconditions(options)!=='READY')return {phase:'TEST_PRECONDITION_FAILED'};
  try{if(!claim())return {phase:'TEST_ALREADY_ATTEMPTED'};}catch{return {phase:'TEST_PRECONDITION_FAILED'};}
  try{
    const raw=await upload(new URL(uploadUrl).toString(),image);
    if(!active()||!positive(raw?.server)||!text(raw.photo,1_048_576)||raw.photo.trim()==='[]'||!text(raw.hash,8192))throw {};
    const saved=await api('photos.saveWallPhoto',{group_id:242095689,server:raw.server,photo:raw.photo,hash:raw.hash});
    if(!active()||!Array.isArray(saved)||saved.length!==1||saved[0]?.owner_id!==-242095689||!positive(saved[0]?.id))throw {};
    const receipt=await api('wall.post',{owner_id:-242095689,from_group:1,message:TEST_MESSAGE,
      attachments:`photo-242095689_${saved[0].id}`,guid:TEST_OPERATION});
    if(!positive(receipt?.post_id))throw {};
    return {phase:'TEST_POST_CONFIRMED',postId:receipt.post_id};
  }catch{return {phase:'TEST_OUTCOME_UNKNOWN'};}
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

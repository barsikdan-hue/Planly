import type {PublishInput,PublishResult,SocialConnector,PublicationErrorType} from './types.ts';
type Failure=Extract<PublishResult,{ok:false}>;
type ApiResult={ok:true,result:unknown}|Failure;
const record=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const failure=(errorType:PublicationErrorType,code:string,message:string):Failure=>({ok:false,errorType,code,message});
const ambiguous=()=>failure('PERMANENT','AMBIGUOUS_DELIVERY','MAX delivery outcome is unknown. Check the destination before sending again.');
const validId=(v:unknown)=>typeof v==='string'&&/^-?[1-9]\d{0,15}$/.test(v)&&Number.isSafeInteger(Number(v));
const attachmentToken=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=8192;

export function createMaxConnector(options:{token:string,fetcher?:typeof fetch,timeoutMs?:number}):SocialConnector & {
 validate(destinationId:string):Promise<{ok:true,destinationId:string,displayName:string}|Failure>;
} {
 const token=options.token.trim();const fetcher=options.fetcher??fetch;
 async function call(path:string,method:'GET'|'POST',body?:unknown,mutation=false):Promise<ApiResult>{
  if(!token||/[\r\n]/.test(token))return failure('AUTH','MAX_NOT_CONFIGURED','MAX bot token is not configured correctly on the server.');
  try {
   const response=await fetcher(`https://platform-api2.max.ru${path}`,{method,redirect:'error',headers:{authorization:token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(options.timeoutMs??30000)});
   const data=record(await response.json());
   if(response.ok&&data&&typeof data.code!=='string')return {ok:true,result:data};
   if(response.status===401||response.status===403)return failure('AUTH',`MAX_${response.status}`,'MAX bot credentials or destination permissions need reconnecting.');
   if(data?.code==='attachment.not.ready')return {...failure('TEMPORARY','MAX_ATTACHMENT_NOT_READY','MAX is still processing the attachment.'),retryAfterMs:60000};
   if(response.status===429)return {...failure('TEMPORARY','MAX_429','MAX rate limit; retry later.'),retryAfterMs:60000};
   if(response.status>=400&&response.status<500)return failure('VALIDATION',`MAX_${response.status}`,'MAX rejected the destination, text or attachment.');
   return mutation?ambiguous():failure('TEMPORARY','MAX_UNAVAILABLE','MAX validation or upload preparation is temporarily unavailable.');
  }catch{return mutation?ambiguous():failure('TEMPORARY','MAX_UNAVAILABLE','MAX validation or upload preparation is temporarily unavailable.');}
 }
 async function upload(asset:NonNullable<PublishInput['media']>[number]):Promise<{ok:true,type:'image'|'video',token:string}|Failure>{
  const type=asset.mimeType==='video/mp4'?'video':'image';
  const prepared=await call(`/uploads?type=${type}`,'POST');if(!prepared.ok)return prepared;
  const data=record(prepared.result);let url:URL;
  try{url=new URL(String(data?.url));}catch{return failure('PERMANENT','MAX_UPLOAD_URL','MAX did not provide an allowed upload destination.');}
  const allowed=type==='image'?url.hostname==='iu.oneme.ru'&&url.pathname==='/uploadImage':url.hostname==='omub.okcdn.ru'&&url.pathname==='/upload.do';
  if(!allowed||url.protocol!=='https:'||url.port||url.username||url.password||url.hash)return failure('PERMANENT','MAX_UPLOAD_URL','MAX did not provide an allowed upload destination.');
  if(type==='video'&&!attachmentToken(data?.token))return failure('TEMPORARY','MAX_UPLOAD_RESPONSE','MAX upload response was incomplete.');
  try{
   const bytes=new Uint8Array(asset.bytes.length);bytes.set(asset.bytes);
   const form=new FormData();form.set('data',new Blob([bytes.buffer],{type:asset.mimeType}),type==='video'?'media.mp4':asset.mimeType==='image/png'?'media.png':'media.jpg');
   // Only the documented image host receives Authorization; video upload uses its signed URL.
   const response=await fetcher(url.toString(),{method:'POST',redirect:'error',headers:type==='image'?{authorization:token}:undefined,body:form,signal:AbortSignal.timeout(options.timeoutMs??30000)});
   if(!response.ok)return failure('TEMPORARY','MAX_UPLOAD_FAILED','MAX media upload was not confirmed.');
   if(type==='image'){
    const photos=record(record(await response.json())?.photos);const items=photos?Object.values(photos):[];
    const uploaded=record(items[0])?.token;
    if(items.length!==1||!attachmentToken(uploaded))return failure('TEMPORARY','MAX_UPLOAD_RESPONSE','MAX upload response was incomplete.');
    return {ok:true,type,token:uploaded};
   }
   if((await response.text()).trim()!=='<retval>1</retval>')return failure('TEMPORARY','MAX_UPLOAD_RESPONSE','MAX upload response was incomplete.';
   return {ok:true,type,token:data!.token as string};
  }catch{return failure('TEMPORARY','MAX_UPLOAD_FAILED','MAX media upload was not confirmed.');}
 }
 return {
  provider:'MAX',
  async validate(destinationId){
   if(!validId(destinationId))return failure('VALIDATION','MAX_DESTINATION','Use a numeric MAX chat ID.');
   const me=await call('/me','GET');if(!me.ok)return me;const bot=record(me.result);
   if(bot?.is_bot!==true||!Number.isSafeInteger(bot.user_id))return failure('AUTH','MAX_BOT_INVALID','MAX did not confirm the bot identity.');
   const info=await call(`/chats/${destinationId}`,'GET');if(!info.ok)return info;const chat=record(info.result);
   if(!Number.isSafeInteger(chat?.chat_id)||String(chat?.chat_id)!==destinationId||!['chat','channel'].includes(String(chat?.type))||chat?.status!=='active')return failure('VALIDATION','MAX_CHAT_INVALID','Select an active MAX group or channel accessible to this bot.');
   const membership=await call(`/chats/${destinationId}/members/me`,'GET');if(!membership.ok)return membership;const member=record(membership.result);
   const permissions=Array.isArray(member?.permissions)?member.permissions:[];
   if(member?.user_id!==bot.user_id||member?.is_bot!==true||!(member.is_owner===true||(member.is_admin===true&&(chat.type==='chat'||permissions.includes('write')||permissions.includes('post_edit_delete_message')))))return failure('AUTH','MAX_POST_PERMISSION','Add the MAX bot as administrator; channels also require posting permission.');
   return {ok:true,destinationId,displayName:typeof chat.title==='string'?chat.title.slice(0,200):'MAX'};
  },
  async publish(input){
   const media=input.media??[];
   if(input.provider!=='MAX'||!validId(input.destinationId)||(!input.text.trim()&&!media.length)||input.text.length>4000||media.length>12)return failure('VALIDATION','MAX_CONTENT','MAX requires a numeric destination, text up to4000 characters and up to12 media attachments.');
   for(const asset of media)if(!['image/png','image/jpeg','video/mp4'].includes(asset.mimeType)||!asset.bytes.length||asset.bytes.length>20*1024*1024||(asset.mimeType!=='video/mp4'&&((asset.width??0)>7680||(asset.height??0)>7680)))return failure('VALIDATION','MAX_MEDIA','Planly supports MAX JPEG/PNG and MP4 up to20MiB per file.');
   const attachments:Array<{type:'image'|'video',payload:{token:string}}>=[];
   for(const asset of media){const uploaded=await upload(asset);if(!uploaded.ok)return uploaded;attachments.push({type:uploaded.type,payload:{token:uploaded.token}});}
   let sent:ApiResult;
   for(let attempt=0;;attempt++){
    sent=await call(`/messages?chat_id=${encodeURIComponent(input.destinationId!)}`,'POST',{text:input.text,attachments},true);
    if(sent.ok||sent.code!=='MAX_ATTACHMENT_NOT_READY'||!attachments.length||attempt===3)break;
    await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
   }
   if(!sent.ok)return sent;
   const message=record(record(sent.result)?.message);const recipient=record(message?.recipient);const body=record(message?.body);
   if(!Number.isSafeInteger(recipient?.chat_id)||String(recipient?.chat_id)!==input.destinationId||!['chat','channel'].includes(String(recipient?.chat_type))||typeof body?.mid!=='string'||!/^[-a-zA-Z0-9_.]{1,256}$/.test(body.mid))return ambiguous();
   let remoteUrl:string|null=null;
   if(typeof message?.url==='string'){try{const url=new URL(message.url);if(url.protocol==='https:'&&url.hostname==='max.ru'&&!url.username&&!url.password&&!url.port)remoteUrl=url.toString();}catch{/* A confirmed ID remains valid without an optional URL. */}}
   return {ok:true,remoteId:body.mid,remoteUrl};
  },
 };
}

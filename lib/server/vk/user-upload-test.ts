import {collectionDeadline,abortable} from '../analytics/body.ts';
import {allowedVkPhotoUploadDestination,uploadVkPhotoMultipart} from '../connectors/vk.ts';
import {USER_UPLOAD_OPERATION,GROUP_ID,FIXED_USER_UPLOAD_PNG} from '../../../public/vk-user-upload-protocol.mjs';

export {USER_UPLOAD_OPERATION,FIXED_USER_UPLOAD_PNG};
const ORIGIN='https://stage.lentaro.ru';
const TTL=120_000;
type UserUploadInput={groupId:number;accessToken:string;scopes:string[];issuedAt:number};
const statuses=new Set(['UPLOAD_CONFIRMED','UPSTREAM_HTTP_REJECTED','UPSTREAM_RESPONSE_INVALID','UPSTREAM_UNCONFIRMED','COMMUNITY_CONTROL_REQUIRED','UPLOAD_ADDRESS_REJECTED']);
type Result={status:string;httpStatus?:number};
const record=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function parseInput(raw:unknown,now:number):UserUploadInput{
  const v=record(raw);
  if(!v||Object.keys(v).sort().join(',')!=='accessToken,groupId,issuedAt,scopes'||v.groupId!==GROUP_ID
    ||typeof v.accessToken!=='string'||!/^[-A-Za-z0-9_.]{20,16000}$/.test(v.accessToken)
    ||!Number.isSafeInteger(v.issuedAt)||Number(v.issuedAt)>now||now-Number(v.issuedAt)>TTL
    ||!Array.isArray(v.scopes)||v.scopes.length!==3||[...v.scopes].sort().join(',')!=='groups,photos,wall')throw Error('Invalid input');
  return {groupId:GROUP_ID,accessToken:v.accessToken,scopes:['wall','photos','groups'],issuedAt:Number(v.issuedAt)};
}
// Cancellation closes the reader, and only bounded JSON is ever allocated.
async function boundedJson(body:ReadableStream<Uint8Array>|null,limit:number,signal:AbortSignal):Promise<unknown>{
  if(!body)throw Error('Missing body');
  const reader=body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const {done,value}=await abortable(reader.read(),signal);if(done)break;size+=value.byteLength;if(size>limit)throw Error('Body limit');chunks.push(value);}
    if(signal.aborted)throw Error('Cancelled');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{void reader.cancel().catch(()=>{});reader.releaseLock();chunks.length=0;}
}
function safeResult(raw:unknown):Result{
  const v=record(raw);const status=typeof v?.status==='string'&&statuses.has(v.status)?v.status:'UPSTREAM_UNCONFIRMED';
  return {status,...(Number.isSafeInteger(v?.httpStatus)&&Number(v?.httpStatus)>=100&&Number(v?.httpStatus)<=599?{httpStatus:Number(v!.httpStatus)}:{})};
}
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
type Dependencies={authorize:(r:Request)=>Promise<string>;claim:(ownerId:string)=>Promise<boolean>;upload:(input:UserUploadInput,signal:AbortSignal)=>Promise<Result>;now?:()=>number;deadlineMs?:number};
export function makeUserUploadHandler(deps:Dependencies){
  return async(request:Request):Promise<Response>=>{
    if(request.method!=='POST'||new URL(request.url).search||request.headers.get('origin')!==ORIGIN
      ||request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin'
      ||request.headers.get('x-planly-vk-user-upload')!==USER_UPLOAD_OPERATION)return reply({status:'FORBIDDEN'},403);
    if(request.signal.aborted)return reply({status:'CANCELLED'},409);
    const deadline=collectionDeadline(deps.deadlineMs??45_000,request.signal);
    let input:UserUploadInput|null=null;
    try{
      let ownerId:string;
      try{ownerId=await abortable(deps.authorize(request),deadline.signal);if(!ownerId)throw Error();}
      catch(error){const name=error instanceof Error?error.name:'';const [status,label]=name==='UnauthorizedError'?[401,'OWNER_SESSION_REQUIRED']:name==='ForbiddenError'||name==='SessionAccessError'?[403,'OWNER_ACCESS_DENIED']:[503,'ADMISSION_UNAVAILABLE'];return reply({status:label},Number(status));}
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({status:'INVALID_INPUT'},415);
      try{input=parseInput(await boundedJson(request.body,20_000,deadline.signal),(deps.now??Date.now)());}catch{return reply({status:deadline.signal.aborted?'CANCELLED':'INVALID_INPUT'},deadline.signal.aborted?409:422);}
      if(deadline.signal.aborted)return reply({status:'CANCELLED'},409);
      if(!await abortable(deps.claim(ownerId),deadline.signal))return reply({status:'ALREADY_ATTEMPTED'},409);
      // A timed-out claim can have committed; no retry or release is attempted.
      if(deadline.signal.aborted)return reply({status:'CANCELLED'},409);
      return reply(safeResult(await abortable(deps.upload(input,deadline.signal),deadline.signal)));
    }catch{return reply({status:'UPSTREAM_UNCONFIRMED'},502);}
    finally{input=null;deadline.dispose();}
  };
}
async function api(method:'groups.get'|'photos.getWallUploadServer',params:Record<string,string>,token:string,signal:AbortSignal,fetchImpl:typeof fetch):Promise<unknown>{
  const response=await abortable(fetchImpl(`https://api.vk.com/method/${method}`,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,access_token:token,v:'5.199'}),signal}),signal);
  if(!response.ok)throw Error('API rejected');
  const payload=record(await boundedJson(response.body,1_100_000,signal));
  if(!payload||payload.error||!Object.hasOwn(payload,'response'))throw Error('API unavailable');
  return payload.response;
}
export async function runUserUpload(input:UserUploadInput,signal:AbortSignal,fetchImpl:typeof fetch=fetch):Promise<Result>{
  try{
    if(signal.aborted)return {status:'UPSTREAM_UNCONFIRMED'};
    const groups=record(await api('groups.get',{filter:'editor',extended:'0',count:'1000',offset:'0'},input.accessToken,signal,fetchImpl));
    const items=groups?.items;
    if(!Array.isArray(items)||items.length>1000||!items.every(positive)||new Set(items).size!==items.length
      ||!Number.isSafeInteger(groups?.count)||Number(groups?.count)<items.length||!items.includes(GROUP_ID))return {status:'COMMUNITY_CONTROL_REQUIRED'};
    if(signal.aborted)return {status:'UPSTREAM_UNCONFIRMED'};
    const server=record(await api('photos.getWallUploadServer',{group_id:String(GROUP_ID)},input.accessToken,signal,fetchImpl));
    const uploadUrl=allowedVkPhotoUploadDestination(server?.upload_url,input.accessToken);
    if(!uploadUrl||!Number.isSafeInteger(server?.album_id)||!positive(server?.user_id)
      ||server?.group_id!==undefined&&server.group_id!==GROUP_ID)return {status:'UPLOAD_ADDRESS_REJECTED'};
    if(signal.aborted)return {status:'UPSTREAM_UNCONFIRMED'};
    const response=await abortable(uploadVkPhotoMultipart({uploadUrl,bytes:Buffer.from(FIXED_USER_UPLOAD_PNG,'base64'),mimeType:'image/png',fetchImpl,signal}),signal);
    if(!response.ok){void response.body?.cancel().catch(()=>{});return {status:'UPSTREAM_HTTP_REJECTED',httpStatus:response.status};}
    let uploaded:Record<string,unknown>|null;
    try{uploaded=record(await boundedJson(response.body,1_100_000,signal));}catch{return {status:'UPSTREAM_RESPONSE_INVALID',httpStatus:response.status};}
    let photos:unknown;
    try{photos=typeof uploaded?.photo==='string'?JSON.parse(uploaded.photo):null;}catch{photos=null;}
    if(!positive(uploaded?.server)||!Array.isArray(photos)||photos.length===0||typeof uploaded?.photo!=='string'||uploaded.photo.length>1_048_576
      ||typeof uploaded.hash!=='string'||!uploaded.hash.trim()||uploaded.hash.length>8192)return {status:'UPSTREAM_RESPONSE_INVALID',httpStatus:response.status};
    return {status:'UPLOAD_CONFIRMED',httpStatus:response.status};
  }catch{return {status:'UPSTREAM_UNCONFIRMED'};}
}

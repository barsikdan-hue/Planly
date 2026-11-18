import {randomBytes,createHash,createPublicKey,verify} from 'node:crypto';
import {allowedVkPhotoUploadDestination,createVkConnector,validateVkCommunity,sanitizeVkPublicationDiagnostic,VkCommunityValidationError} from '../../lib/server/connectors/vk.ts';
import {inspectUploadReply} from './upload-diagnostic.mjs';
import {describeReadback,describeReadbackError,describeExistingReadback} from './readback-diagnostic.mjs';

export const OPERATION='vk-render-photo-20261116-01';
export const JPEG_OPERATION='vk-render-jpeg-20261116-02';
export const PNG04_OPERATION='vk-render-png-20261116-04';
export const JPEG03_OPERATION='vk-render-jpeg-20261116-03';
export function getOperationSpec(operation=OPERATION){
 if([OPERATION,PNG04_OPERATION].includes(operation))return Object.freeze({operation,mimeType:'image/png',fileName:'vk-api-test.png',fixture:'fixture.png'});
 if([JPEG_OPERATION,JPEG03_OPERATION].includes(operation))return Object.freeze({operation,mimeType:'image/jpeg',fileName:'vk-api-test.jpg',fixture:'fixture.jpg'});
 throw new Error('OPERATION_CONFIG');
}
export const MESSAGE='Проверка VK API 16.11.2026: публикация картинки и текста через приложение Planly.';
export const CLIENT_ID='54809575';
export const COMMUNITY='242095689';
export const EXPECTED_USER=815727447;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const random=()=>randomBytes(32).toString('base64url');
const validToken=v=>typeof v==='string'&&v.length>0&&v.length<=16000&&!/[\s\x00-\x1f\x7f]/.test(v);
class ClosedError extends Error {constructor(reason,stage,code){super(reason);this.reason=reason;this.stage=stage;this.vkErrorCode=code;}}
function roleState(group){return {isAdmin:group?.is_admin===1?'YES':group?.is_admin===0?'NO':group?.is_admin===undefined?'MISSING':'INVALID',adminLevel:typeof group?.admin_level==='number'?({0:'NONE',1:'MODERATOR',2:'EDITOR',3:'ADMIN'})[group.admin_level]??'INVALID':group?.admin_level===undefined?'MISSING':'INVALID'};}
function validOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||u.username||u.password)throw new Error('ORIGIN_CONFIG');return u.origin;}

export function createVerifier({origin,serviceToken,permitPublicKey,fetchImpl=globalThis.fetch,now=Date.now,image,operation=OPERATION,readbackOnly=false}){
 if(typeof readbackOnly!=='boolean')throw new Error('READ_ONLY_CONFIG');
 const spec=getOperationSpec(operation);
 origin=validOrigin(origin);
 if(serviceToken!==undefined&&!validToken(serviceToken))throw new Error('SERVICE_TOKEN_CONFIG');
 const key=createPublicKey(permitPublicKey);if(key.asymmetricKeyType!=='ed25519')throw new Error('PERMIT_KEY_CONFIG');
 if(!(image instanceof Uint8Array)||image.length<8||image.length>1_000_000)throw new Error('IMAGE_CONFIG');
 if([JPEG_OPERATION,JPEG03_OPERATION].includes(operation)&&(image[0]!==255||image[1]!==216||image[2]!==255||image.at(-2)!==255||image.at(-1)!==217))throw new Error('IMAGE_CONFIG');
 const imageCopy=new Uint8Array(image);
 const bootId=random();let intent,access,credentialExpiry=0,attempted=false,expectedAttachment,readAttempted=false;
 let view={status:serviceToken?'READY_FOR_AUTH':'SERVICE_TOKEN_REQUIRED',stage:'CONFIG',appId:CLIENT_ID,communityId:COMMUNITY,bootId,operation,imageMimeType:spec.mimeType};
 const status=()=>structuredClone({...view,credentialExpired:credentialExpiry>0&&now()>=credentialExpiry,attempted});
 const set=(values)=>{view={...view,...values};return status();};
 const transport=async(url,init)=>{
  const u=new URL(url);const method=u.pathname.split('/').at(-1);
  // All destinations originate in fixed APIs or the unchanged connector's upload allowlist.
  if(init?.method!=='POST'||init.redirect!=='error')throw new ClosedError('TRANSPORT_POLICY','TRANSPORT');
  const allowedAPI=u.origin==='https://api.vk.com'&&['users.get','groups.getById','groups.get','photos.getWallUploadServer','photos.saveWallPhoto','wall.post','wall.getById'].some(m=>u.pathname===`/method/${m}`)&&!u.search;
  const allowedOAuth=u.href==='https://id.vk.ru/oauth2/auth';
  if(readbackOnly&&!allowedOAuth&&!(allowedAPI&&['users.get','groups.getById','groups.get','wall.getById'].includes(method)))throw new ClosedError('READ_ONLY_MODE','TRANSPORT');
  const allowedUpload=access&&allowedVkPhotoUploadDestination(url,access);
  if(!allowedAPI&&!allowedOAuth&&!allowedUpload)throw new ClosedError('TRANSPORT_POLICY','TRANSPORT');
  if(method==='groups.getById'||method==='groups.get')view.stage='COMMUNITY_VALIDATION';
  if(method==='photos.getWallUploadServer')view.stage='GET_UPLOAD_SERVER';
  if(method==='photos.saveWallPhoto')view.stage='SAVE_PHOTO';
  if(method==='wall.post'){
   view.stage='WALL_POST';const fields=Object.fromEntries(init.body);
   if(fields.owner_id!==`-${COMMUNITY}`||fields.message!==MESSAGE||fields.guid!==operation||fields.from_group!=='1')throw new ClosedError('TRANSPORT_POLICY','WALL_POST');
   expectedAttachment=fields.attachments;
  }
  if(allowedUpload&&!allowedAPI&&!allowedOAuth)view.stage='UPLOAD';
  const response=await fetchImpl(url,init);
  // Bound the body for own JSON parsing and for the unchanged connector.
  if(Number(response.headers.get('content-length'))>1_048_576){await response.body?.cancel();throw new ClosedError('RESPONSE_LIMIT',view.stage);}
  const chunks=[];let length=0;
  if(response.body){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1_048_576){await reader.cancel();throw new ClosedError('RESPONSE_LIMIT',view.stage);}chunks.push(value);}}
  const bytes=chunks.length?Buffer.concat(chunks):null;
  if(allowedUpload&&!allowedAPI&&!allowedOAuth)view.uploadResponse=inspectUploadReply(bytes??new Uint8Array(),response.headers.get('content-type'));
  return new Response(bytes,{status:response.status,headers:response.headers});
 };
 async function jsonRequest(url,fields,stage){
  view.stage=stage;
  const response=await transport(url,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),signal:AbortSignal.timeout(30_000)});
  view.httpStatus=response.status;let raw;
  try{raw=await response.json();}catch{throw new ClosedError('INVALID_RESPONSE',stage);}
  if(object(raw?.error)&&Number.isSafeInteger(raw.error.error_code)&&raw.error.error_code>0&&raw.error.error_code<=9999)throw new ClosedError('VK_API_REJECTED',stage,raw.error.error_code);
  if(raw?.error){const reason=['invalid_grant','invalid_client','access_denied','invalid_scope'].includes(raw.error)?raw.error.toUpperCase():'PROVIDER_REJECTED';throw new ClosedError(reason,stage);}
  if(!response.ok||!object(raw))throw new ClosedError('HTTP_REJECTED',stage);
  return raw;
 }
 const api=async(method,params={})=>{
  const raw=await jsonRequest(`https://api.vk.com/method/${method}`,{...params,access_token:access,v:'5.199'},method==='users.get'?'IDENTITY':method==='wall.getById'?'READBACK':'GET_UPLOAD_SERVER');
  if(!Object.hasOwn(raw,'response'))throw new ClosedError('INVALID_RESPONSE',view.stage);
  return raw.response;
 };
 function failure(error,defaultStage){
  access=undefined;
  if(error instanceof ClosedError)return set({status:'AUTH_FAILED',reason:error.reason,stage:error.stage,...(error.vkErrorCode?{vkErrorCode:error.vkErrorCode}:{})});
  if(error instanceof VkCommunityValidationError)return set({status:'AUTH_FAILED',reason:error.code,stage:'COMMUNITY_VALIDATION',diagnostic:sanitizeVkPublicationDiagnostic(error.vkDiagnostic)});
  return set({status:'AUTH_FAILED',reason:'TRANSPORT_OR_RESPONSE_FAILED',stage:defaultStage});
 }
 function start(sessionId){
  if(!serviceToken)throw new Error('SERVICE_TOKEN_REQUIRED');
  if(attempted||view.status!=='READY_FOR_AUTH')throw new Error('AUTH_ALREADY_USED');
  if(typeof sessionId!=='string'||sessionId.length<8||sessionId.length>128)throw new Error('OWNER_SESSION');
  if(intent)throw new Error('AUTH_ALREADY_STARTED');
  const state=random(),verifier=randomBytes(48).toString('base64url');
  intent={state,verifier,sessionId,expiresAt:now()+600_000};
  set({status:'AWAITING_VK',stage:'AUTHORIZATION'});
  const u=new URL('https://id.vk.ru/authorize');u.search=new URLSearchParams({response_type:'code',client_id:CLIENT_ID,redirect_uri:`${origin}/oauth/callback`,state,scope:'wall photos',prompt:'consent',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();return u.href;
 }
 async function callback(sessionId,query){
  if(!intent)return status();
  const current=intent;intent=undefined;
  try{
   if(!(query instanceof URLSearchParams)||current.expiresAt<now()||current.sessionId!==sessionId||query.getAll('state').length!==1||query.get('state')!==current.state||query.getAll('code').length!==1||query.getAll('device_id').length!==1)throw new ClosedError('INVALID_CALLBACK','CALLBACK');
   const code=query.get('code'),deviceId=query.get('device_id');
   if(!code||!deviceId||code.length>16000||deviceId.length>16000||query.has('error'))throw new ClosedError('INVALID_CALLBACK','CALLBACK');
   set({status:'AUTH_IN_PROGRESS',stage:'TOKEN_EXCHANGE'});
   const raw=await jsonRequest('https://id.vk.ru/oauth2/auth',{grant_type:'authorization_code',client_id:CLIENT_ID,service_token:serviceToken,redirect_uri:`${origin}/oauth/callback`,code,device_id:deviceId,state:current.state,code_verifier:current.verifier},'TOKEN_EXCHANGE');
   if(raw.state!==current.state)throw new ClosedError('STATE_MISMATCH','TOKEN_EXCHANGE');
   const scopes=typeof raw.scope==='string'?raw.scope.split(/[\s,]+/).filter(Boolean):[];
   view.scopes={wall:scopes.includes('wall'),photos:scopes.includes('photos')};
   if(!view.scopes.wall||!view.scopes.photos)throw new ClosedError('MISSING_PUBLISHING_SCOPES','GRANT_VALIDATION');
   if(!validToken(raw.access_token)||!Number.isSafeInteger(raw.expires_in)||raw.expires_in<=0||raw.expires_in>31_536_000)throw new ClosedError('INVALID_GRANT_RESPONSE','GRANT_VALIDATION');
   access=raw.access_token;credentialExpiry=now()+Math.min(raw.expires_in*1000,1_200_000);
   const users=await api('users.get');
   view.identityMatches=Array.isArray(users)&&users.length===1&&users[0]?.id===EXPECTED_USER;
   if(!view.identityMatches)throw new ClosedError('IDENTITY_MISMATCH','IDENTITY');
   // Capture finite role fields while letting the original validator make the admission decision.
   const groupTransport=async(url,init)=>{const response=await transport(url,init);if(new URL(url).pathname==='/method/groups.getById'){const raw=await response.clone().json();view.roles=roleState(raw?.response?.groups?.[0]);}return response;};
   const destination=await validateVkCommunity({token:access,communityId:COMMUNITY,fetchImpl:groupTransport});
   view.managementProof=destination.authorizationProof??'ROLE_FIELDS';
    if(readbackOnly)return set({status:'PERMISSIONS_VERIFIED',stage:'READBACK',grantId:random(),reason:'READ_ONLY_NO_UPLOAD_OR_POST',expiresAt:credentialExpiry});
   const upload=await api('photos.getWallUploadServer',{group_id:COMMUNITY});
   if(!allowedVkPhotoUploadDestination(upload?.upload_url,access)||!Number.isSafeInteger(upload?.album_id)||upload?.user_id!==EXPECTED_USER||(upload.group_id!==undefined&&upload.group_id!==Number(COMMUNITY)))throw new ClosedError('UPLOAD_SERVER_INVALID','GET_UPLOAD_SERVER');
   return set({status:'PERMISSIONS_VERIFIED',stage:'GET_UPLOAD_SERVER',grantId:random(),reason:'NO_UPLOAD_OR_POST',expiresAt:credentialExpiry});
  }catch(error){return failure(error,view.stage);}
 }
 function checkPermit(permit){
  try{
   if(!object(permit)||Object.keys(permit).sort().join(',')!=='payload,signature'||typeof permit.payload!=='string'||permit.payload.length>2048||!/^[A-Za-z0-9_-]+$/.test(permit.payload)||typeof permit.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(permit.signature))return false;
   if(!verify(null,Buffer.from(permit.payload),key,Buffer.from(permit.signature,'base64url')))return false;
   const p=JSON.parse(Buffer.from(permit.payload,'base64url').toString('utf8'));
   return object(p)&&Object.keys(p).sort().join(',')==='bootId,expiresAt,grantId,operation'&&p.operation===operation&&p.bootId===bootId&&p.grantId===view.grantId&&Number.isSafeInteger(p.expiresAt)&&p.expiresAt>now()&&p.expiresAt<=now()+60_000;
  }catch{return false;}
 }
 async function publish(permit){
  if(readbackOnly)throw new Error('READ_ONLY_MODE');
  if(attempted)throw new Error('ALREADY_ATTEMPTED');
  if(view.status!=='PERMISSIONS_VERIFIED'||!access||now()>=credentialExpiry)throw new Error('NOT_READY');
  if(!checkPermit(permit))throw new Error('INVALID_PERMIT');
  attempted=true;set({status:'ATTEMPTED',stage:'GET_UPLOAD_SERVER',reason:'OUTCOME_PENDING'});
  try{
   const connector=createVkConnector({getAccessToken:async()=>access,fetchImpl:transport});
   const result=await connector.publish({publicationId:operation,socialAccountId:operation,provider:'VK',destinationId:`-${COMMUNITY}`,text:MESSAGE,media:[{name:spec.fileName,mimeType:spec.mimeType,bytes:imageCopy}]});
   if(!result.ok){const diagnostic=sanitizeVkPublicationDiagnostic(result.vkDiagnostic);return set({status:'OUTCOME_UNCONFIRMED',reason:result.code,stage:diagnostic?.stage??view.stage,diagnostic});}
   const match=/^-242095689_([1-9]\d*)$/.exec(result.remoteId);
   if(!match)throw new ClosedError('RECEIPT_INVALID','WALL_POST');
   set({postUrl:`https://vk.com/wall${result.remoteId}`,postId:Number(match[1]),stage:'READBACK'});
   let read;
   try{read=await api('wall.getById',{posts:result.remoteId});}
   catch(error){
    let errorType='TRANSPORT';
    if(error instanceof ClosedError){
     // HTTP_REJECTED also labels a non-object envelope on an otherwise successful HTTP response.
     errorType=error.reason==='HTTP_REJECTED'?(view.httpStatus>=200&&view.httpStatus<300?'RESPONSE_SHAPE':'HTTP'):
      ['INVALID_RESPONSE','RESPONSE_LIMIT','TRANSPORT_POLICY'].includes(error.reason)?'RESPONSE_SHAPE':'VK_API';
    }
    const readbackDiagnostic=describeReadbackError(errorType);
    return set({status:'OUTCOME_UNCONFIRMED',reason:readbackDiagnostic.reason,stage:'READBACK',readbackDiagnostic,...(error instanceof ClosedError&&error.vkErrorCode?{vkErrorCode:error.vkErrorCode}:{})});
   }
   const readbackDiagnostic=describeReadback(read,{postId:Number(match[1]),wallOwner:-Number(COMMUNITY),text:MESSAGE,attachment:expectedAttachment});
   set({readbackDiagnostic});
   try{
   const items=read?.items;
   const post=Array.isArray(items)&&items.length===1?items[0]:null;
   const photo=post?.attachments?.filter(a=>a.type==='photo');
   if(!post||post.id!==Number(match[1])||post.owner_id!==-Number(COMMUNITY)||post.text!==MESSAGE||!Array.isArray(photo)||photo.length!==1||`photo${photo[0]?.photo?.owner_id}_${photo[0]?.photo?.id}`!==expectedAttachment)return set({status:'OUTCOME_UNCONFIRMED',reason:readbackDiagnostic.reason,stage:'READBACK'});
   }catch{return set({status:'OUTCOME_UNCONFIRMED',reason:'READBACK_INVALID_SHAPE',stage:'READBACK'});}
   return set({status:'POST_CONFIRMED',reason:'EXACT_TEXT_PHOTO_READBACK',stage:'READBACK'});
  }catch(error){return set({status:'OUTCOME_UNCONFIRMED',reason:error instanceof ClosedError?error.reason:'TRANSPORT_OR_RESPONSE_FAILED',stage:view.stage,...(error instanceof ClosedError&&error.vkErrorCode?{vkErrorCode:error.vkErrorCode}:{})});}
  finally{access=undefined;}
 }
 async function readExisting(){
  if(!readbackOnly)throw new Error('READ_ONLY_MODE');
  if(readAttempted)throw new Error('READ_ALREADY_USED');
  if(view.status!=='PERMISSIONS_VERIFIED'||!access||now()>=credentialExpiry)throw new Error('NOT_READY');
  readAttempted=true;const observations=[];
  try{
   for(const postNumber of [5,6]){
    let readbackDiagnostic;
    try{
     const read=await api('wall.getById',{posts:`-${COMMUNITY}_${postNumber}`});
     readbackDiagnostic=describeExistingReadback(read,{postId:postNumber,wallOwner:-Number(COMMUNITY),text:MESSAGE});
    }catch(error){
     const type=error instanceof ClosedError?(['INVALID_RESPONSE','RESPONSE_LIMIT'].includes(error.reason)?'RESPONSE_SHAPE':error.reason==='HTTP_REJECTED'?(view.httpStatus>=200&&view.httpStatus<300?'RESPONSE_SHAPE':'HTTP'):'VK_API'):'TRANSPORT';
     readbackDiagnostic=describeReadbackError(type);
    }
    observations.push({postNumber,readbackDiagnostic});
   }
   return set({status:'READBACK_OBSERVED',stage:'READBACK',reason:'EXISTING_POSTS_ONLY',observations});
  }finally{access=undefined;}
 }
 return Object.freeze({start,callback,publish,status,readExisting});
}

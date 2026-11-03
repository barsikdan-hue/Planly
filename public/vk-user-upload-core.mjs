import {requestPeerConfirmation} from './vk-upload-window-core.mjs';
import {USER_UPLOAD_OPERATION,GROUP_ID} from './vk-user-upload-protocol.mjs';
import {sanitizeUserUploadDiagnostic} from './vk-user-upload-diagnostic.mjs';
export {sanitizeUserUploadDiagnostic,userUploadDiagnosticText} from './vk-user-upload-diagnostic.mjs';
export {requestPeerConfirmation};
export {USER_UPLOAD_OPERATION};
export const ORIGIN='https://stage.lentaro.ru';
export const TTL=120_000;
export const USER_UPLOAD_WINDOW_PATH='/social-connections/vk-user-upload-test';
export const USER_UPLOAD_ENDPOINT='/api/social-accounts/vk/user-upload-test';
export const validNonce=n=>typeof n==='string'&&/^[a-f0-9]{32}$/.test(n);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validateUserUploadPayload(p,now=Date.now()){
  if(!record(p)||Object.keys(p).sort().join(',')!=='accessToken,groupId,issuedAt,scopes'||p.groupId!==GROUP_ID
    ||typeof p.accessToken!=='string'||!/^[-A-Za-z0-9_.]{20,16000}$/.test(p.accessToken)
    ||!Array.isArray(p.scopes)||p.scopes.join(',')!=='wall,photos,groups'
    ||!Number.isSafeInteger(p.issuedAt)||p.issuedAt<0||p.issuedAt>now||now-p.issuedAt>=TTL)throw Error('Invalid user upload payload');
  return Object.freeze({groupId:GROUP_ID,accessToken:p.accessToken,scopes:Object.freeze(['wall','photos','groups']),issuedAt:p.issuedAt});
}
const statuses=new Set(['UPLOAD_CONFIRMED','PROVIDER_READ_REJECTED','COMMUNITY_CONTROL_REQUIRED','INVALID_PROVIDER_RESPONSE','UPLOAD_ADDRESS_REJECTED',
  'UPSTREAM_HTTP_REJECTED','UPSTREAM_RESPONSE_INVALID','UPSTREAM_UNCONFIRMED','ALREADY_ATTEMPTED','OWNER_SESSION_REQUIRED',
  'OWNER_ACCESS_DENIED','ADMISSION_UNAVAILABLE','INVALID_INPUT','FORBIDDEN','CANCELLED','MARKER_UNAVAILABLE',
  'WINDOW_UNAVAILABLE','WINDOW_EXPIRED','PAYLOAD_REJECTED']);
export function safeUserUploadResult(raw){
  const diagnostic=sanitizeUserUploadDiagnostic(raw?.diagnostic);
  return {status:record(raw)&&statuses.has(raw.status)?raw.status:'UPSTREAM_UNCONFIRMED',
    ...(Number.isSafeInteger(raw?.httpStatus)&&raw.httpStatus>=100&&raw.httpStatus<=599?{httpStatus:raw.httpStatus}:{}),
    ...(diagnostic?{diagnostic}:{})};
}
export async function ownerUserUploadAdmission(fetchImpl){
  try{
    const response=await fetchImpl(USER_UPLOAD_ENDPOINT,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});
    const body=await response.json();
    if(response.status===200&&body?.status==='OWNER_SESSION_RECOGNIZED')return {status:'OWNER_SESSION_RECOGNIZED'};
    if(response.status===401&&body?.status==='OWNER_SESSION_REQUIRED')return {status:'OWNER_SESSION_REQUIRED'};
    if(response.status===403&&body?.status==='OWNER_ACCESS_DENIED')return {status:'OWNER_ACCESS_DENIED'};
  }catch{/* Token-bearing errors are never reflected. */}
  return {status:'ADMISSION_UNAVAILABLE'};
}
export async function executeUserUpload({payload,active,storage,locks,fetchImpl,now=Date.now}){
  let input=null;
  try{
    input=validateUserUploadPayload(payload,now());
    if(!active())return {status:'CANCELLED'};
    if(!locks)return {status:'MARKER_UNAVAILABLE'};
    return await locks.request(USER_UPLOAD_OPERATION,{ifAvailable:true},async lock=>{
      if(!lock)return {status:'ALREADY_ATTEMPTED'};
      if(!active())return {status:'CANCELLED'};
      input=validateUserUploadPayload(input,now());
      try{
        if(storage.getItem(USER_UPLOAD_OPERATION)!==null)return {status:'ALREADY_ATTEMPTED'};
        storage.setItem(USER_UPLOAD_OPERATION,'ATTEMPTED');
        if(storage.getItem(USER_UPLOAD_OPERATION)!=='ATTEMPTED')return {status:'MARKER_UNAVAILABLE'};
      }catch{return {status:'MARKER_UNAVAILABLE'};}
      if(!active())return {status:'CANCELLED'};
      const response=await fetchImpl(USER_UPLOAD_ENDPOINT,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
        headers:{'Content-Type':'application/json','X-Planly-VK-User-Upload':USER_UPLOAD_OPERATION},
        body:JSON.stringify(input),signal:AbortSignal.timeout(60_000)});
      return safeUserUploadResult(await response.json());
    });
  }catch{return {status:'UPSTREAM_UNCONFIRMED'};}
  finally{input=null;payload=null;}
}
export function createUserUploadReceiver({opener,now=Date.now,admit,confirmPeer,execute,send,preview,render}){
  let nonce=null,phase='WAITING',payload=null;const expires=now()+TTL;
  const active=()=>phase!=='DONE'&&nonce!==null&&now()<expires;
  const finish=raw=>{
    if(phase==='DONE')return;
    phase='DONE';payload=null;const result=safeUserUploadResult(raw);render(result.status,result);
    if(nonce)send({type:'RESULT',nonce,result});
  };
  const expire=()=>finish({status:phase==='UPLOADING'?'UPSTREAM_UNCONFIRMED':'WINDOW_EXPIRED'});
  async function receive(event){
    if(phase==='DONE'||event.origin!==ORIGIN||event.source!==opener||!record(event.data))return;
    if(now()>=expires){expire();return;}
    const m=event.data;
    if(m.type==='HELLO'&&phase==='WAITING'&&validNonce(m.nonce)&&m.operation===USER_UPLOAD_OPERATION&&Object.keys(m).sort().join(',')==='nonce,operation,type'){
      nonce=m.nonce;phase='ADMITTING';render(phase);
      let admitted;try{admitted=await admit();}catch{admitted={status:'ADMISSION_UNAVAILABLE'};}
      if(!active()){expire();return;}
      if(admitted?.status!=='OWNER_SESSION_RECOGNIZED'){finish(admitted);return;}
      phase='ADMITTED';send({type:'ADMITTED',nonce});render(phase);return;
    }
    if(!nonce||m.nonce!==nonce)return;
    if(m.type==='CANCEL'&&Object.keys(m).sort().join(',')==='nonce,type'){finish({status:'CANCELLED'});return;}
    if(m.type==='PAYLOAD'){
      if(phase!=='ADMITTED'||Object.keys(m).sort().join(',')!=='nonce,payload,type'){finish({status:'PAYLOAD_REJECTED'});return;}
      try{payload=validateUserUploadPayload(m.payload,now());}catch{finish({status:'PAYLOAD_REJECTED'});return;}
      phase='PREVIEW';preview();render(phase);
    }
  }
  async function confirm(){
    if(phase!=='PREVIEW')return;
    if(!active()){expire();return;}
    phase='CONFIRMING';render(phase);let frozen=payload;
    try{
      if(!confirmPeer||!await confirmPeer(nonce,active)){finish({status:'CANCELLED'});return;}
      if(!active()){expire();return;}
      let admitted;try{admitted=await admit();}catch{admitted={status:'ADMISSION_UNAVAILABLE'};}
      if(!active()){expire();return;}
      if(admitted?.status!=='OWNER_SESSION_RECOGNIZED'){finish(admitted);return;}
      frozen=validateUserUploadPayload(frozen,now());
      phase='UPLOADING';render(phase);payload=null;
      const result=await execute(frozen,active);
      if(active())finish(result);else finish({status:'UPSTREAM_UNCONFIRMED'});
    }catch{finish({status:'UPSTREAM_UNCONFIRMED'});}
    finally{frozen=null;}
  }
  return {receive,confirm,cancel:()=>finish({status:phase==='UPLOADING'?'UPSTREAM_UNCONFIRMED':'CANCELLED'}),tick:()=>{if(now()>=expires)expire();},phase:()=>phase};
}

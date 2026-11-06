import {sanitizeRejectionDiagnostic} from './vk-upload-diagnostic.mjs';

export const RECEIPT_OPERATION='vk-upload-receipt-20261106-01';
export const RECEIPT_POST_OPERATION='planly-vk-receipt-post-20261106-01';
export const RECEIPT_MESSAGE='Тест Lentaro 06.11.2026: серверная загрузка новой картинки в VK';
export const RECEIPT_WINDOW_PATH='/social-connections/vk-upload-receipt-test';
export const RECEIPT_ENDPOINT='/api/social-accounts/vk/upload-receipt-test';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

// Private, ephemeral proof for saveWallPhoto. Copy opaque values verbatim;
// caller-controlled extras never enter the result or the public diagnostics.
export function sanitizeUploadReceipt(raw){
  try{
    if(!record(raw))return;
    const {server,photo,hash}=raw;
    if(!Number.isSafeInteger(server)||server<=0||typeof photo!=='string'||!photo.trim()||/^\[\s*\]$/.test(photo.trim())||photo.length>1_048_576
      ||typeof hash!=='string'||!hash.trim()||hash.length>8192)return;
    return Object.freeze({server,photo,hash});
  }catch{return undefined;}
}

const statuses=new Set(['UPLOAD_CONFIRMED','UPSTREAM_HTTP_REJECTED','UPSTREAM_RESPONSE_INVALID','UPSTREAM_UNCONFIRMED',
  'ALREADY_ATTEMPTED','OWNER_SESSION_REQUIRED','OWNER_ACCESS_DENIED','ADMISSION_UNAVAILABLE','INVALID_INPUT','FORBIDDEN',
  'CANCELLED','MARKER_UNAVAILABLE','SERVER_UPLOAD_UNCONFIRMED','WINDOW_UNAVAILABLE','WINDOW_EXPIRED','PAYLOAD_REJECTED']);
export function safeReceiptResult(raw){
  try{
    const candidate=record(raw)?raw:{};
    const {status:rawStatus,httpStatus,diagnostic:rawDiagnostic,receipt:rawReceipt}=candidate;
    let status=statuses.has(rawStatus)?rawStatus:'SERVER_UPLOAD_UNCONFIRMED';
    const receipt=status==='UPLOAD_CONFIRMED'?sanitizeUploadReceipt(rawReceipt):undefined;
    if(status==='UPLOAD_CONFIRMED'&&!receipt)status='UPSTREAM_RESPONSE_INVALID';
    const diagnostic=status==='UPSTREAM_HTTP_REJECTED'?sanitizeRejectionDiagnostic(rawDiagnostic):undefined;
    return Object.freeze({status,...(Number.isSafeInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{httpStatus}:{}),
      ...(diagnostic?{diagnostic}:{}),...(receipt?{receipt}:{})});
  }catch{return Object.freeze({status:'SERVER_UPLOAD_UNCONFIRMED'});}
}

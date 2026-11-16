const choices={
 reason:['VALID_RECEIPT_SHAPE','INVALID_INPUT','BODY_LIMIT','EMPTY_BODY','INVALID_JSON','NON_OBJECT','WRAPPED_JSON','PROVIDER_ERROR','SERVER_INVALID','PHOTO_INVALID','HASH_INVALID'],
 contentType:['JSON','HTML','TEXT','OTHER','MISSING'],
 jsonKind:['OBJECT','ARRAY','NULL','STRING','NUMBER','BOOLEAN'],
 server:['MISSING','STRING','OTHER','ZERO','NEGATIVE','NON_INTEGER','VALID'],
 photo:['MISSING','NON_STRING','EMPTY','EMPTY_ARRAY','TOO_LONG','PRESENT'],
 hash:['MISSING','NON_STRING','EMPTY','TOO_LONG','PRESENT'],
};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function sanitizeUploadReply(value){
 try{
  if(!object(value))return;
  const {reason,contentType,jsonKind,server,photo,hash,bodyBytes,vkErrorCode}=value;
  if(!choices.reason.includes(reason))return;
  const out={reason};
  for(const [k,v]of Object.entries({contentType,jsonKind,server,photo,hash}))if(choices[k].includes(v))out[k]=v;
  if(Number.isSafeInteger(bodyBytes)&&bodyBytes>=0&&bodyBytes<=1_048_576)out.bodyBytes=bodyBytes;
  if(Number.isSafeInteger(vkErrorCode)&&vkErrorCode>0&&vkErrorCode<=9999)out.vkErrorCode=vkErrorCode;
  return out;
 }catch{return undefined;}
}
function stringState(v,max,photo=false){return v===undefined?'MISSING':typeof v!=='string'?'NON_STRING':v.length>max?'TOO_LONG':!v.trim()?'EMPTY':photo&&/^\[\s*\]$/.test(v.trim())?'EMPTY_ARRAY':'PRESENT';}
export function inspectUploadReply(bytes,contentType){
 if(!(bytes instanceof Uint8Array))return {reason:'INVALID_INPUT'};
 if(bytes.length>1_048_576)return {reason:'BODY_LIMIT'};
 const media=typeof contentType==='string'?contentType.toLowerCase().split(';')[0].trim():'';
 const out={bodyBytes:bytes.length,contentType:!media?'MISSING':media==='application/json'||media.endsWith('+json')?'JSON':media==='text/html'?'HTML':media.startsWith('text/')?'TEXT':'OTHER'};
 if(!bytes.length)return {...out,reason:'EMPTY_BODY'};
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return {...out,reason:'INVALID_JSON'};}
 out.jsonKind=value===null?'NULL':Array.isArray(value)?'ARRAY':typeof value==='object'?'OBJECT':typeof value==='string'?'STRING':typeof value==='boolean'?'BOOLEAN':'NUMBER';
 if(!object(value))return {...out,reason:'NON_OBJECT'};
 const v=value.server;
 out.server=v===undefined?'MISSING':typeof v==='string'?'STRING':typeof v!=='number'?'OTHER':v===0?'ZERO':v<0?'NEGATIVE':!Number.isSafeInteger(v)?'NON_INTEGER':'VALID';
 out.photo=stringState(value.photo,1_048_576,true);out.hash=stringState(value.hash,8192);
 const code=object(value.error)?value.error.error_code:value.error_code;
 if(Number.isSafeInteger(code)&&code>0&&code<=9999)out.vkErrorCode=code;
 const reason=value.error||(value.error_code!==undefined&&value.error_code!==0)?'PROVIDER_ERROR':Object.hasOwn(value,'response')&&!Object.hasOwn(value,'server')?'WRAPPED_JSON':out.server!=='VALID'?'SERVER_INVALID':out.photo!=='PRESENT'?'PHOTO_INVALID':out.hash!=='PRESENT'?'HASH_INVALID':'VALID_RECEIPT_SHAPE';
 return sanitizeUploadReply({...out,reason});
}

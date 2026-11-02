import {DIAGNOSTIC_OPERATION,sanitizeRejectionDiagnostic} from '../../../public/vk-upload-diagnostic.mjs';
export const diagnosticMarkerKey=(ownerId:string)=>`planly:${DIAGNOSTIC_OPERATION}:${ownerId}`;
type Headers=Record<string,string|string[]|undefined>;
export function classifyRejection(headers:Headers,bytes:Buffer,state:'COMPLETE'|'LIMIT'|'INCOMPLETE'){
  const allow=headers.allow,content=headers['content-type'];
  let allowPost='UNSPECIFIED';
  if(allow!==undefined){
    const methods=typeof allow==='string'&&allow.length<=256?allow.split(',').map(x=>x.trim().toUpperCase()):[];
    allowPost=methods.length>0&&methods.length<=9&&methods.every(x=>['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS','TRACE','CONNECT'].includes(x))
      ?methods.includes('POST')?'YES':'NO':'INVALID';
  }
  const type=typeof content==='string'&&content.length<=256?content.split(';')[0].trim().toLowerCase():'';
  const contentType=content===undefined?'MISSING':type==='application/json'||type.endsWith('+json')?'JSON':type==='text/html'?'HTML':'OTHER';
  if(bytes.length>4096)state='LIMIT';
  let body:string=state==='COMPLETE'?(bytes.length?'OTHER':'EMPTY'):state;
  let vkErrorCode:number|undefined;
  if(state==='COMPLETE'&&bytes.length<=4096){
    if(contentType==='JSON'){
      try{
        const value=JSON.parse(bytes.toString('utf8'));
        const code=value?.error?.error_code??value?.error_code;
        if(Number.isSafeInteger(code)&&code>=0&&code<=1_000_000){body='JSON_ERROR';vkErrorCode=code;}
      }catch{/* never return descriptions or raw bytes */}
    }else if(contentType==='HTML'&&/(?:405\s+(?:Not\s+Allowed|Method\s+Not\s+Allowed)|Method\s+Not\s+Allowed)/i.test(bytes.toString('utf8')))body='METHOD_REJECTION';
  }
  return sanitizeRejectionDiagnostic({allowPost,contentType,body,vkErrorCode})!;
}

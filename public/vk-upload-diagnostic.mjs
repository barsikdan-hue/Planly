// New counted diagnostic; previous operation IDs/markers are never reused.
export const DIAGNOSTIC_OPERATION='vk-server-upload-diagnostic-20261102-02';
const allowed={allowPost:['YES','NO','UNSPECIFIED','INVALID'],contentType:['JSON','HTML','OTHER','MISSING'],
  body:['EMPTY','JSON_ERROR','METHOD_REJECTION','OTHER','LIMIT','INCOMPLETE']};
export function sanitizeRejectionDiagnostic(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.entries(allowed).every(([k,values])=>values.includes(raw[k])))return undefined;
  return {allowPost:raw.allowPost,contentType:raw.contentType,body:raw.body,
    ...(raw.body==='JSON_ERROR'&&Number.isSafeInteger(raw.vkErrorCode)&&raw.vkErrorCode>=0&&raw.vkErrorCode<=1_000_000?{vkErrorCode:raw.vkErrorCode}:{})};
}
export function diagnosticText(raw){
  const d=sanitizeRejectionDiagnostic(raw);
  return d?` POST по Allow: ${d.allowPost}; тип ответа: ${d.contentType}; вид отказа: ${d.body}${d.vkErrorCode!==undefined?`; код VK: ${d.vkErrorCode}`:''}.`:'';
}

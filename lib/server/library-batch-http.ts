import {ZodError} from 'zod';
import {requestCookie} from './auth/owner.ts';
import {SESSION_COOKIE_NAME} from './auth/session.ts';
import {ForbiddenError,rejectIdentityPayload} from './auth/access.ts';
import {PayloadLimitError,readBoundedJson} from './analytics/body.ts';
import {socialConnectionOrigin} from './social-connections/http.ts';
import {LibraryBatchError,canPreviewLibraryBatch,previewLibraryBatch,commitLibraryBatch,readLibraryBatchOperation} from './library-batch.ts';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
const rollbackCodes=new Set(['BATCH_FORBIDDEN','BATCH_UNAVAILABLE','BATCH_PREVIEW_STALE','BATCH_ACCOUNT_UNAVAILABLE','BATCH_CONTENT_INVALID','BATCH_SLOT_CONFLICT']);
export function libraryBatchApiError(error:unknown,commit=false):Response{
 if(error instanceof LibraryBatchError)return json({error:'Не удалось подтвердить набор.',code:error.code,...(commit&&rollbackCodes.has(error.code)?{commitApplied:false}:{}),...(error.code==='BATCH_RESULT_DELETED'&&error.result?{result:error.result}:{})},error.status);
 if(error instanceof ForbiddenError)return json({error:'Forbidden',code:'BATCH_FORBIDDEN'},403);
 if(error instanceof PayloadLimitError)return json({error:'Invalid batch input',code:'BATCH_INVALID'},413);
 if(error instanceof SyntaxError)return json({error:'Malformed JSON',code:'BATCH_INVALID'},400);
 if(error instanceof ZodError)return json({error:'Invalid batch input',code:'BATCH_INVALID'},422);
 // Driver/payload/proof details must never reach responses or logs. An unknown
 // failure, including a COMMIT acknowledgement loss, establishes no rollback.
 return json({error:'Не удалось подтвердить результат.',code:'BATCH_RESULT_UNCERTAIN'},503);
}
function requireRequest(request:Request,mutation:boolean){
 if(new URL(request.url).search||request.method!==(mutation?'POST':'GET'))throw new ForbiddenError();
 for(const name of request.headers.keys())if(name==='authorization'||/^x-(?:planly-)?(?:user|owner|human|session|account|actor|provider)(?:-|$)/i.test(name))throw new ForbiddenError();
 if(mutation){const site=request.headers.get('sec-fetch-site');if(request.headers.get('origin')!==socialConnectionOrigin(request)||request.headers.get('x-planly-library-batch')!=='1'||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||site&&site!=='same-origin')throw new ForbiddenError();}
}
async function input(request:Request){
 let value:unknown;try{value=await readBoundedJson(request.body,64*1024);}catch(error){if(error instanceof TypeError)throw new SyntaxError('Malformed JSON');throw error;}
 rejectIdentityPayload(value);return value;
}
const token=(request:Request)=>requestCookie(request,SESSION_COOKIE_NAME)??'';
export async function libraryBatchPreview(request:Request):Promise<Response>{
 try{const mutation=request.method!=='GET';requireRequest(request,mutation);return json(mutation?await previewLibraryBatch(token(request),await input(request)):{eligible:await canPreviewLibraryBatch(token(request))});}catch(error){return libraryBatchApiError(error);}
}
export async function libraryBatchCommit(request:Request):Promise<Response>{
 try{requireRequest(request,true);return json(await commitLibraryBatch(token(request),await input(request)));}catch(error){return libraryBatchApiError(error,true);}
}
export async function libraryBatchOperation(request:Request,context:{params:Promise<{operationId:string}>}):Promise<Response>{
 try{requireRequest(request,false);return json(await readLibraryBatchOperation(token(request),(await context.params).operationId));}catch(error){return libraryBatchApiError(error);}
}

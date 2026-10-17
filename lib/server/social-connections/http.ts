import {z, ZodError} from 'zod';
import {requireApiOwner, requestCookie, UnauthorizedError} from '../auth/owner.ts';
import {ForbiddenError} from '../auth/access.ts';
import {SESSION_COOKIE_NAME} from '../auth/session.ts';
import {PayloadLimitError, readBoundedJson} from '../analytics/body.ts';
import {createSocialConnectionService, SocialConnectionError} from './service.ts';
import {SocialProofError} from './launch.ts';
import {socialConnectionAccountHint} from './account-hint.ts';

export const socialConnectionJson=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
export function socialConnectionOrigin(request:Request):string {
 const configured=process.env.PLANLY_PUBLIC_ORIGIN;
 if(configured!==undefined) {
  try {const url=new URL(configured);if(url.protocol==='https:' && url.origin===configured && !url.username && !url.password)return configured;}catch{}
  throw new SocialConnectionError('UNAVAILABLE');
 }
 return new URL(request.url).origin;
}
export function requireSocialConnectionRequest(request:Request):void {
 const site=request.headers.get('sec-fetch-site');
 if(request.method!=='POST' || request.headers.get('origin')!==socialConnectionOrigin(request) || request.headers.get('X-Planly-Social-Connection')!=='1' || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json' || (site && site!=='same-origin') || new URL(request.url).search)throw new ForbiddenError();
 for(const name of request.headers.keys())if(name==='authorization' || /^x-(?:planly-)?(?:user|owner|human|session|account|actor|provider)(?:-|$)/i.test(name))throw new ForbiddenError();
}
export function socialConnectionApiError(error:unknown):Response {
 if(error instanceof UnauthorizedError)return socialConnectionJson({error:'Unauthorized'},401);
 if(error instanceof ForbiddenError)return socialConnectionJson({error:'Forbidden'},403);
 if(error instanceof PayloadLimitError)return socialConnectionJson({error:'Invalid connection input'},413);
 if(error instanceof SyntaxError)return socialConnectionJson({error:'Malformed JSON'},400);
 if(error instanceof ZodError)return socialConnectionJson({error:'Invalid connection input'},422);
 if(error instanceof SocialProofError)return socialConnectionJson({error:'Connection could not be verified'},403);
 if(error instanceof SocialConnectionError) {
  const status={UNAVAILABLE:503,DENIED:403,CONFLICT:409,LIMITED:429,CONTROL_FAILED:403}[error.code];
  return socialConnectionJson({error:error.code==='UNAVAILABLE'?'Подключение пока недоступно. Администратору нужно настроить Mini App и бота.':'Не удалось подтвердить подключение. Начните заново.',code:error.code},status);
 }
 // Never log arbitrary errors: drivers and provider errors can contain credentials.
 return socialConnectionJson({error:'Connection temporarily unavailable'},500);
}
const ticketInput=z.object({ticket:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
const startInput=z.object({destinationId:z.string().trim().regex(/^(@[A-Za-z][A-Za-z0-9_]{2,63}|-?[1-9]\d{0,15})$/).max(128)}).strict();
const proofInput=z.object({initData:z.string().min(1).refine(value=>Buffer.byteLength(value)<=16384)}).strict();
export const socialConnectionProvider=z.enum(['telegram','max']);
async function input(request:Request,limit:number) {
 try{return await readBoundedJson(request.body,limit);}catch(error){if(error instanceof TypeError)throw new SyntaxError('Malformed JSON');throw error;}
}
export async function connectionStart(request:Request,context:{params:Promise<{id:string}>}):Promise<Response> {
 try {
  await requireApiOwner(request);requireSocialConnectionRequest(request);
  const {id}=await context.params;z.string().min(1).max(128).parse(id);
  const body=startInput.parse(await input(request,2048));
  const started=await createSocialConnectionService().start(requestCookie(request,SESSION_COOKIE_NAME)??'',id,body.destinationId);
  return socialConnectionJson({...started,accountHint:socialConnectionAccountHint(started.accountId)});
 }catch(error){return socialConnectionApiError(error);}
}
export async function connectionProof(request:Request,context:{params:Promise<{provider:string}>}):Promise<Response> {
 try {
  requireSocialConnectionRequest(request);
  const provider=socialConnectionProvider.parse((await context.params).provider);
  // A 16KiB string can use six JSON bytes per character (escaped controls).
  const body=proofInput.parse(await input(request,100000));
  const proof=await createSocialConnectionService().receive(provider==='telegram'?'TELEGRAM':'MAX',body.initData);
  return socialConnectionJson({ticket:proof.ticket,provider:proof.provider,accountHint:socialConnectionAccountHint(proof.accountId),destinationId:proof.destinationId,destinationName:proof.destinationName,humanId:proof.humanId,humanName:proof.humanName,expiresAt:proof.expiresAt});
 }catch(error){return socialConnectionApiError(error);}
}
export async function connectionTicket(request:Request,action:'preview'|'confirm'):Promise<Response> {
 try {
  await requireApiOwner(request);requireSocialConnectionRequest(request);
  const body=ticketInput.parse(await input(request,1024));
  return socialConnectionJson(await createSocialConnectionService()[action](requestCookie(request,SESSION_COOKIE_NAME)??'',body.ticket));
 }catch(error){return socialConnectionApiError(error);}
}

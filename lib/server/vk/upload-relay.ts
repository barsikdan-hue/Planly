import {isIP} from 'node:net';
import {readBoundedJson} from '../analytics/body.ts';

export type RelayInput={uploadUrl:URL;image:Buffer};
export type RelayResult={status:'UPLOAD_CONFIRMED'|'UPSTREAM_HTTP_REJECTED'|'UPSTREAM_RESPONSE_INVALID'|'UPSTREAM_UNCONFIRMED';httpStatus?:number};
const invalid=()=>new Error('Invalid relay input');
export function parseRelayInput(raw:unknown):RelayInput{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='groupId,imageBase64,uploadUrl'||v.groupId!==242095689||typeof v.uploadUrl!=='string'||v.uploadUrl.length>8192
    ||typeof v.imageBase64!=='string'||v.imageBase64.length>1_333_336||!v.imageBase64||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.imageBase64))throw invalid();
  if(/[\r\n\0]/.test(v.uploadUrl))throw invalid();
  const url=new URL(v.uploadUrl);
  if(url.protocol!=='https:'||url.hostname!=='pu.vk.ru'||url.port||url.username||url.password||url.hash||!/^\/c\d{1,12}\/ss\d{1,12}\/upload\.php$/.test(url.pathname)
    ||url.searchParams.get('act')!=='do_add'||url.searchParams.getAll('act').length!==1||url.searchParams.get('wallphoto')!=='1'||url.searchParams.getAll('wallphoto').length!==1)throw invalid();
  if(/[\r\n\0]/.test(decodeURIComponent(url.toString())))throw invalid();
  for(const key of url.searchParams.keys())if(/^(access_token|refresh_token|authorization)$/i.test(key))throw invalid();
  const image=Buffer.from(v.imageBase64,'base64');
  if(image.length<12||image.length>1_000_000||image.toString('base64')!==v.imageBase64||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw invalid();
  return {uploadUrl:url,image};
}
export function isPublicRelayIpv4(ip:string):boolean{
  if(isIP(ip)!==4)return false;
  const [a,b,c]=ip.split('.').map(Number);
  if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127)return false;
  if(a===192&&(b===0||b===2||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)return false;
  return true;
}
type Dependencies={authorize:(r:Request)=>Promise<string>;claim:(ownerId:string)=>Promise<boolean>;upload:(input:RelayInput)=>Promise<RelayResult>};
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export function makeRelayHandler(deps:Dependencies){
  return async(request:Request):Promise<Response>=>{
    if(request.method!=='POST'||new URL(request.url).search||request.headers.get('origin')!=='https://stage.lentaro.ru'
      ||request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')return reply({status:'FORBIDDEN'},403);
    let ownerId:string;
    try{ownerId=await deps.authorize(request);if(!ownerId)throw {};}catch{return reply({status:'OWNER_SESSION_REQUIRED'},401);}
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({status:'INVALID_INPUT'},415);
    let input:RelayInput;
    try{input=parseRelayInput(await readBoundedJson(request.body,1_350_000));}catch{return reply({status:'INVALID_INPUT'},422);}
    try{
      if(request.signal.aborted)return reply({status:'CANCELLED'},409);
      if(!await deps.claim(ownerId))return reply({status:'ALREADY_ATTEMPTED'},409);
      if(request.signal.aborted)return reply({status:'CANCELLED'},409);
      const result=await deps.upload(input);
      return reply({status:result.status,...(result.httpStatus!==undefined?{httpStatus:result.httpStatus}:{})});
    }catch{return reply({status:'UPSTREAM_UNCONFIRMED'},502);}
  };
}

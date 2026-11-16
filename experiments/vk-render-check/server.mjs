import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createVerifier,getOperationSpec} from './core.mjs';
import {renderPage} from './page.mjs';
const same=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function readJson(req){
 if(req.headers['content-type']?.split(';')[0]!=='application/json')throw {statusCode:415};
 return new Promise((resolve,reject)=>{let length=0,tooLarge=false;const chunks=[];req.on('data',chunk=>{length+=chunk.length;if(length>8192){tooLarge=true;chunks.length=0;}else if(!tooLarge)chunks.push(chunk);});req.on('end',()=>{if(tooLarge)return reject({statusCode:413});try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject({statusCode:400});}});req.on('error',()=>reject({statusCode:400}));});
}
export function createTestServer(config){
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(config.ownerKey))throw new Error('OWNER_CONFIG');
 const v=createVerifier(config);let session,sessionExpires=0;const rate=new Map();
 const cookieName='__Host-vk_owner';
 const server=createServer(async(req,res)=>{
  const nonce=randomBytes(18).toString('base64url');
  for(const [key,value]of Object.entries({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`}))res.setHeader(key,value);
  function json(status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  try{
   if(!req.url||req.url.length>35000)return json(414,{status:'INVALID_REQUEST'});
   const u=new URL(req.url,config.origin);const path=u.pathname;
   if(req.method==='GET'&&path==='/health'){const spec=getOperationSpec(config.operation);return json(200,{status:'ok',source:config.source??'unknown',vkConfigured:!!config.serviceToken,publicationMode:'LOCAL_SIGNED_ONE_SHOT',operation:spec.operation,imageMimeType:spec.mimeType,imageSha256:createHash('sha256').update(config.image).digest('hex')});}
   if(req.method==='GET'&&path==='/'&&!u.search){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(renderPage(nonce));}
   if(!['/api/login','/api/status','/api/start','/api/publish','/oauth/callback'].includes(path))return json(404,{status:'NOT_FOUND'});
   if(path!=='/oauth/callback'&&u.search)return json(400,{status:'INVALID_REQUEST'});
   const cookie=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   const ownerSession=typeof session==='string'&&Date.now()<sessionExpires&&same(cookie??'',session);
   const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):undefined;
   const controller=same(bearer??'',config.ownerKey);
   if(path==='/api/login'){
    if(req.method!=='POST')return json(405,{status:'METHOD_NOT_ALLOWED'});
    if(req.headers.origin!==config.origin)return json(403,{status:'ORIGIN_DENIED'});
    const bucket=req.socket.remoteAddress??'unknown';const stamp=Date.now();const prior=rate.get(bucket);const entry=prior&&stamp-prior.start<60_000?prior:{start:stamp,count:0};entry.count++;rate.set(bucket,entry);if(entry.count>20)return json(429,{status:'RATE_LIMIT'});
    const body=await readJson(req);if(!body||Object.keys(body).join(',')!=='key'||!same(body.key??'',config.ownerKey))return json(401,{status:'OWNER_REQUIRED'});
    session=randomBytes(32).toString('base64url');sessionExpires=stamp+30*60_000;res.setHeader('Set-Cookie',`${cookieName}=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1800`);return json(200,{status:'OWNER_RECOGNIZED'});
   }
   if(!ownerSession&&!controller)return json(401,{status:'OWNER_REQUIRED'});
   if(req.method==='GET'&&path==='/api/status')return json(200,v.status());
   if(req.method==='GET'&&path==='/oauth/callback'){
    if(!ownerSession)return json(401,{status:'OWNER_SESSION_REQUIRED'});
    await v.callback(session,u.searchParams);res.writeHead(303,{location:'/'});return res.end();
   }
   if(req.method!=='POST')return json(405,{status:'METHOD_NOT_ALLOWED'});
   if(!controller&&req.headers.origin!==config.origin)return json(403,{status:'ORIGIN_DENIED'});
   const body=await readJson(req);
   if(path==='/api/start'){
    if(!ownerSession||Object.keys(body??{}).length)return json(403,{status:'OWNER_SESSION_REQUIRED'});
    try{return json(200,{authorizationUrl:v.start(session)});}catch{return json(409,v.status());}
   }
   if(path==='/api/publish'){
    if(!controller)return json(403,{status:'LOCAL_CONTROLLER_REQUIRED'});
    try{return json(200,await v.publish(body));}catch{return json(409,{status:'PUBLICATION_DENIED',current:v.status()});}
   }
   return json(405,{status:'METHOD_NOT_ALLOWED'});
  }catch(error){if(!res.headersSent)json([400,413,415].includes(error?.statusCode)?error.statusCode:400,{status:'INVALID_REQUEST'});else res.end();}
 });
 server.requestTimeout=20_000;server.headersTimeout=15_000;server.keepAliveTimeout=5_000;server.maxHeadersCount=40;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const origin=process.env.RENDER_EXTERNAL_URL;const ownerKey=process.env.VK_CHECK_OWNER_KEY;const permitPublicKey=process.env.VK_CHECK_PERMIT_PUBLIC_KEY;
  const spec=getOperationSpec(process.env.VK_CHECK_OPERATION);
  const image=readFileSync(new URL('./'+spec.fixture,import.meta.url));
  const server=createTestServer({origin,ownerKey,permitPublicKey,serviceToken:process.env.VK_SERVICE_TOKEN||undefined,source:process.env.RENDER_GIT_COMMIT??'unknown',image,operation:spec.operation});
  server.listen(Number(process.env.PORT??10000),'0.0.0.0',()=>console.log('VK_CHECK_LISTENING'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
 }catch{console.error('VK_CHECK_CONFIG_INVALID');process.exitCode=1;}
}

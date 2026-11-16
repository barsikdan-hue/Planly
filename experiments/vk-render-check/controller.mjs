import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,openSync,closeSync,fsyncSync,lstatSync,existsSync} from 'node:fs';
import {join,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {OPERATION} from './core.mjs';
const configFile=dir=>join(dir,'config.json');
function loadConfig(dir){
 if(!isAbsolute(dir)||lstatSync(dir).isSymbolicLink()||lstatSync(configFile(dir)).isSymbolicLink())throw new Error('PRIVATE_PATH');
 const c=JSON.parse(readFileSync(configFile(dir),'utf8'));
 if(c.operation!==OPERATION||typeof c.ownerKey!=='string'||typeof c.privateKey!=='string'||typeof c.publicKey!=='string')throw new Error('PRIVATE_CONFIG');
 return c;
}
export function createPrivateConfig(dir){
 if(!isAbsolute(dir)||resolve(dir)!==dir)throw new Error('PRIVATE_PATH');
 mkdirSync(dir,{mode:0o700});const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const value={operation:OPERATION,ownerKey:randomBytes(32).toString('base64url'),publicKey:publicKey.export({type:'spki',format:'pem'}),privateKey:privateKey.export({type:'pkcs8',format:'pem'})};
 writeFileSync(configFile(dir),JSON.stringify(value),{flag:'wx',mode:0o600});return {status:'PRIVATE_CONFIG_CREATED'};
}
export function configureOrigin(dir,origin){
 if(!/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin))throw new Error('ORIGIN_CONFIG');
 if(existsSync(join(dir,'ATTEMPTED.json')))throw new Error('ALREADY_ATTEMPTED');
 const c=loadConfig(dir);if(c.origin&&c.origin!==origin)throw new Error('ORIGIN_ALREADY_BOUND');
 writeFileSync(configFile(dir),JSON.stringify({...c,origin}),{mode:0o600});return {status:'ORIGIN_BOUND',origin};
}
// For the Render connector only; CLI intentionally has no secret-printing/export mode.
export function publicEnvironment(dir){const c=loadConfig(dir);return [{key:'NODE_VERSION',value:'22.13.0'},{key:'VK_CHECK_OWNER_KEY',value:c.ownerKey},{key:'VK_CHECK_PERMIT_PUBLIC_KEY',value:c.publicKey}];}
function safeState(raw){
 const out={};const states=['READY_FOR_AUTH','SERVICE_TOKEN_REQUIRED','AWAITING_VK','AUTH_IN_PROGRESS','AUTH_FAILED','PERMISSIONS_VERIFIED','ATTEMPTED','OUTCOME_UNCONFIRMED','POST_CONFIRMED','PUBLICATION_DENIED'];
 out.status=states.includes(raw?.status)?raw.status:'OUTCOME_UNCONFIRMED';
 for(const field of ['reason','stage'])if(typeof raw?.[field]==='string'&&/^[A-Z0-9_]{1,64}$/.test(raw[field]))out[field]=raw[field];
 for(const field of ['identityMatches','attempted','credentialExpired'])if(typeof raw?.[field]==='boolean')out[field]=raw[field];
 if(raw?.scopes&&typeof raw.scopes.wall==='boolean'&&typeof raw.scopes.photos==='boolean')out.scopes={wall:raw.scopes.wall,photos:raw.scopes.photos};
 if(Number.isSafeInteger(raw?.vkErrorCode)&&raw.vkErrorCode>0&&raw.vkErrorCode<=9999)out.vkErrorCode=raw.vkErrorCode;
 if(typeof raw?.postUrl==='string'&&/^https:\/\/vk\.com\/wall-242095689_[1-9]\d*$/.test(raw.postUrl))out.postUrl=raw.postUrl;
 if(raw?.roles){out.roles={};for(const [k,choices]of Object.entries({isAdmin:['YES','NO','MISSING','INVALID'],adminLevel:['NONE','MODERATOR','EDITOR','ADMIN','MISSING','INVALID']}))if(choices.includes(raw.roles[k]))out.roles[k]=raw.roles[k];}
 if(raw?.diagnostic){out.diagnostic={};for(const [k,choices]of Object.entries({stage:['COMMUNITY_VALIDATION','GET_UPLOAD_SERVER','UPLOAD','UPLOAD_RESPONSE','SAVE_PHOTO','PHOTO_RECEIPT','WALL_POST'],photoReceiptReason:['RESPONSE_SHAPE','PHOTO_COUNT','PHOTO_ID_INVALID','PHOTO_OWNER_INVALID','PHOTO_OWNER_MISMATCH','PHOTO_ACCESS_KEY_PRESENT','DUPLICATE_ATTACHMENT'],uploadAttempt:['PRIMARY','FALLBACK'],networkErrorClass:['TIMEOUT','DNS','CONNECTION','TLS','OTHER']}))if(choices.includes(raw.diagnostic[k]))out.diagnostic[k]=raw.diagnostic[k];for(const k of ['vkErrorCode','uploadHttpStatus'])if(Number.isSafeInteger(raw.diagnostic[k]))out.diagnostic[k]=raw.diagnostic[k];}
 return out;
}
async function request(c,path,fetchImpl,body){
 if(!/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(c.origin??''))throw new Error('ORIGIN_CONFIG');
 const response=await fetchImpl(c.origin+path,{method:body?'POST':'GET',redirect:'error',headers:{authorization:`Bearer ${c.ownerKey}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body?150_000:90_000)});
 if(!response.ok)throw new Error('SERVER_REJECTED');return response.json();
}
export async function readStatus(dir,{fetchImpl=globalThis.fetch}={}){return safeState(await request(loadConfig(dir),'/api/status',fetchImpl));}
export async function publishOnce(dir,{fetchImpl=globalThis.fetch,now=Date.now}={}){
 const marker=join(dir,'ATTEMPTED.json');if(existsSync(marker))throw new Error('ALREADY_ATTEMPTED');
 const c=loadConfig(dir);const state=await request(c,'/api/status',fetchImpl);
 if(state.status!=='PERMISSIONS_VERIFIED'||state.attempted||typeof state.bootId!=='string'||typeof state.grantId!=='string'||state.expiresAt<=now())throw new Error('NOT_READY');
 const fields={operation:OPERATION,bootId:state.bootId,grantId:state.grantId,expiresAt:now()+45_000};
 let fd;try{fd=openSync(marker,'wx',0o600);}catch{throw new Error('ALREADY_ATTEMPTED');}
 try{writeFileSync(fd,JSON.stringify({operation:OPERATION,claimedAt:now(),bootId:state.bootId,grantId:state.grantId}));fsyncSync(fd);}finally{closeSync(fd);}
 if(process.platform!=='win32'){const parent=openSync(dir,'r');try{fsyncSync(parent);}finally{closeSync(parent);}}
 // Nothing after this point may automatically retry, including an HTTP rejection.
 const payload=Buffer.from(JSON.stringify(fields)).toString('base64url');const signature=sign(null,Buffer.from(payload),c.privateKey).toString('base64url');
 let result;try{result=safeState(await request(c,'/api/publish',fetchImpl,{payload,signature}));}catch{result={status:'OUTCOME_UNCONFIRMED',reason:'NO_RETRY_AFTER_LOCAL_CLAIM'};}
 writeFileSync(join(dir,'result.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,dir,arg]=process.argv.slice(2);
 try{
  if(mode==='init')console.log(JSON.stringify(createPrivateConfig(dir)));
  else if(mode==='origin')console.log(JSON.stringify(configureOrigin(dir,arg)));
  else if(mode==='status')console.log(JSON.stringify(await readStatus(dir)));
  else if(mode==='publish-once')console.log(JSON.stringify(await publishOnce(dir)));
  else if(mode==='open'){
   const c=loadConfig(dir);if(!c.origin)throw new Error('ORIGIN_CONFIG');
   execFileSync('python',['-c','import sys,webbrowser; webbrowser.open(sys.stdin.read().strip())'],{input:c.origin+'/#'+c.ownerKey,stdio:['pipe','ignore','ignore'],windowsHide:true});console.log('OWNER_BROWSER_OPENED');
  }else throw new Error('MODE');
 }catch(error){console.error(['ALREADY_ATTEMPTED','NOT_READY','ORIGIN_CONFIG','ORIGIN_ALREADY_BOUND','PRIVATE_CONFIG','PRIVATE_PATH','SERVER_REJECTED'].includes(error?.message)?error.message:'CONTROL_FAILED');process.exitCode=1;}
}

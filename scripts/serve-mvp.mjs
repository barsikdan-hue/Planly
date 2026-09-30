import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {localStore} from '../server/local-store.mjs';
import worker from '../dist/server/index.js';
const directory=process.env.PLANLY_DATA_DIR||'.data';
const store=await localStore(directory);
let key;try{key=await readFile(`${directory}/token.key`,'utf8')}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32).toString('base64');await writeFile(`${directory}/token.key`,key,{mode:0o600});}
const env={...store,TOKEN_KEY:key,SCHEDULER_MODE:'cron'};
const session=randomBytes(32).toString('hex');const pending=new Set();const ctx={waitUntil(promise){pending.add(promise);promise.catch(()=>console.error('Queue processing failed; check the journal.')).finally(()=>pending.delete(promise))}};
const port=Number(process.env.PORT||5173);const origin=`http://127.0.0.1:${port}`;
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end('Invalid host');return;}
  const url=new URL(req.url,origin);const headers=new Headers();for(const [name,value] of Object.entries(req.headers)){if(!name.startsWith('oai-authenticated-')&&value)headers.set(name,String(value));}
  if(url.pathname==='/signin-with-chatgpt'){res.writeHead(302,{'Set-Cookie':`planly_local=${session}; HttpOnly; SameSite=Strict; Path=/`,'Location':'/'});res.end();return;}
  if(url.pathname==='/signout-with-chatgpt'){res.writeHead(302,{'Set-Cookie':'planly_local=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/','Location':'/'});res.end();return;}
  if((req.headers.cookie||'').split(';').some(c=>c.trim()===`planly_local=${session}`)){headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','local@planly.local');}
  const init={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)){init.body=req;init.duplex='half';}
  const response=await worker.fetch(new Request(url,init),env,ctx);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Сервер недоступен.'}));}
});
const timer=setInterval(()=>ctx.waitUntil(worker.scheduled({},env,ctx)),15000);
server.listen(port,'127.0.0.1',()=>console.log(`Local: ${origin}\nLocal sign-in is device-only. Hosted sign-in is handled by Sites. Keep this server running for scheduled publications.`));
process.on('SIGINT',()=>{clearInterval(timer);server.close(async()=>{await Promise.allSettled([...pending]);store.close();process.exit()})});

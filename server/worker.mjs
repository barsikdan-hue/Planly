import {api,processDue} from './api.mjs';
import assets from 'virtual:planly-assets';
export default {
 async fetch(request,env,ctx){
   const path=new URL(request.url).pathname;
   if(path.startsWith('/api/'))return api(request,env,ctx);
   const asset=assets[path==='/'?'/index.html':path];
   if(!asset)return new Response('Not found',{status:404});
   return new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'"}});
 },
 async scheduled(_event,env,ctx){ctx.waitUntil(processDue(env));}
};

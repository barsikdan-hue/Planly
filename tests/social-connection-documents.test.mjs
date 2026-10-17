import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as docs from '../lib/server/social-connections/documents.ts';
const ticket='a'.repeat(43), evil='<img src=x onerror=alert(1)>',origin='https://planly.example.test';
const consent={planlyName:evil,accountId:'account-1',accountHint:'Planly • abcd123456',provider:'TELEGRAM',humanId:'42',humanName:evil,destinationId:'-12345',destinationName:evil,expiresAt:new Date(Date.now()+60000).toISOString()};
for(const [name,build,control] of [
 ['finish',()=>docs.buildSocialConnectionFinish(),'button id="confirm"'],
 ['telegram Mini App',()=>docs.buildSocialConnectionMiniApp('telegram',true),'label'],
 ['max Mini App',()=>docs.buildSocialConnectionMiniApp('max',true),'label'],
])test(`${name} emitted consent document warns against forwarding before the consent control`,async()=>{
 const html=await build().text();
 assert.ok(html.includes(`<p>Не пересылайте подтверждение другим людям.</p><${control}`));
});
async function execute(response,{fragment='#'+ticket,provider,fail=false,deferred=false}={}) {
 const html=await response.text(),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]),events={},elements={},calls=[],opened=[],resources=[];
 assert.ok(scripts.length);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 for(const script of scripts)assert.ok(response.headers.get('content-security-policy').includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`));
 assert.equal(html.includes(ticket),false);
 function el(id){return elements[id]??=( {textContent:'',disabled:true,checked:false,hidden:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},set innerHTML(_){throw new Error('HTML injection');}});}
 const location={hash:fragment,search:'?must=clear',pathname:'/social-connections/finish',origin},history={replaceState(_a,_b,url){assert.equal(url,location.pathname);location.hash='';location.search='';}};
 let release;const wait=new Promise(r=>release=r);
 const bridge={initData:'signed synthetic raw',get initDataUnsafe(){throw new Error('unsigned identity forbidden');},openLink(url){opened.push(url);}};
 const context={location,history,URL,Date,TextEncoder,AbortController,console:new Proxy({},{get(){throw new Error('logging forbidden');}}),
  document:{getElementById:el,addEventListener(name,fn){events[name]=fn;},createElement(){return {};},head:{appendChild(node){resources.push(node.src);throw new Error('external SDK forbidden in fixture');}}},
  addEventListener(name,fn){events[name]=fn;},fetch:async(url,options)=>{
   assert.equal(location.hash,'');assert.equal(location.search,'');calls.push({url,options,body:JSON.parse(options.body)});
   if(deferred)await wait;
   return {ok:!fail,json:async()=>url.endsWith('/proof')?{ticket,...consent}:url.endsWith('/confirm')?{state:'VERIFIED_DISABLED'}:consent};
  }};
 Object.defineProperty(context,'localStorage',{get(){throw new Error('storage forbidden');}});Object.defineProperty(context,'sessionStorage',{get(){throw new Error('storage forbidden');}});
 context.window=context;if(provider==='telegram')context.Telegram={WebApp:bridge};if(provider==='max')context.WebApp=bridge;
 vm.createContext(context);for(const script of scripts)vm.runInContext(script,context);
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
 events.DOMContentLoaded?.();await flush();
 return {html,elements,calls,opened,resources,location,events,release,flush,click:async(id,trusted=true)=>{const result=el(id).handlers.click?.({isTrusted:trusted});await result;await flush();}};
}
test('actual finish first script clears fragment before fetch; preview cannot confirm; click uses safe text and original cookie',async()=>{
 assert.ok(docs,'production raw document builder must exist');const page=await execute(docs.buildSocialConnectionFinish());
 assert.equal(page.calls.length,1);assert.equal(page.calls[0].url,'/api/social-connections/preview');assert.deepEqual(page.calls[0].body,{ticket});assert.equal(page.calls[0].options.credentials,'same-origin');
 assert.ok(page.elements.details.textContent.includes(evil));assert.ok(page.elements.details.textContent.includes('-12345'));assert.ok(page.elements.details.textContent.includes('42'));assert.ok(page.elements.details.textContent.includes('account-1'));
 assert.equal(page.elements.confirm.disabled,false);await page.click('confirm',false);assert.equal(page.calls.length,1);
 await page.click('confirm');assert.equal(page.calls.length,2);assert.equal(page.calls[1].url,'/api/social-connections/confirm');assert.deepEqual(page.calls[1].body,{ticket});assert.match(page.elements.status.textContent,/выключено/);
 await page.click('confirm');assert.equal(page.calls.length,2);assert.ok(page.html.includes('href="/"'));assert.ok(page.html.includes('Вернуться в Planly'));assert.equal(page.resources.length,0);
});
for(const reason of ['missing','invalid','denied','pagehide'])test(`finish ${reason} loses credential and requires original Planly restart`,async()=>{
 assert.ok(docs);const page=await execute(docs.buildSocialConnectionFinish(),{fragment:reason==='missing'?'':reason==='invalid'?'#evil':'#'+ticket,fail:reason==='denied',deferred:reason==='pagehide'});
 if(reason==='pagehide'){page.events.pagehide();page.release();await page.flush();}
 await page.click('confirm');assert.equal(page.calls.filter(c=>c.url.endsWith('/confirm')).length,0);assert.equal(page.elements.confirm.disabled,true);
 if(reason!=='pagehide')assert.match(page.elements.status.textContent,/заново/);
});
for(const provider of ['telegram','max'])test(`${provider} actual bridge adapter validates raw proof then synchronous consent click opens only first-party finish`,async()=>{
 assert.ok(docs);const page=await execute(docs.buildSocialConnectionMiniApp(provider,true),{provider});
 assert.equal(page.calls.length,1);assert.equal(page.calls[0].url,`/api/social-connections/providers/${provider}/proof`);assert.deepEqual(page.calls[0].body,{initData:'signed synthetic raw'});assert.equal(page.calls[0].options.credentials,'omit');
 assert.equal(page.opened.length,0);assert.ok(page.elements.details.textContent.includes('Planly • abcd123456'));assert.equal(page.elements.details.textContent.includes('account-1'),false);
 await page.click('continue');assert.equal(page.opened.length,0);page.elements.consent.checked=true;
 // Native bridge openLink must happen before the click handler returns a promise.
 const result=page.elements.continue.handlers.click({isTrusted:true});assert.equal(result,undefined);assert.deepEqual(page.opened,[origin+'/social-connections/finish#'+ticket]);
 await page.click('continue');assert.equal(page.opened.length,1);assert.equal(page.resources.length,0);
});
test('unconfigured Mini App makes no proof or SDK request even when a bridge exists',async()=>{
 assert.ok(docs);const page=await execute(docs.buildSocialConnectionMiniApp('telegram',false),{provider:'telegram'});assert.equal(page.calls.length,0);assert.equal(page.resources.length,0);assert.match(page.elements.status.textContent,/недоступно/);
});
test('lost Mini App proof cannot open from an old pending response after pagehide',async()=>{
 assert.ok(docs);const page=await execute(docs.buildSocialConnectionMiniApp('max',true),{provider:'max',deferred:true});page.events.pagehide();page.release();await page.flush();page.elements.consent.checked=true;await page.click('continue');assert.equal(page.opened.length,0);
});

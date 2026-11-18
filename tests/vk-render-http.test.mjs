import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createTestServer} from '../experiments/vk-render-check/server.mjs';
const {publicKey}=generateKeyPairSync('ed25519');
async function fixture(fn,config={}){
 let calls=0;const server=createTestServer({origin:'https://vk-check.example',ownerKey:'a'.repeat(43),permitPublicKey:publicKey.export({type:'spki',format:'pem'}),serviceToken:undefined,source:'test-source',image:new Uint8Array([137,80,78,71,13,10,26,10,1]),fetchImpl:async()=>{calls++;throw new Error('NO_REAL_PROVIDER');},...config});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{await fn({server,base,calls:()=>calls});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('health is public, explicit about missing config, and makes zero provider calls',()=>fixture(async({base,calls})=>{const r=await fetch(base+'/health');assert.equal(r.status,200);const v=await r.json();assert.equal(v.status,'ok');assert.equal(v.vkConfigured,false);assert.equal(v.source,'test-source');assert.equal(calls(),0);}));
test('status and publication reject anonymous callers before reading sensitive state',()=>fixture(async({base,calls})=>{for(const path of ['/api/status','/api/publish']){const r=await fetch(base+path,{method:path.endsWith('publish')?'POST':'GET'});assert.equal(r.status,401);}assert.equal(calls(),0);}));
test('owner login is exact-origin POST only, no query keys, secure cookie and no echoed key',()=>fixture(async({base})=>{
 for(const origin of [undefined,'https://evil.example']){const r=await fetch(base+'/api/login',{method:'POST',headers:{...(origin?{origin}:{}),'content-type':'application/json'},body:JSON.stringify({key:'a'.repeat(43)})});assert.equal(r.status,403);}
 const r=await fetch(base+'/api/login',{method:'POST',headers:{origin:'https://vk-check.example','content-type':'application/json'},body:JSON.stringify({key:'a'.repeat(43)})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/__Host-vk_owner=/);assert.equal((await r.text()).includes('a'.repeat(43)),false);
 const state=await fetch(base+'/api/status',{headers:{cookie:cookie.split(';')[0]}});assert.equal(state.status,200);assert.equal((await state.json()).status,'SERVICE_TOKEN_REQUIRED');
}));
test('unknown endpoints and OAuth callback without owner are denied, no raw errors',()=>fixture(async({base,calls})=>{const r=await fetch(base+'/oauth/callback?code=PRIVATE_CODE&state=PRIVATE_STATE&device_id=PRIVATE_DEVICE',{redirect:'manual'});assert.equal(r.status,401);assert.equal((await r.text()).includes('PRIVATE'),false);assert.equal((await fetch(base+'/anything')).status,404);assert.equal(calls(),0);}));
test('public page removes fragment before exchange, has no external code, publishes nothing',()=>fixture(async({base,calls})=>{const r=await fetch(base+'/');const html=await r.text();assert.ok(html.includes('history.replaceState'));assert.equal(html.includes('https://cdn'),false);assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(calls(),0);}));
test('oversized or malformed login body is bounded and closed',()=>fixture(async({base})=>{for(const body of ['{',JSON.stringify({key:'a'.repeat(20000)})]){const r=await fetch(base+'/api/login',{method:'POST',headers:{origin:'https://vk-check.example','content-type':'application/json'},body});assert.ok([400,413].includes(r.status));assert.equal((await r.text()).includes('SyntaxError'),false);}}));

test('read-only health/page and HTTP fence forbid publication and arbitrary diagnostic inputs',()=>fixture(async({base,calls})=>{
 assert.equal((await(await fetch(base+'/health')).json()).publicationMode,'READ_ONLY_EXISTING_POSTS');
 const page=await(await fetch(base+'/')).text();assert.ok(page.includes('Чтение существующих постов'));assert.ok(page.includes('Загрузка и создание публикаций заблокированы'));assert.equal(page.includes('Одна тестовая публикация выполняется'),false);
 const headers={authorization:`Bearer ${'a'.repeat(43)}`,'content-type':'application/json'};
 assert.equal((await fetch(base+'/api/publish',{method:'POST',headers,body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/readback-existing',{method:'POST',headers,body:JSON.stringify({postId:999})})).status,400);
 assert.equal((await fetch(base+'/api/readback-existing',{method:'POST',headers,body:'{}'})).status,409);
 assert.equal((await fetch(base+'/api/readback-existing',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);assert.equal(calls(),0);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{origin:'https://vk-check.example','content-type':'application/json'},body:JSON.stringify({key:'a'.repeat(43)})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/readback-existing',{method:'POST',headers:{cookie,origin:'https://vk-check.example','content-type':'application/json'},body:'{}'})).status,403);assert.equal(calls(),0);
},{readbackOnly:true}));

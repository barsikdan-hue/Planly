import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {localStore} from '../server/local-store.mjs';
import {api,processDue} from '../server/api.mjs';
import {encrypt,decrypt} from '../server/crypto.mjs';
import {publish} from '../server/social.mjs';
const key=Buffer.alloc(32,17).toString('base64');
test('MVP: durable storage, ownership, validation and queue safety',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'planly-test-'));let store=await localStore(directory);let env={...store,TOKEN_KEY:key};const waiting=[];const ctx={waitUntil(p){waiting.push(p)}};
 const call=(route,method='GET',value,owner='alice',extra={})=>api(new Request('https://planly.test'+route,{method,headers:{...(owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':`${owner}@test.local`}:{}),Origin:'https://planly.test','X-Planly-Request':'1','Content-Type':'application/json',...extra},...(value===undefined?{}:{body:JSON.stringify(value)})}),env,ctx);
 const read=async owner=>(await call('/api/state','GET',undefined,owner)).json();
 const draft={id:'test-draft',text:'Первая идея',title:'Мой пост',status:'draft',networks:[],date:new Date(Date.now()+3600000).toISOString()};
 const originalFetch=globalThis.fetch;
 try{
  await t.test('anonymous and cross-origin writes rejected',async()=>{
    assert.equal((await call('/api/state','GET',undefined,null)).status,401);
    assert.equal((await call('/api/posts','POST',draft,'alice',{Origin:'https://attacker.test'})).status,403);
  });
  await t.test('draft persists in SQLite and remains isolated by owner',async()=>{
    assert.equal((await call('/api/posts','POST',draft)).status,201);
    assert.equal((await read('alice')).posts.length,1);assert.equal((await read('bob')).posts.length,0);
    assert.equal((await call('/api/posts/test-draft','DELETE',undefined,'bob')).status,404);
    store.close();store=await localStore(directory);env={...store,TOKEN_KEY:key};assert.equal((await read('alice')).posts[0].text,draft.text);
  });
  await t.test('stale edits and unconnected scheduling rejected',async()=>{
    assert.equal((await call('/api/posts','POST',{...draft,revision:0})).status,409);
    assert.equal((await call('/api/posts','POST',{...draft,revision:1,text:'Обновлено'})).status,201);
    assert.equal((await read('alice')).posts[0].revision,2);
    assert.equal((await call('/api/posts','POST',{...draft,id:'bad',status:'scheduled',networks:['Telegram']})).status,400);
    assert.equal((await call('/api/posts','POST',{...draft,id:'bad',date:'wrong'})).status,400);
  });
  await t.test('tokens encrypted and excluded from state; providers mocked only',async()=>{
    const ciphertext=await encrypt('fake-secret',key);assert.notEqual(ciphertext,'fake-secret');assert.equal(await decrypt(ciphertext,key),'fake-secret');
    await env.DB.prepare('INSERT INTO accounts(owner,network,target,label,secret) VALUES(?,?,?,?,?)').bind('alice','Telegram','-123','Test channel',ciphertext).run();
    await env.DB.prepare('INSERT INTO accounts(owner,network,target,label,secret) VALUES(?,?,?,?,?)').bind('alice','VK','-456','Test VK',ciphertext).run();
    assert.ok(!JSON.stringify(await read('alice')).includes('fake-secret'));assert.ok(!JSON.stringify(await read('alice')).includes(ciphertext));
  });
  await t.test('parallel workers send each destination once and preserve partial success',async()=>{
    let telegramCalls=0,vkCalls=0;
    globalThis.fetch=async url=>{if(String(url).includes('telegram')){telegramCalls++;return Response.json({ok:true,result:{message_id:123}})}vkCalls++;return Response.json({error:{error_code:15}})};
    assert.equal((await call('/api/posts','POST',{...draft,id:'queued',status:'scheduled',networks:['Telegram','VK']})).status,201);await Promise.all(waiting.splice(0));
    assert.equal((await call('/api/accounts/Telegram','DELETE')).status,409);
    await env.DB.prepare('UPDATE deliveries SET due=? WHERE post_id=?').bind(new Date(Date.now()-1000).toISOString(),'queued').run();
    await Promise.all([processDue(env,'alice'),processDue(env,'alice')]);
    assert.equal(telegramCalls,1);assert.equal(vkCalls,1);
    const s=await read('alice');assert.equal(s.posts.find(p=>p.id==='queued').status,'error');assert.equal(s.deliveries.filter(d=>d.status==='sent').length,1);
    const failed=s.deliveries.find(d=>d.status==='failed');
    globalThis.fetch=async()=>{vkCalls++;return Response.json({response:{post_id:321}})};
    assert.equal((await call('/api/retry/'+failed.id,'POST',{})).status,200);await Promise.all(waiting.splice(0));
    assert.equal(telegramCalls,1);assert.equal(vkCalls,2);assert.equal((await read('alice')).posts.find(p=>p.id==='queued').status,'published');
    assert.equal((await call('/api/posts','POST',{...draft,id:'queued',revision:1})).status,409);
  });
  await t.test('lost provider response becomes unknown and requires explicit confirmation',async()=>{
    globalThis.fetch=async()=>{throw new Error('network disconnected')};
    await call('/api/posts','POST',{...draft,id:'uncertain',status:'scheduled',networks:['Telegram']});await Promise.all(waiting.splice(0));
    await env.DB.prepare('UPDATE deliveries SET due=? WHERE post_id=?').bind(new Date(Date.now()-1000).toISOString(),'uncertain').run();await processDue(env,'alice');
    const d=(await read('alice')).deliveries.find(d=>d.post_id==='uncertain');assert.equal(d.status,'unknown');assert.equal((await call('/api/retry/'+d.id,'POST',{})).status,400);
    await processDue(env,'alice');assert.equal((await read('alice')).deliveries.find(x=>x.id===d.id).status,'unknown');
  });
  await t.test('media upload and private download; linked files protected',async()=>{
    const bytes=Uint8Array.from([137,80,78,71,13,10,26,10]);
    const response=await api(new Request('https://planly.test/api/media',{method:'POST',headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@test.local',Origin:'https://planly.test','X-Planly-Request':'1','Content-Type':'image/png','X-File-Name':'test.png'},body:bytes}),env,ctx);
    assert.equal(response.status,201);const {id}=await response.json();
    assert.equal((await call('/api/media/'+id,'GET',undefined,'bob')).status,404);
    assert.deepEqual(new Uint8Array(await (await call('/api/media/'+id)).arrayBuffer()),bytes);
    await call('/api/posts','POST',{...draft,id:'with-media',media:{id}});
    assert.equal((await call('/api/media/'+id,'DELETE')).status,409);
    assert.equal((await call('/api/posts/with-media','DELETE')).status,200);assert.equal((await call('/api/media/'+id,'DELETE')).status,200);
  });
  await t.test('Instagram container completes before publication',async()=>{
    const calls=[];globalThis.fetch=async(url,init)=>{calls.push([String(url),init.method]);return Response.json(String(url).includes('media_publish')?{id:'ig-post'}:String(url).includes('status_code')?{status_code:'FINISHED'}:{id:'container'})};
    assert.equal(await publish('Instagram','fake','123',{public_url:'https://example.com/photo.jpg',body:'caption'},null,env,'delivery'),'ig-post');assert.equal(calls.length,3);assert.ok(calls[2][0].includes('media_publish'));
  });
 }finally{globalThis.fetch=originalFetch;await Promise.allSettled(waiting);store.close();await rm(directory,{recursive:true,force:true});}
});

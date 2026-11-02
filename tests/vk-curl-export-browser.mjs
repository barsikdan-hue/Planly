// Completely intercepted synthetic origins. No staging, VK or provider access.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {GET as exportWindowResponse} from '../app/social-connections/vk-curl-export/route.ts';
import {uploadWindowResponse} from '../lib/server/vk/upload-window-document.ts';
import {ORIGIN} from '../public/vk-upload-window-core.mjs';
import {DIAGNOSTIC_OPERATION} from '../public/vk-upload-diagnostic.mjs';
const tiny='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxLQAAAAASUVORK5CYII=';
const fixture=`<!doctype html><button id="check">Проверить сессию iframe</button><button id="start">Открыть окно Planly</button><p id="admission"></p><p id="result"></p><script type="module">
import {openFirstPartyUpload} from '/first-party-upload.mjs';
check.onclick=async()=>{admission.textContent=String((await fetch('/api/social-accounts/vk/upload-test')).status);};
start.onclick=async()=>{const flow=openFirstPartyUpload({windowPath:'/social-connections/vk-curl-export'});const image=new Blob([Uint8Array.from(atob('${tiny}'),x=>x.charCodeAt(0))],{type:'image/png'});
result.textContent=JSON.stringify(await flow.run({active:()=>true,image,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=synthetic'}));};
</script>`;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();let posts=0,unexpected=0;
 await context.addInitScript(()=>{window.showSaveFilePicker=async()=>({name:'vk-curl-address.json',createWritable:async()=>({write:async value=>{window.syntheticExport=value;},close:async()=>{},abort:async()=>{window.syntheticExport=null;}})});});
 await context.addCookies([{name:'synthetic_session',value:'test-only',url:ORIGIN,httpOnly:true,secure:true,sameSite:'Lax'}]);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin==='https://vk.example.test')return route.fulfill({contentType:'text/html',body:`<iframe id="miniapp" src="${ORIGIN}/fixture"></iframe>`});
  if(url.origin!==ORIGIN){unexpected++;return route.abort();}
  if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
  const files={'/first-party-upload.mjs':'experiments/vk-miniapp-probe/first-party-upload.mjs',
   '/public/vk-upload-window-core.mjs':'public/vk-upload-window-core.mjs','/single-photo-test.mjs':'experiments/vk-miniapp-probe/single-photo-test.mjs',
   '/vk-upload-window-core.mjs':'public/vk-upload-window-core.mjs','/vk-upload-window.mjs':'public/vk-upload-window.mjs',
   '/vk-upload-diagnostic.mjs':'public/vk-upload-diagnostic.mjs','/public/vk-upload-diagnostic.mjs':'public/vk-upload-diagnostic.mjs'};
  files['/vk-curl-export-window.mjs']='public/vk-curl-export-window.mjs';files['/vk-curl-export-core.mjs']='public/vk-curl-export-core.mjs';
  if(url.pathname==='/social-connections/vk-curl-export'){const response=exportWindowResponse();return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:await response.text()});}
  if(files[url.pathname])return route.fulfill({contentType:'text/javascript',body:await readFile(files[url.pathname],'utf8')});
  if(url.pathname==='/social-connections/vk-upload-test'){
   const response=uploadWindowResponse();return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.pathname==='/api/social-accounts/vk/upload-test'){
   const owner=(await request.allHeaders()).cookie?.includes('synthetic_session=test-only');
   if(!owner)return route.fulfill({status:401,json:{status:'OWNER_SESSION_REQUIRED'}});
   if(request.method()==='GET')return route.fulfill({json:{status:'OWNER_SESSION_RECOGNIZED'}});
   assert.equal(request.method(),'POST');assert.deepEqual(Object.keys(request.postDataJSON()).sort(),['groupId','imageBase64','uploadUrl']);
   assert.equal((await request.allHeaders())['x-planly-vk-diagnostic'],DIAGNOSTIC_OPERATION);
   posts++;return route.fulfill({json:{status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION',private:'SECRET_DO_NOT_SHOW'}}});
  }
  unexpected++;return route.abort();
 });
 const page=await context.newPage();await page.goto('https://vk.example.test/');
 const frame=page.frameLocator('#miniapp');
 const opened=page.waitForEvent('popup');await frame.locator('#start').click();const popup=await opened;
 await popup.waitForFunction(()=>!document.querySelector('#confirm').disabled);
 await popup.evaluate(()=>document.querySelector('#confirm').click());
 assert.equal(await popup.evaluate(()=>window.syntheticExport),undefined);
 await popup.getByRole('button',{name:'Выбрать закрытую папку и сохранить адрес'}).click();
 await popup.getByText('Адрес сохранён. Загрузок и публикаций не было.',{exact:true}).waitFor();
 const exported=JSON.parse(await popup.evaluate(()=>window.syntheticExport));
 assert.deepEqual(Object.keys(exported).sort(),['exportedAt','uploadUrl']);
 assert.equal(exported.uploadUrl,'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=synthetic');
 assert.equal(posts,0);
 assert.equal((await popup.locator('body').innerText()).includes('hash=synthetic'),false);
 const again=page.waitForEvent('popup');await frame.locator('#start').click();const second=await again;
 await second.waitForFunction(()=>!document.querySelector('#confirm').disabled);
 await second.getByRole('button',{name:'Выбрать закрытую папку и сохранить адрес'}).click();
 await second.getByText('Состояние: ALREADY_ATTEMPTED',{exact:true}).waitFor();
 assert.equal(await second.evaluate(()=>window.syntheticExport),undefined);
 assert.equal(posts,0);assert.equal(unexpected,0);
 console.log(JSON.stringify({status:'SYNTHETIC_EXPORT_PASS',trustedExport:true,repeatBlocked:true,uploadPosts:posts,providerCalls:0}));
 await context.close();
}finally{await browser.close();}

// Completely intercepted synthetic origins. No staging, VK or provider access.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {uploadWindowResponse} from '../lib/server/vk/upload-window-document.ts';
import {ORIGIN,OPERATION} from '../public/vk-upload-window-core.mjs';
import {DIAGNOSTIC_OPERATION} from '../public/vk-upload-diagnostic.mjs';
const tiny='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxLQAAAAASUVORK5CYII=';
const fixture=`<!doctype html><button id="check">Проверить сессию iframe</button><button id="start">Открыть окно Planly</button><p id="admission"></p><p id="result"></p><script type="module">
import {openFirstPartyUpload} from '/first-party-upload.mjs';
check.onclick=async()=>{admission.textContent=String((await fetch('/api/social-accounts/vk/upload-test')).status);};
start.onclick=async()=>{const flow=openFirstPartyUpload();const image=new Blob([Uint8Array.from(atob('${tiny}'),x=>x.charCodeAt(0))],{type:'image/png'});
result.textContent=JSON.stringify(await flow.run({active:()=>true,image,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=synthetic'}));};
</script>`;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();let posts=0,unexpected=0;
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
 const frame=page.frameLocator('#miniapp');await frame.locator('#check').click();await frame.locator('#admission').getByText('401',{exact:true}).waitFor();
 const opened=page.waitForEvent('popup');await frame.locator('#start').click();const popup=await opened;
 await popup.getByRole('button',{name:'Подтвердить одну загрузку без поста'}).waitFor();
 await popup.waitForFunction(()=>!document.querySelector('#confirm').disabled);
 assert.equal(posts,0);
 await popup.evaluate(()=>document.querySelector('#confirm').click());assert.equal(posts,0);
 await mkdir('test-results/vk-first-party',{recursive:true});await popup.screenshot({path:'test-results/vk-first-party/preview.png'});
 await popup.getByRole('button',{name:'Подтвердить одну загрузку без поста'}).click();
 await popup.getByText(/Загрузчик отклонил запрос.*HTTP=405.*POST по Allow: NO/).waitFor();
 await frame.locator('#result').filter({hasText:'UPSTREAM_HTTP_REJECTED'}).waitFor();assert.equal(posts,1);
 assert.equal((await popup.locator('body').innerText()).includes('SECRET_DO_NOT_SHOW'),false);
 assert.equal((await frame.locator('#result').innerText()).includes('SECRET_DO_NOT_SHOW'),false);
 assert.equal(await popup.evaluate(key=>localStorage.getItem(key),OPERATION),'ATTEMPTED');
 const again=page.waitForEvent('popup');await frame.locator('#start').click();const second=await again;
 await second.waitForFunction(()=>!document.querySelector('#confirm').disabled);
 await second.getByRole('button',{name:'Подтвердить одну загрузку без поста'}).click();
 await second.getByText('Эта операция уже запускалась. Повтор запрещён.',{exact:true}).waitFor();assert.equal(posts,1);
 const thirdOpened=page.waitForEvent('popup');await frame.locator('#start').click();const third=await thirdOpened;
 await third.waitForFunction(()=>!document.querySelector('#confirm').disabled);
 const sourceFrame=page.frames().find(f=>f.url()===ORIGIN+'/fixture');assert.ok(sourceFrame);
 await sourceFrame.goto(ORIGIN+'/fixture');
 await third.getByRole('button',{name:'Подтвердить одну загрузку без поста'}).click();
 await third.getByText('Проверка отменена. Если отправка уже началась, повторять её нельзя.',{exact:true}).waitFor();assert.equal(posts,1);
 assert.equal(unexpected,0);console.log(JSON.stringify({status:'SYNTHETIC_BROWSER_PASS',iframeAdmission:401,explicitUploads:posts,safe405Metadata:true,repeatBlocked:true,staleOpenerBlocked:true,providerCalls:0}));
 await context.close();
}finally{await browser.close();}

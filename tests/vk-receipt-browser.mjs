// All origins are intercepted. No staging/VK/provider traffic or real credentials.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {receiptWindowResponse} from '../lib/server/vk/upload-window-document.ts';
import {RECEIPT_OPERATION,RECEIPT_POST_OPERATION,RECEIPT_ENDPOINT,RECEIPT_WINDOW_PATH} from '../public/vk-upload-receipt.mjs';
const ORIGIN='https://stage.lentaro.ru';
const token='synthetic-vk-token-never-exported',photo='private-receipt-photo',hash='private-receipt-hash';
const bridge=`const token=${JSON.stringify(token)};globalThis.receiptTestSummary={saves:0,posts:0};export default {send:async(method,p)=>{
if(method==='VKWebAppInit')return {};
if(method==='VKWebAppGetAuthToken')return {access_token:token,scope:'wall,photos,groups'};
if(p.params.access_token!==token)throw Error('Missing synthetic grant');
if(p.method==='groups.get')return {response:{count:1,items:[242095689]}};
if(p.method==='photos.getWallUploadServer')return {response:{upload_url:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=synthetic',user_id:123,group_id:242095689}};
if(p.method==='photos.saveWallPhoto'){if(p.params.photo!==${JSON.stringify(photo)}||p.params.hash!==${JSON.stringify(hash)})throw Error('Wrong receipt');receiptTestSummary.saves++;return {response:[{id:7,owner_id:123}]};}
if(p.method==='wall.post'){if(p.params.guid!==${JSON.stringify(RECEIPT_POST_OPERATION)}||p.params.attachments!=='photo123_7')throw Error('Wrong publication');receiptTestSummary.posts++;return {response:{post_id:8}};}
throw Error('Unexpected synthetic API method');}};`;
const browser=await chromium.launch({headless:true});
try{
  for(const scenario of ['success','http405']){
  const context=await browser.newContext();let uploads=0,unexpected=0;
  await context.addCookies([{name:'synthetic_owner',value:'fixture-only',url:ORIGIN,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await context.addInitScript(()=>{
    if(location.origin==='https://stage.lentaro.ru'){
      localStorage.setItem('planly-vk-newphoto-20261029-01','ATTEMPTED');
      localStorage.setItem('planly-vk-newphoto-20261106-01','ATTEMPTED');
    }
  });
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(url.href.includes(token),false);
    if(url.origin==='https://vk.example.test')return route.fulfill({contentType:'text/html',body:`<iframe id="miniapp" src="${ORIGIN}/vk-miniapp-probe/?vk_app_id=54809413"></iframe>`});
    if(url.origin!==ORIGIN){unexpected++;return route.abort();}
    if(url.pathname==='/fake-bridge.mjs')return route.fulfill({contentType:'text/javascript',body:bridge});
    if(url.pathname==='/vk-miniapp-probe/'){
      const body=(await readFile('experiments/vk-miniapp-probe/index.html','utf8')).replace('src="./app.js"','src="./main.mjs"');
      return route.fulfill({contentType:'text/html',body});
    }
    if(/^\/vk-miniapp-probe\/[a-z-]+\.mjs$/.test(url.pathname)){
      let body=await readFile('experiments'+url.pathname,'utf8');
      if(url.pathname.endsWith('/main.mjs'))body=body.replace("from '@vkontakte/vk-bridge'","from '/fake-bridge.mjs'");
      return route.fulfill({contentType:'text/javascript',body});
    }
    if(/^\/(?:public\/)?vk-[a-z-]+\.mjs$/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:await readFile('public/'+url.pathname.split('/').at(-1),'utf8')});
    if(url.pathname==='/vk-miniapp-probe/style.css')return route.fulfill({contentType:'text/css',body:await readFile('experiments/vk-miniapp-probe/style.css','utf8')});
    if(url.pathname===RECEIPT_WINDOW_PATH){const response=receiptWindowResponse();return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:await response.text()});}
    if(url.pathname===RECEIPT_ENDPOINT){
      const headers=await request.allHeaders();
      if(!headers.cookie?.includes('synthetic_owner=fixture-only'))return route.fulfill({status:401,json:{status:'OWNER_SESSION_REQUIRED'}});
      if(request.method()==='GET')return route.fulfill({json:{status:'OWNER_SESSION_RECOGNIZED'}});
      assert.equal(request.method(),'POST');assert.equal(headers['x-planly-vk-diagnostic'],RECEIPT_OPERATION);
      const body=request.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['groupId','imageBase64','uploadUrl']);
      assert.equal(JSON.stringify(body).includes(token),false);assert.equal(body.groupId,242095689);uploads++;
      if(scenario==='http405')return route.fulfill({json:{status:'UPSTREAM_HTTP_REJECTED',httpStatus:405,diagnostic:{allowPost:'NO',contentType:'HTML',body:'METHOD_REJECTION'},receipt:{server:1,photo,hash},raw:token}});
      return route.fulfill({json:{status:'UPLOAD_CONFIRMED',httpStatus:200,receipt:{server:1,photo,hash},raw:'discard-this'}});
    }
    unexpected++;return route.abort();
  });
  const page=await context.newPage();await page.goto('https://vk.example.test');
  const frame=page.frameLocator('#miniapp');
  await frame.getByRole('button',{name:'1. Запросить права VK',exact:true}).click();
  await frame.getByRole('button',{name:'2. Проверить доступ к фото',exact:true}).click();
  await frame.locator('#publish-test').waitFor({state:'visible'});
  const popupPromise=context.waitForEvent('page');await frame.locator('#publish-test').click();const popup=await popupPromise;
  await popup.locator('#confirm:enabled').waitFor();assert.equal(uploads,0);
  await popup.locator('#confirm').evaluate(button=>button.click());await popup.waitForTimeout(50);assert.equal(uploads,0);
  await popup.getByRole('button',{name:'Подтвердить загрузку и один пост',exact:true}).click();
  if(scenario==='success'){
    await frame.locator('#post-receipt').waitFor({state:'visible'});
    assert.equal(await frame.locator('#post-receipt').getAttribute('href'),'https://vk.ru/wall-242095689_8');
  }else{
    await frame.getByText(/Сервер: UPSTREAM_HTTP_REJECTED; HTTP=405/).waitFor();
    assert.equal(await frame.locator('#post-receipt').getAttribute('href'),null);
  }
  assert.equal(uploads,1);assert.equal(unexpected,0);
  const summary=await frame.locator('body').evaluate(()=>globalThis.receiptTestSummary);
  assert.deepEqual(summary,scenario==='success'?{saves:1,posts:1}:{saves:0,posts:0});
  assert.equal(await frame.locator('#publish-test').isDisabled(),true);
  const storage=await frame.locator('body').evaluate(()=>({...localStorage}));
  assert.equal(storage['planly-vk-newphoto-20261029-01'],'ATTEMPTED');assert.equal(storage['planly-vk-newphoto-20261106-01'],'ATTEMPTED');
  assert.equal(storage[RECEIPT_POST_OPERATION],'ATTEMPTED');
  const visible=(await page.locator('body').innerText())+(await frame.locator('body').innerText())+(await popup.locator('body').innerText())+JSON.stringify(storage);
  for(const privateValue of [token,photo,hash])assert.equal(visible.includes(privateValue),false);
  const result={status:'SYNTHETIC_RECEIPT_POST_BROWSER_PASS',scenario,providerCalls:0,browserUploadRequests:0,firstPartyUploads:uploads,bridgeSaves:summary.saves,bridgePosts:summary.posts,trustedConfirmationRequired:true,oldMarkersPreserved:true,privateReceiptNotRenderedOrStored:true};
  await mkdir('.superpowers/vk-receipt-browser',{recursive:true});await writeFile(`.superpowers/vk-receipt-browser/${scenario}-result.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));await context.close();
  }
}finally{await browser.close();}

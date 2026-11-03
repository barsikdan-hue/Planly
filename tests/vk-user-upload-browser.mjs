// All origins and API responses intercepted. Never reaches staging or VK.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {userUploadWindowResponse} from '../lib/server/vk/user-upload-window-document.ts';
import {ORIGIN,USER_UPLOAD_OPERATION} from '../public/vk-user-upload-core.mjs';
const token='synthetic-user-token-not-a-real-key';
const fixture=`<!doctype html><button id="start">Start</button><p id="result"></p><script type="module">
import {openUserTokenUpload} from '/user-token-upload.mjs';
start.onclick=async()=>{const flow=openUserTokenUpload();result.textContent=JSON.stringify(await flow.run({accessToken:'${token}',active:()=>true}));};
</script>`;
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext();let posts=0,unexpected=0;
  await context.addCookies([{name:'synthetic_session',value:'test-only',url:ORIGIN,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(url.href.includes(token),false);
    if(url.origin==='https://vk.example.test')return route.fulfill({contentType:'text/html',body:`<iframe id="miniapp" src="${ORIGIN}/fixture"></iframe>`});
    if(url.origin!==ORIGIN){unexpected++;return route.abort();}
    if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
    if(['/boot','/app.js','/style.css'].includes(url.pathname))return route.fulfill({contentType:url.pathname==='/boot'?'text/html':url.pathname==='/app.js'?'text/javascript':'text/css',body:await readFile('experiments/vk-miniapp-probe/dist/'+(url.pathname==='/boot'?'index.html':url.pathname.slice(1)),'utf8')});
    if(url.pathname==='/user-token-upload.mjs')return route.fulfill({contentType:'text/javascript',body:await readFile('experiments/vk-miniapp-probe/user-token-upload.mjs','utf8')});
    if(/^\/(?:public\/)?vk-(?:user-upload-(?:core|protocol|window|diagnostic)|upload-window-core|upload-diagnostic)\.mjs$/.test(url.pathname)){
      return route.fulfill({contentType:'text/javascript',body:await readFile('public/'+url.pathname.split('/').at(-1),'utf8')});
    }
    if(url.pathname==='/social-connections/vk-user-upload-test'){
      const response=userUploadWindowResponse();return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:await response.text()});
    }
    if(url.pathname==='/api/social-accounts/vk/user-upload-test'){
      const owner=(await request.allHeaders()).cookie?.includes('synthetic_session=test-only');
      if(!owner)return route.fulfill({status:401,json:{status:'OWNER_SESSION_REQUIRED'}});
      if(request.method()==='GET')return route.fulfill({json:{status:'OWNER_SESSION_RECOGNIZED'}});
      assert.equal(request.method(),'POST');
      const body=request.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['accessToken','groupId','issuedAt','scopes']);
      assert.equal(body.accessToken,token);assert.equal(body.groupId,242095689);
      assert.equal((await request.allHeaders())['x-planly-vk-user-upload'],USER_UPLOAD_OPERATION);
      posts++;return route.fulfill({json:{status:'PROVIDER_READ_REJECTED',httpStatus:200,private:token,
        diagnostic:{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27,description:token}}});
    }
    unexpected++;return route.abort();
  });
  const page=await context.newPage();await page.goto('https://vk.example.test/');
  const frame=page.frameLocator('#miniapp');const opened=page.waitForEvent('popup');await frame.locator('#start').click();const popup=await opened;
  await popup.waitForFunction(()=>!document.querySelector('#confirm').disabled);
  assert.equal(posts,0);
  assert.equal((await popup.locator('body').innerText()).includes(token),false);
  await popup.evaluate(()=>document.querySelector('#confirm').click());assert.equal(posts,0);
  await mkdir('test-results/vk-user-upload',{recursive:true});await popup.screenshot({path:'test-results/vk-user-upload/preview.png'});
  await popup.locator('#confirm').click();
  await popup.getByText(/VK отклонил проверку прав/).waitFor();await frame.locator('#result').filter({hasText:'PROVIDER_READ_REJECTED'}).waitFor();
  const result=JSON.parse(await frame.locator('#result').innerText());
  assert.deepEqual(result.diagnostic,{stage:'GROUPS_READ',reason:'API_REJECTED',errorCode:27});
  assert.equal(posts,1);assert.equal((await frame.locator('#result').innerText()).includes(token),false);
  const stored=await popup.evaluate(()=>JSON.stringify({...localStorage}));assert.equal(stored.includes(token),false);
  assert.equal(await popup.evaluate(key=>localStorage.getItem(key),USER_UPLOAD_OPERATION),'ATTEMPTED');
  const again=page.waitForEvent('popup');await frame.locator('#start').click();const second=await again;
  await second.waitForFunction(()=>!document.querySelector('#confirm').disabled);await second.locator('#confirm').click();
  await second.getByText('Эта операция уже запускалась. Повтор запрещён.',{exact:true}).waitFor();assert.equal(posts,1);
  const boot=await context.newPage(),errors=[];boot.on('pageerror',error=>errors.push(error.message));
  await boot.goto(ORIGIN+'/boot');await boot.locator('#status').filter({hasText:'Откройте эту страницу внутри Mini App'}).waitFor();
  assert.equal(await boot.locator('#user-token-upload').isDisabled(),true);assert.deepEqual(errors,[]);
  assert.equal(unexpected,0);
  console.log(JSON.stringify({status:'SYNTHETIC_USER_UPLOAD_BROWSER_PASS',explicitPosts:posts,trustedConsentRequired:true,tokenNotRenderedOrStored:true,repeatBlocked:true,providerCalls:0}));
  await context.close();
}finally{await browser.close();}

import {test,expect,type BrowserContext,type Page,type TestInfo} from '@playwright/test';
import {createHmac} from 'node:crypto';

const origin='http://127.0.0.1:4318';
const ticket='SYNTHETIC_BROWSER_ONLY_'.padEnd(43,'x');
const unsafe='<img src="https://blocked.invalid/x" onerror="window.__xss=1">';
function account(provider='telegram',state='verified-disabled',ready=true) {
 return {id:`fixture-${provider}`,provider,providerAccountId:state==='unverified'?null:'-55555',displayName:`Fixture ${provider}`,enabled:state==='enabled',connectionStatus:state==='unverified'?'DISCONNECTED':'CONNECTED',connection:{mode:'verified-user',ready,reason:ready?null:'SETUP_REQUIRED',state,accountHint:'Lentaro • 0123456789',bindingRevision:3,checkedAt:'2020-01-01T00:00:00.000Z',actions:ready?['begin',state==='enabled'?'pause':'enable','release']:[]}};
}
async function fixture(context:BrowserContext,page:Page) {
 const snapshot={profile:{id:'synthetic-user',email:'synthetic@example.invalid',displayName:'Synthetic User'},posts:[],media:[],libraryItems:[],socialAccounts:[account(),account('max','unverified',false)]};
 const unexpected:string[]=[],errors:string[]=[],writes:{path:string;body:unknown}[]=[],consoleErrors:{text:string;url:string;expectedCsp:boolean}[]=[];
 const flags={conflict:false,deny:false,provider:'TELEGRAM',injectingBlockedScript:false,launch:'https://t.me/test_bot?startapp='+ 'a'.repeat(43)};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),url:m.location().url,expectedCsp:flags.injectingBlockedScript && m.text().includes('Content Security Policy')});});
 await context.routeWebSocket('**/*',socket=>{unexpected.push('WebSocket');socket.close();});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){unexpected.push('External '+url.origin);return route.abort('blockedbyclient');}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'cache-control':'private, no-store'}});
  if(request.method()==='GET' && url.pathname==='/api/bootstrap')return respond(snapshot);
  if(request.method()==='GET' && url.pathname==='/api/access')return respond({expiresAt:null,canPublish:true});
  if(request.method()==='GET' && ['/api/admin/invitations','/api/admin/users'].includes(url.pathname))return respond({error:'Forbidden'},403);
  if(request.method()==='POST' && /^\/api\/social-connections\/(accounts\/fixture-(telegram|max)\/(start|enable|pause|release)|providers\/(telegram|max)\/proof|preview|confirm)$/.test(url.pathname)) {
   expect(request.headers()['x-planly-social-connection']).toBe('1');expect(request.headers()['content-type']).toContain('application/json');
   const body=request.postDataJSON();writes.push({path:url.pathname,body});const action=url.pathname.split('/').at(-1);
   if(action==='start'){expect(body).toEqual({destinationId:'-55555'});return respond({launchUrl:flags.launch});}
   if(['enable','pause','release'].includes(action!)){
    expect(body).toEqual({bindingRevision:3});
    if(action==='release' && flags.conflict)return respond({error:'Unavailable',code:'CONFLICT'},409);
    const provider=url.pathname.includes('fixture-max')?'max':'telegram';
    snapshot.socialAccounts=snapshot.socialAccounts.map(a=>a.provider===provider?account(provider,action==='enable'?'enabled':action==='release'?'unverified':'verified-disabled'):a);
    return respond({accountId:`fixture-${provider}`,bindingRevision:action==='release'?4:3,enabled:action==='enable'});
   }
   if(flags.deny)return respond({error:'Connection unavailable'},403);
   if(action==='proof')flags.provider=url.pathname.includes('/max/')?'MAX':'TELEGRAM';
   const provider=flags.provider;
   const consent={provider,humanName:unsafe,humanId:'4242',destinationName:unsafe,destinationId:'-55555',expiresAt:new Date(Date.now()+60000).toISOString()};
   if(action==='proof'){expect(Object.keys(body)).toEqual(['initData']);return respond({...consent,accountHint:'Lentaro • 0123456789',ticket});}
   expect(body).toEqual({ticket});expect(new URL(page.url()).hash).toBe('');
   const accountId=`fixture-${provider.toLowerCase()}`;
   return respond(action==='confirm'?{operationId:'synthetic-operation',accountId,provider,destinationId:'-55555',bindingRevision:3,state:'VERIFIED_DISABLED'}:{...consent,operationId:'synthetic-operation',accountId,planlyName:unsafe});
  }
  unexpected.push(request.method()+' '+url.pathname);return route.abort('blockedbyclient');
 });
 return {snapshot,flags,writes,async check(testInfo:TestInfo){
  expect(unexpected,'No unexpected transport or passthrough').toEqual([]);expect(errors,'No page errors').toEqual([]);
  const unexplained=consoleErrors.filter(e=>!(e.text.startsWith('Failed to load resource: the server responded with a status of') && /^http:\/\/127\.0\.0\.1:4318\/api\/(admin\/(users|invitations)|social-connections\/)/.test(e.url)) && !e.expectedCsp);
  expect(unexplained,'No unexplained console errors').toEqual([]);
  await testInfo.attach('connection-qa',{body:Buffer.from(JSON.stringify({unexpected,errors,expectedResourceErrors:consoleErrors.length,writes:writes.map(w=>w.path)})),contentType:'application/json'});
 }};
}
async function screenshot(page:Page,testInfo:TestInfo,label:string){const path=testInfo.outputPath(`${label}.png`);await page.screenshot({path,fullPage:true});await testInfo.attach(label,{path,contentType:'image/png'});}
async function health(page:Page){const expectedBrand=new URL(page.url()).pathname.startsWith('/social-connections/')?'Lentaro':'Planly';expect(await page.title()).toContain(expectedBrand);await expect(page.locator('vite-error-overlay,nextjs-portal')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);}

for(const width of [1366,390,320])test(`Settings verified lifecycle and release confirmation ${width}`,async({context,page},testInfo)=>{
 test.skip(testInfo.project.name==='mobile','Explicit viewports cover mobile once');
 await page.setViewportSize({width,height:900});const f=await fixture(context,page);await page.goto('/#settings');
 await expect(page.getByRole('heading',{name:'Настройки',exact:true})).toBeVisible();
 const telegram=page.locator('.account-card').filter({has:page.getByRole('heading',{name:'Telegram',exact:true})});
 const max=page.locator('.account-card').filter({has:page.getByRole('heading',{name:'MAX',exact:true})});
 await expect(telegram).toContainText('Подтверждено · выключено');await expect(telegram).toContainText('Lentaro • 0123456789');
 await expect(max).toContainText('Администратору нужно настроить Mini App');await expect(max.getByRole('button',{name:'Подтвердить через Mini App'})).toBeDisabled();
 await health(page);await screenshot(page,testInfo,`settings-${width}`);
 await telegram.getByRole('switch').press('Space');await expect(telegram).toContainText('Включено');
 await telegram.getByRole('switch').press('Space');await expect(telegram).toContainText('Подтверждено · выключено');
 await telegram.getByRole('button',{name:'Снять резервирование'}).click();await expect(page.getByRole('alertdialog')).toContainText('Черновики, медиа и история сохранятся');
 expect(f.writes.map(w=>w.path.split('/').at(-1))).toEqual(['enable','pause']);
 await page.getByRole('button',{name:'Оставить подключение'}).click();expect(f.writes).toHaveLength(2);
 await telegram.getByRole('button',{name:'Снять резервирование'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Снять резервирование',exact:true}).press('Enter');
 await expect(telegram).toContainText('Не подтверждено');await health(page);await f.check(testInfo);
});

test('Settings start rejects unsafe launch and release409 retains reservation with truthful recovery',async({context,page},testInfo)=>{
 const f=await fixture(context,page);f.flags.launch='https://untrusted.invalid/';await page.goto('/#settings');
 const telegram=page.locator('.account-card').filter({has:page.getByRole('heading',{name:'Telegram',exact:true})});await telegram.getByRole('textbox').fill('-55555');await telegram.getByRole('button',{name:'Подтвердить через Mini App'}).click();
 await expect(page.getByText('Не удалось подтвердить действие.',{exact:false})).toBeVisible();expect(page.url()).toBe(origin+'/#settings');
 f.flags.conflict=true;await telegram.getByRole('button',{name:'Снять резервирование'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Снять резервирование',exact:true}).click();
 await expect(page.getByText('Нерешённые публикации требуют отдельного ручного разбора.',{exact:false})).toBeVisible();await expect(telegram).toContainText('Подтверждено · выключено');await f.check(testInfo);
});

test('Settings channel heading keeps its count inside 320px with increased text spacing',async({context,page},testInfo)=>{
 test.skip(testInfo.project.name==='mobile','Explicit narrow viewport covers the boundary once');
 await page.setViewportSize({width:320,height:900});const f=await fixture(context,page);await page.goto('/#settings');
 const heading=page.locator('.settings-socials > .page-heading');await expect(heading).toContainText('1 из 2 подключены');
 // A user text-spacing override exercises wider text metrics on every host font.
 await page.addStyleTag({content:'.settings-socials > .page-heading, .settings-socials > .page-heading * { letter-spacing: .12em !important; }'});
 await expect(heading.locator('.pill')).toBeVisible();
 const bounds=await heading.evaluate(element=>({container:element.getBoundingClientRect().toJSON(),count:element.querySelector('.pill')!.getBoundingClientRect().toJSON()}));
 expect(bounds.count.right).toBeLessThanOrEqual(bounds.container.right+1);
 await health(page);await screenshot(page,testInfo,'settings-320-text-spacing');await f.check(testInfo);
});

for(const provider of ['telegram','max'])test(`actual ${provider} production documents require consent and confirm, strip fragment and preserve privacy`,async({context,page},testInfo)=>{
 const f=await fixture(context,page);
 const data=new URLSearchParams({auth_date:'1780000000',user:JSON.stringify({id:4242,first_name:'Synthetic'}),start_param:'synthetic'});data.set('hash',createHmac('sha256','LOCAL_SYNTHETIC_KEY_NOT_PROVIDER').update(data.toString()).digest('hex'));
 await context.addInitScript(({provider,raw})=>{const bridge={initData:raw,openLink:(url:string)=>{(window as unknown as {opened:string}).opened=url;}};Object.assign(window,provider==='telegram'?{Telegram:{WebApp:bridge}}:{WebApp:bridge});},{provider,raw:data.toString()});
 const response=await page.goto(`/social-connections/miniapp/${provider}#synthetic-fragment`);expect(response!.headers()['content-security-policy']).not.toContain('unsafe-inline');
 await expect(page.getByText('Не пересылайте подтверждение другим людям.',{exact:true})).toBeVisible();await health(page);await screenshot(page,testInfo,`${provider}-miniapp-consent`);
 await expect(page.locator('#details')).toContainText(unsafe);expect(page.url()).not.toContain('#');await page.locator('#continue').click();expect(await page.evaluate(()=>(window as unknown as {opened?:string}).opened)).toBeUndefined();
 await page.locator('#consent').press('Space');await page.locator('#continue').press('Enter');const opened=await page.evaluate(()=>(window as unknown as {opened:string}).opened);expect(opened).toBe(origin+'/social-connections/finish#'+ticket);
 expect(f.writes).toHaveLength(1);const finish=await page.goto(opened);expect(finish!.headers()['cache-control']).toBe('private, no-store');expect(finish!.headers()['content-security-policy']).not.toContain('telegram.org');
 await expect(page.getByText('Не пересылайте подтверждение другим людям.',{exact:true})).toBeVisible();
 await expect(page.locator('#confirm')).toBeEnabled();expect(f.writes.map(w=>w.path.split('/').at(-1))).toEqual(['proof','preview']);expect(await page.content()).not.toContain(ticket);expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});await expect(page.locator('#details img')).toHaveCount(0);
 await health(page);await screenshot(page,testInfo,`${provider}-finish-preview`);await page.locator('#confirm').press('Enter');await expect(page.locator('#status')).toContainText('подтверждено и выключено');
  f.flags.injectingBlockedScript=true;await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__forbidden=1';document.head.appendChild(script);});expect(await page.evaluate(()=>(window as unknown as {__forbidden?:number}).__forbidden)).toBeUndefined();f.flags.injectingBlockedScript=false;
 await page.reload();await expect(page.locator('#status')).toContainText('начните подключение заново');await expect(page.locator('#confirm')).toBeDisabled();expect(f.writes).toHaveLength(3);await f.check(testInfo);
});

test('actual production documents keep the non-forwarding warning and consent controls readable at 320px',async({context,page},testInfo)=>{
 await page.setViewportSize({width:320,height:844});const f=await fixture(context,page);
 await context.addInitScript(()=>{Object.assign(window,{WebApp:{initData:'SYNTHETIC_BROWSER_ONLY',openLink:()=>{}}});});
 for(const path of ['/social-connections/miniapp/max','/social-connections/finish#'+ticket]){
  await page.goto(path);await expect(page.locator(path.includes('miniapp')?'#continue':'#confirm')).toBeEnabled();
  const warning=page.getByText('Не пересылайте подтверждение другим людям.',{exact:true});await expect(warning).toBeVisible();
  const bounds=await warning.boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
  await health(page);await screenshot(page,testInfo,path.includes('miniapp')?'max-miniapp-320':'finish-320');
 }
 expect(f.writes.map(w=>w.path.split('/').at(-1))).toEqual(['proof','preview']);await f.check(testInfo);
});

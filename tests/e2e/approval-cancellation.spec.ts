import {test,expect,type BrowserContext,type Page} from '@playwright/test';
const time='2026-10-17T10:00:00.000Z';
const expected={expectedPublicationId:'old-auth',expectedPublicationUpdatedAt:time,expectedTargetUpdatedAt:time,expectedBindingRevision:7};
async function fixture(context:BrowserContext,page:Page) {
 const target={id:'old-target',socialAccountId:'account',provider:'telegram',textOverride:null,scheduledAt:time,approvalCancelledAt:null as string|null,publication:{status:'REQUIRES_RECONNECT',remoteId:null,remoteUrl:null,error:'Local AUTH retained'},cancelApproval:{...expected,eligible:true,reason:'AVAILABLE',historicalDestinationId:'-123'}};
 const post={id:'old-post',title:null,baseText:'Original private content',status:'READY',mediaIds:[],createdAt:time,updatedAt:'2026-10-16T00:00:00.000Z',editBlockedReason:'История публикации сохранена; создайте копию.' as string|null,targets:[target,{id:'published-target',socialAccountId:'max-account',provider:'max',textOverride:null,scheduledAt:time,publication:{status:'PUBLISHED',remoteId:'remote',remoteUrl:'https://max.ru/old',error:null}}]};
 const snapshot={profile:{id:'owner-a',email:'a@example.test',displayName:'Owner A'},posts:[post],media:[],libraryItems:[],socialAccounts:['telegram','max'].map(provider=>({id:provider==='telegram'?'account':'max-account',provider,providerAccountId:'-999',displayName:'New live destination',enabled:true,connectionStatus:'CONNECTED'}))};
 const writes:{path:string;body:unknown}[]=[],unexpected:string[]=[],errors:string[]=[],consoleErrors:{url:string;text:string}[]=[];
 const flags={conflict:false,hold:null as null|Promise<void>};
 await context.routeWebSocket('**/*',socket=>{unexpected.push('websocket');socket.close();});page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push({url:message.location().url,text:message.text()});});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://127.0.0.1:4318'){unexpected.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(request.method()==='GET' && url.pathname==='/api/bootstrap')return respond(snapshot);
  if(request.method()==='GET' && url.pathname==='/api/profile')return respond(snapshot.profile);
  if(request.method()==='GET' && url.pathname==='/api/admin/shared-library')return respond({error:'Forbidden'},403);
  if(request.method()==='POST' && url.pathname==='/api/posts/old-post/targets/old-target/cancel-approval') {
   expect(request.headers()['x-planly-social-connection']).toBe('1');const body=request.postDataJSON();writes.push({path:url.pathname,body});expect(body).toEqual(expected);
   if(flags.hold)await flags.hold;
   if(flags.conflict)return respond({error:'Conflict'},409);
   target.scheduledAt=null as unknown as string;target.approvalCancelledAt=time;target.cancelApproval.eligible=false;target.cancelApproval.reason='ALREADY_CANCELLED';
   return respond({postId:'old-post',targetId:'old-target',publicationId:'old-auth',approvalCancelledAt:time,replayed:false});
  }
  if(request.method()==='POST' && url.pathname==='/api/posts'){
   const body=request.postDataJSON();writes.push({path:url.pathname,body});expect(body.status).toBe('DRAFT');expect(body.baseText).toBe(post.baseText);
   const saved={...post,id:'new-post',status:'DRAFT',editBlockedReason:null,targets:body.targets.map((t:{provider:string},i:number)=>({...t,id:'new-target-'+i,socialAccountId:'account',publication:null})),updatedAt:time};
   snapshot.posts.push(saved as typeof post);return respond(saved,201);
  }
  unexpected.push(request.method()+' '+url.pathname);return route.abort();
 });
 return {target,snapshot,writes,flags,check(){expect(unexpected).toEqual([]);expect(errors).toEqual([]);expect(consoleErrors.filter(e=>!(e.text.startsWith('Failed to load resource: the server responded with a status of') && (e.url.endsWith('/api/admin/shared-library') || e.url.endsWith('/cancel-approval'))))).toEqual([]);}};
}
async function open(page:Page){await page.goto('/#content');await page.reload();await expect(page).toHaveTitle(/Planly/);await expect(page.locator('vite-error-overlay,nextjs-portal')).toHaveCount(0);await page.getByRole('tab',{name:'Публикации',exact:false}).first().click();await page.getByRole('button',{name:'Original private content',exact:true}).click();}

for(const width of [1366,390,320])test(`target cancellation confirmation, immutable history, copy and explicit draft save ${width}`,async({context,page},info)=>{
 await page.setViewportSize({width,height:900});const f=await fixture(context,page);await open(page);
 await expect(page.getByText('Историческое назначение: -123',{exact:true})).toBeVisible();
 const action=page.getByRole('button',{name:'Отменить согласование',exact:true});await action.press('Enter');
 await expect(page.getByRole('alertdialog')).toContainText('Текст, медиа и история сохранятся');expect(f.writes).toHaveLength(0);
 await page.getByRole('button',{name:'Оставить согласование'}).click();expect(f.writes).toHaveLength(0);await action.click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Отменить согласование',exact:true}).press('Enter');
 await expect(page.getByText('Согласование отменено до отправки.',{exact:true})).toBeVisible();await expect(page.getByText('Local AUTH retained')).toBeVisible();
 await expect(page.getByRole('link',{name:'Открыть в MAX'})).toBeVisible();expect(f.writes).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 const geometry=await page.locator('.post-sheet').evaluate(el=>({scrollLeft:el.scrollLeft,width:el.clientWidth,content:el.scrollWidth,transform:getComputedStyle(el).transform,rect:el.getBoundingClientRect().toJSON()}));
 await info.attach('sheet-geometry',{body:JSON.stringify(geometry),contentType:'application/json'});
 if(geometry.scrollLeft!==0){
  const without=await page.locator('.post-sheet').evaluate(el=>{el.querySelector('.approval-cancellation')?.remove();return {scrollLeft:el.scrollLeft,width:el.clientWidth,content:el.scrollWidth};});
  await info.attach('diagnostic-without-new-section',{body:JSON.stringify(without),contentType:'application/json'});
 }
 expect(geometry.scrollLeft,'Sheet must not horizontally scroll to the cancellation controls').toBe(0);expect(geometry.content).toBeLessThanOrEqual(geometry.width+1);
 await page.screenshot({path:info.outputPath(`cancelled-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'Дублировать в черновик',exact:true}).click();await expect(page.getByRole('heading',{name:'Создать пост',exact:true})).toBeVisible();expect(f.writes).toHaveLength(1);
 await page.getByRole('button',{name:'Сохранить черновик',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(2);expect(f.writes[1].path).toBe('/api/posts');f.check();
});

test('conflict refresh preserves AUTH and historical unknown; legacy DTO never offers cancellation',async({context,page})=>{
 const f=await fixture(context,page);f.target.cancelApproval.historicalDestinationId=null as unknown as string;f.flags.conflict=true;await open(page);
 await expect(page.getByText('Историческое назначение неизвестно.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Отменить согласование',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Отменить согласование',exact:true}).click();
 await expect(page.getByText('Данные изменились. Обновите публикацию и проверьте её состояние.',{exact:true})).toBeVisible();await expect(page.getByText('Local AUTH retained')).toBeVisible();
 delete (f.target as Partial<typeof f.target>).cancelApproval;await open(page);await expect(page.getByRole('button',{name:'Отменить согласование',exact:true})).toHaveCount(0);f.check();
});

test('inflight cancellation response is fenced after owner switch',async({context,page})=>{
 await page.clock.install();const f=await fixture(context,page);let release!:()=>void;f.flags.hold=new Promise<void>(r=>release=r);
 f.snapshot.posts.push({...f.snapshot.posts[0],id:'scheduled-sibling',baseText:'Other scheduled work',targets:[{...f.target,id:'scheduled-target',publication:{status:'SCHEDULED',remoteId:null,remoteUrl:null,error:''}}]});await open(page);
 await page.getByRole('button',{name:'Отменить согласование',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Отменить согласование',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);
 f.snapshot.profile={id:'owner-b',email:'b@example.test',displayName:'Owner B'};f.snapshot.posts=[];
 await page.clock.fastForward(5000);await expect(page.locator('.profile-button')).toContainText('Owner B');release();
 await expect(page.getByText('Согласование отменено до отправки.',{exact:true})).toHaveCount(0);await expect(page.getByText('Original private content',{exact:true})).toHaveCount(0);f.check();
});

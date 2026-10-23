import {test as base,expect,type Page} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sharedFeedDecisionInputSchema,sharedFeedDecisionReceiptSchema,type SharedFeedDecisionInput,type SharedFeedDecisionResult} from '../../lib/contracts/shared-feed';
import type {SharedLibraryItemDto} from '../../lib/contracts/shared-library';
import type {PostDto} from '../../lib/contracts/planner';
import type {LibraryItemDto} from '../../lib/contracts/library';
import type {MediaAssetWithPreview} from '../../lib/client/planly-api';

const origin='http://127.0.0.1:4318',stamp='2026-10-19T00:00:00.000Z';
const shareIds=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const tail='Последняя строка общего материала — прочитана полностью';
const fullText=[...Array.from({length:36},(_,i)=>`Строка ${i+1}: синтетический материал для проверки полного текста.`),'ДлинноеСлово'.repeat(90),tail].join('\n');
const makeItems=():SharedLibraryItemDto[]=>shareIds.map((id,i)=>({id,title:`Общий материал ${i+1}`,text:i===0?fullText:`Синтетический общий текст ${i+1}`,updatedAt:stamp,media:[]}));
type Recorded={owner:string;body:string;input:SharedFeedDecisionInput};
type Fixture={owner:string;items:SharedLibraryItemDto[];requests:Recorded[];posts:Map<string,PostDto[]>;privateMedia:Map<string,MediaAssetWithPreview[]>;privateItems:Map<string,LibraryItemDto[]>;privateImageReads:number;results:Map<string,SharedFeedDecisionResult>;loss:boolean;deleted:boolean;stale:boolean;hold:Promise<void>|null;slot:string|null;pollSentinel:boolean;feedReads:number};
const test=base.extend<{feed:Fixture}>({feed:[async({context,page},use)=>{
 const tomorrow=new Date(Date.now()+86400000);tomorrow.setUTCHours(7,0,0,0);
 const f:Fixture={owner:'feed-a',items:makeItems(),requests:[],posts:new Map([['feed-a',[]],['feed-b',[]]]),privateMedia:new Map([['feed-a',[]],['feed-b',[]]]),privateItems:new Map([['feed-a',[]],['feed-b',[]]]),privateImageReads:0,results:new Map(),loss:false,deleted:false,stale:false,hold:null,slot:tomorrow.toISOString(),pollSentinel:false,feedReads:0};
 const unexpected:string[]=[],errors:string[]=[],consoleErrors:{url:string;text:string}[]=[],expectedResources=new Set<string>();
 const watch=(p:Page)=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push({url:m.location().url,text:m.text()});});};watch(page);context.on('page',watch);
 const ownedResults=()=>[...f.results.entries()].filter(([key])=>key.startsWith(f.owner+':')).map(([,result])=>result);
 const ownItems=()=>f.items.filter(item=>!ownedResults().some(result=>result.receipt.shareId===item.id&&result.receipt.sourceRevision===item.updatedAt));
 const profile=()=>({id:f.owner,email:`${f.owner}@example.invalid`,displayName:f.owner==='feed-a'?'Агент А':'Агент Б'});
 const accounts=()=>['telegram','max'].map((provider,i)=>({id:`${f.owner}-${provider}`,provider,providerAccountId:`-${f.owner}-${i}`,displayName:provider==='telegram'?'Telegram':'MAX',enabled:true,connectionStatus:'CONNECTED',connection:{mode:'verified-user',ready:true,reason:null,state:'enabled',accountHint:provider,bindingRevision:1,checkedAt:stamp,actions:[]}}));
 const sentinel=():PostDto=>({id:'poll-sentinel',title:'Служебный fixture',baseText:'Синтетический пост для запуска проверки владельца',status:'READY',mediaIds:[],createdAt:stamp,updatedAt:stamp,targets:[{id:'sentinel-target',socialAccountId:`${f.owner}-telegram`,provider:'telegram',textOverride:null,scheduledAt:tomorrow.toISOString(),publication:{status:'SCHEDULED',remoteId:null,remoteUrl:null,error:null}}]});
 await context.routeWebSocket('**/*',socket=>{unexpected.push('WebSocket');socket.close();});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const reply=(body:unknown,status=200)=>{if(status>=400)expectedResources.add(`${request.url()}|${status}`);return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});};
  if(url.origin!==origin){unexpected.push(`EXTERNAL ${url.origin}`);return route.abort('blockedbyclient');}
  if(request.method()==='GET'&&url.search===''&&(path==='/fixture-shared.png'||path===`/fixture-private-${f.owner}.png`)){
   if(path.startsWith('/fixture-private-')){expect(f.privateMedia.get(f.owner)!.length).toBeGreaterThan(0);f.privateImageReads++;}
   return route.fulfill({status:200,contentType:'image/png',body:await readFile(new URL('./assets/swipe-photo.png',import.meta.url))});
  }
  if(!path.startsWith('/api/')&&request.method()==='GET')return route.continue();
  if(request.method()==='GET'&&url.search===''){
   if(path==='/api/bootstrap')return reply({profile:profile(),posts:[...(f.posts.get(f.owner)??[]),...(f.pollSentinel?[sentinel()]:[])],media:f.privateMedia.get(f.owner)??[],socialAccounts:accounts(),libraryItems:f.privateItems.get(f.owner)??[]});
   if(path==='/api/profile')return reply(profile());
   if(path==='/api/library-items')return reply(f.privateItems.get(f.owner)??[]);
   if(path==='/api/media')return reply(f.privateMedia.get(f.owner)??[]);
   if(path==='/api/shared-feed'){f.feedReads++;return reply({items:ownItems()});}
   if(path==='/api/library/batch-consent/preview')return reply({eligible:false});
   if(path==='/api/admin/shared-library')return reply({sourceIds:[]});
  }
  if(request.method()==='GET'&&path==='/api/planner-slots'&&url.searchParams.get('swipeReview')==='true'){
   expect([...url.searchParams.keys()].sort()).toEqual(['endDate','providers','startDate','swipeReview','times','weekdays'].sort());
   return reply({scheduledAt:f.slot});
  }
  if(request.method()==='GET'&&path==='/api/analytics'&&['telegram','max'].includes(url.searchParams.get('provider')??'')&&url.searchParams.get('period')==='7'&&url.searchParams.get('page')==='0')return reply({provider:url.searchParams.get('provider'),period:'7',page:0,pageSize:20,eligibleCount:0,observedCount:0,total:null,totalOverflow:false,rows:[],asOf:stamp});
  if(request.method()==='POST'&&path==='/api/shared-feed/decisions'&&url.search===''){
   const input=sharedFeedDecisionInputSchema.parse(request.postDataJSON()),owner=f.owner,key=owner+':'+input.operationId;
   expect(request.headers()['content-type']).toBe('application/json');
   expect(await page.evaluate(({owner,id})=>JSON.parse(localStorage.getItem(`lentaro:shared-decision:v1:${encodeURIComponent(owner)}:${id}`)??'null')?.input,{owner:input.expectedActorId,id:input.operationId})).toEqual(input);
   f.requests.push({owner,body:request.postData()!,input});
   if(input.expectedActorId!==owner)return reply({code:'SHARED_FEED_ACTOR_CHANGED',error:'Synthetic authenticated actor changed'},409);
   const previous=f.results.get(key);
   if(previous){
    expect(f.requests.find(r=>r.owner===owner&&r.input.operationId===input.operationId)!.input).toEqual(input);
    if(f.deleted)return reply({code:'SHARED_FEED_RESULT_DELETED',error:'Deleted synthetic personal result'},410);
    return reply({...previous,replayed:true});
   }
   if(f.stale){f.stale=false;const item=f.items.find(item=>item.id===input.shareId)!;item.updatedAt='2026-10-19T00:00:01.000Z';return reply({code:'SHARED_FEED_SOURCE_STALE',error:'Synthetic source revision changed'},409);}
   const source=f.items.find(item=>item.id===input.shareId);expect(source).toBeDefined();expect(input.sourceRevision).toBe(source!.updatedAt);
   expect(ownedResults().some(value=>value.receipt.shareId===input.shareId&&value.receipt.sourceRevision===input.sourceRevision)).toBe(false);
   const identity={operationId:input.operationId,shareId:input.shareId,sourceRevision:input.sourceRevision};
   const receipt=sharedFeedDecisionReceiptSchema.parse(input.decision==='LIKE'?{...identity,decision:'LIKE',personalItemId:`personal-${owner}-${input.shareId}`,postId:`post-${owner}-${input.shareId}`,scheduledAt:input.approval.scheduledAt}:{...identity,decision:'DISLIKE',personalItemId:null,postId:null,scheduledAt:null});
   if(input.decision==='LIKE'){
    expect(Date.parse(input.approval.scheduledAt)).toBeGreaterThan(Date.now()+59_000);
    const copiedMedia=source!.media.map((asset,index):MediaAssetWithPreview=>({id:`private-${owner}-${input.shareId}-${index}`,originalName:asset.name,mimeType:asset.mimeType,previewUrl:`/fixture-private-${owner}.png`,byteSize:100,width:160,height:90,durationMs:null,source:'UPLOAD',createdAt:stamp}));
    f.privateMedia.get(owner)!.push(...copiedMedia);
    const mediaIds=copiedMedia.map(asset=>asset.id);
    f.privateItems.get(owner)!.push({id:receipt.personalItemId!,title:source!.title,text:source!.text,mediaIds,status:'USED',sourcePostId:receipt.postId!,createdAt:stamp,updatedAt:stamp});
    f.posts.get(owner)!.push({id:receipt.postId!,title:source!.title,baseText:source!.text,status:'READY',mediaIds,createdAt:stamp,updatedAt:stamp,targets:input.approval.providers.map(provider=>({id:`target-${owner}-${input.shareId}-${provider}`,socialAccountId:`${owner}-${provider}`,provider,textOverride:null,scheduledAt:input.approval.scheduledAt,publication:{status:'SCHEDULED',remoteId:null,remoteUrl:null,error:null}}))});
   }
   const result={receipt,replayed:false};f.results.set(key,result);
   await f.hold;
   if(f.loss){f.loss=false;expectedResources.add(`${request.url()}|ERR_CONNECTION_FAILED`);return route.abort('connectionfailed');}
   return reply(result,201);
  }
  unexpected.push(`${request.method()} ${url.pathname}${url.search}`);return route.abort('blockedbyclient');
 });
 await use(f);
 const unexplained=consoleErrors.filter(value=>![...expectedResources].some(expected=>{const [url,code]=expected.split('|');return value.url===url&&(code==='ERR_CONNECTION_FAILED'?value.text==='Failed to load resource: net::ERR_CONNECTION_FAILED':value.text.startsWith(`Failed to load resource: the server responded with a status of ${code} (`));}));
 expect(unexpected,'No external requests, copy endpoint, old post-create or unexpected API').toEqual([]);
 expect(errors,'No browser runtime exceptions').toEqual([]);expect(unexplained,'No unexplained console errors').toEqual([]);
 },{auto:true}]});
test.use({trace:'off',screenshot:'off',video:'off'});

async function openFeed(page:Page){await page.goto('/');await expect(page.locator('.profile-button')).toBeVisible();await page.evaluate(()=>{window.location.hash='feed';});await expect(page.getByRole('region',{name:'Готовый контент',exact:true})).toBeVisible();}
async function begin(page:Page){const feed=page.getByRole('region',{name:'Готовый контент',exact:true}),telegram=feed.getByRole('button',{name:'Telegram',exact:true});await expect(telegram).toBeEnabled();if(await telegram.getAttribute('aria-pressed')!=='true')await telegram.click();const start=feed.getByRole('button',{name:'Начать разбор',exact:true});if(await start.isVisible())await start.click();await expect(feed.locator('.swipe-card')).toBeVisible();}
async function journal(page:Page,owner='feed-a'){return page.evaluate(owner=>Object.keys(localStorage).filter(key=>key.startsWith(`lentaro:shared-decision:v1:${owner}:`)).map(key=>JSON.parse(localStorage.getItem(key)!)),owner);}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await expect(page.locator('nextjs-portal,vite-error-overlay')).toHaveCount(0);}
async function captureEvidence(page:Page,name:string){const directory=process.env.PLANLY_SHARED_FEED_EVIDENCE_DIR;if(!directory)return;await mkdir(directory,{recursive:true});await page.screenshot({path:join(directory,name+'.png'),fullPage:true});}

test('feed deep link opens ready shared content after profile hydration',async({page,feed})=>{
 await page.goto('/#feed');await expect(page.locator('.profile-button')).toContainText('Агент А');await expect(page.getByRole('heading',{name:'Готовый контент',exact:true})).toBeVisible();await begin(page);await expect(page.locator('.swipe-card')).toContainText('Общий материал 1');expect(feed.requests).toHaveLength(0);
});

test('direct shared LIKE waits for acknowledgement and creates exactly one personal calendar post without copy POST',async({page,feed})=>{
 let release!:()=>void;feed.hold=new Promise<void>(resolve=>release=resolve);await openFeed(page);await begin(page);
 await expect(page.locator('.swipe-card')).toContainText('Общий материал 1');await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect.poll(()=>feed.requests.length).toBe(1);await expect(page.locator('.swipe-card')).toContainText('Общий материал 1');
 await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toHaveCount(0);
 expect((await journal(page))[0].state).toBe('pending');release();
 await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();
 expect(feed.requests[0].input.decision).toBe('LIKE');expect(feed.posts.get('feed-a')).toHaveLength(1);expect((await journal(page))[0].state).toBe('confirmed');
 await page.evaluate(()=>{window.location.hash='calendar';});await expect(page.getByRole('heading',{name:'Календарь',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Месяц',exact:true}).click();await expect(page.locator('.calendar-event')).toHaveCount(1);expect(feed.requests).toHaveLength(1);await noOverflow(page);
});

test('DISLIKE hides only for A; B sees the unchanged original and creates an independent result',async({page,feed})=>{
 const original=structuredClone(feed.items);await openFeed(page);await begin(page);await page.getByRole('button',{name:'Не нравится',exact:true}).click();
 await expect(page.getByText('Не нравится · скрыто только для тебя.',{exact:true})).toBeVisible();expect(feed.posts.get('feed-a')).toEqual([]);expect(feed.items).toEqual(original);
 const aJournal=await journal(page);expect(aJournal[0].receipt).toMatchObject({decision:'DISLIKE',personalItemId:null,postId:null});
 feed.owner='feed-b';await openFeed(page);await begin(page);await expect(page.locator('.swipe-card')).toContainText('Общий материал 1');await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();expect(feed.posts.get('feed-b')).toHaveLength(1);expect(feed.posts.get('feed-a')).toHaveLength(0);expect(await journal(page)).toEqual(aJournal);expect(feed.items).toEqual(original);
 feed.owner='feed-a';await openFeed(page);await begin(page);await expect(page.locator('.swipe-card')).toContainText('Общий материал 2');expect(feed.requests).toHaveLength(2);
});

test('lost acknowledgement reload manually replays byte-identical original intent without a second personal post',async({page,feed})=>{
 feed.loss=true;await openFeed(page);await begin(page);await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeVisible();const original=feed.requests[0];expect((await journal(page))[0].state).toBe('pending');
 await openFeed(page);await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeVisible();expect(feed.requests).toHaveLength(1);
 await page.getByRole('button',{name:'Проверить результат выбора',exact:true}).click();await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();
 expect(feed.requests).toHaveLength(2);expect(feed.requests[1]).toEqual(original);expect(feed.posts.get('feed-a')).toHaveLength(1);expect((await journal(page))[0].state).toBe('confirmed');
});

test('stale A tab cannot submit a fresh choice as newly authenticated B before owner polling',async({page,feed})=>{
 await openFeed(page);await begin(page);await expect(page.locator('.profile-button')).toContainText('Агент А');expect(feed.pollSentinel).toBe(false);expect(feed.posts.get('feed-a')).toHaveLength(0);
 feed.owner='feed-b';await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeVisible();expect(feed.requests).toHaveLength(1);expect(feed.requests[0]).toMatchObject({owner:'feed-b',input:{expectedActorId:'feed-a'}});
 expect(feed.posts.get('feed-b')).toHaveLength(0);expect(feed.posts.get('feed-a')).toHaveLength(0);expect(feed.results.size).toBe(0);
 expect((await journal(page))[0].state).toBe('pending');expect(await journal(page,'feed-b')).toEqual([]);await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toHaveCount(0);
});

test('lost A acknowledgement cannot be replayed under B or falsely acknowledged before owner polling',async({page,feed})=>{
 feed.loss=true;await openFeed(page);await begin(page);await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeVisible();
 const original=feed.requests[0],savedJournal=await journal(page);expect(feed.posts.get('feed-a')).toHaveLength(1);expect(feed.pollSentinel).toBe(false);
 feed.owner='feed-b';await page.getByRole('button',{name:'Проверить результат выбора',exact:true}).click();await expect.poll(()=>feed.requests.length).toBe(2);await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeEnabled();
 expect(feed.requests[1].body).toBe(original.body);expect(feed.requests[1]).toMatchObject({owner:'feed-b',input:{expectedActorId:'feed-a'}});expect(feed.posts.get('feed-b')).toHaveLength(0);expect(feed.posts.get('feed-a')).toHaveLength(1);expect(feed.results.size).toBe(1);expect([...feed.results.keys()].every(key=>key.startsWith('feed-a:'))).toBe(true);
 expect(await journal(page)).toEqual(savedJournal);expect(await journal(page,'feed-b')).toEqual([]);await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toHaveCount(0);
});

test('recovered LIKE refreshes the next card slot before its independent approval',async({page,feed})=>{
 feed.loss=true;await openFeed(page);await begin(page);await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeVisible();const original=feed.requests[0],firstSlot=feed.slot!;
 feed.slot=new Date(Date.parse(firstSlot)+86400000).toISOString();
 await page.getByRole('button',{name:'Проверить результат выбора',exact:true}).click();await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();
 expect(feed.requests[1]).toEqual(original);expect(feed.posts.get('feed-a')).toHaveLength(1);
 await expect(page.locator('.swipe-card')).toContainText('Общий материал 2');await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeEnabled();await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect.poll(()=>feed.posts.get('feed-a')!.length).toBe(2);expect(feed.requests).toHaveLength(3);
 expect(feed.requests[2].input).toMatchObject({shareId:shareIds[1],decision:'LIKE',approval:{scheduledAt:feed.slot}});
 expect(feed.posts.get('feed-a')![0].targets[0].scheduledAt).toBe(firstSlot);expect(feed.posts.get('feed-a')![1].targets[0].scheduledAt).toBe(feed.slot);
});

test('new personal image is visible immediately in the saved publication without reload or polling',async({page,feed},info)=>{
 if(info.project.name==='mobile')await page.setViewportSize({width:320,height:844});
 const now=new Date();await page.clock.install({time:now});await page.clock.pauseAt(now);await page.emulateMedia({reducedMotion:'reduce'});
 feed.items[0].media=[{name:'Обложка редакции.png',mimeType:'image/png',previewUrl:'/fixture-shared.png'}];await openFeed(page);await begin(page);
 const sharedImage=page.locator('.swipe-card img');await expect.poll(()=>sharedImage.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);expect(feed.privateImageReads).toBe(0);
 if(info.project.name==='desktop')await captureEvidence(page,'shared-feed-desktop');
 await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('button',{name:'Открыть публикацию',exact:true})).toBeEnabled();
 expect(feed.privateMedia.get('feed-a')).toHaveLength(1);expect(feed.privateItems.get('feed-a')).toHaveLength(1);expect(feed.posts.get('feed-a')![0].mediaIds).toEqual([feed.privateMedia.get('feed-a')![0].id]);
 await page.getByRole('button',{name:'Открыть публикацию',exact:true}).click();await expect(page.getByRole('heading',{name:'Публикация',exact:true})).toBeVisible();
 const personalImage=page.locator('.post-sheet img');await expect(personalImage).toHaveAttribute('src','/fixture-private-feed-a.png');await expect.poll(()=>personalImage.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 expect(feed.privateImageReads).toBeGreaterThan(0);expect(feed.requests).toHaveLength(1);
 if(info.project.name==='mobile')await captureEvidence(page,'shared-feed-private-image-320');
});

test('terminal 410 retains history across reload and allows a separate shared choice without replaying deleted result',async({page,feed})=>{
 feed.loss=true;await openFeed(page);await begin(page);await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toBeVisible();
 feed.deleted=true;await page.getByRole('button',{name:'Проверить результат выбора',exact:true}).click();await expect(page.getByText('Результат предыдущего выбора удалён. Повторная копия не создана.',{exact:true})).toBeVisible();
 const old=(await journal(page))[0];expect(old.state).toBe('terminal');await openFeed(page);await expect(page.getByRole('button',{name:'Проверить результат выбора',exact:true})).toHaveCount(0);await begin(page);
 await expect(page.locator('.swipe-card')).toContainText('Общий материал 2');await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();
 expect(feed.requests).toHaveLength(3);expect(feed.requests[1].body).toBe(feed.requests[0].body);expect(feed.requests[2].input.shareId).toBe(shareIds[1]);expect(feed.requests[2].input.operationId).not.toBe(old.input.operationId);expect((await journal(page)).find(entry=>entry.input.operationId===old.input.operationId)).toEqual(old);
});

test('stale source 409 never reports success or creates a post; refreshed revision needs a new deliberate approval',async({page,feed})=>{
 feed.items=feed.items.slice(0,1);feed.stale=true;await openFeed(page);await begin(page);await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect(page.getByRole('alert').first()).toContainText('Материал изменился');expect(feed.posts.get('feed-a')).toHaveLength(0);await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toHaveCount(0);expect((await journal(page))[0].state).toBe('refused');
 await page.getByRole('button',{name:'Обновить ленту',exact:true}).click();await begin(page);await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();
 expect(feed.requests).toHaveLength(2);expect(feed.requests[1].input.shareId).toBe(feed.requests[0].input.shareId);expect(feed.requests[1].input.sourceRevision).not.toBe(feed.requests[0].input.sourceRevision);expect(feed.posts.get('feed-a')).toHaveLength(1);
});

test('missing slot disables approval and skip makes no durable decision',async({page,feed})=>{
 feed.slot=null;await openFeed(page);await begin(page);await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Позже',exact:true}).click();await expect(page.locator('.swipe-card')).toContainText('Общий материал 2');expect(feed.requests).toEqual([]);expect(await journal(page)).toEqual([]);
 await openFeed(page);await begin(page);await expect(page.locator('.swipe-card')).toContainText('Общий материал 1');
});

for(const width of [390,320])test(`full text scroll and keyboard approval preserve exact shared choice at ${width}`,async({page,feed},info)=>{
 await page.setViewportSize({width,height:844});await openFeed(page);await begin(page);const text=page.locator('.swipe-text');await expect(text).toHaveText(fullText);await text.scrollIntoViewIfNeeded();
 await text.evaluate(node=>{node.scrollTop=node.scrollHeight;});await expect.poll(()=>text.evaluate((node,tail)=>{const value=node.firstChild!,start=value.textContent!.lastIndexOf(tail),range=document.createRange();range.setStart(value,start);range.setEnd(value,value.textContent!.length);const last=range.getBoundingClientRect(),box=node.getBoundingClientRect();return last.top>=Math.max(box.top,0)-1&&last.bottom<=Math.min(box.bottom,innerHeight)+1;},tail)).toBe(true);
 expect(feed.requests).toEqual([]);expect(await text.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);await noOverflow(page);
 if(width===320&&info.project.name==='mobile')await captureEvidence(page,'shared-feed-fulltext-320');
 await page.locator('.swipe-card').focus();await page.keyboard.press('ArrowRight');await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toBeVisible();expect(feed.requests[0].input).toMatchObject({shareId:shareIds[0],decision:'LIKE',approval:{inputMethod:'keyboard',providers:['telegram']}});
});

test('horizontal gesture approves once and late response after owner switch cannot render or confirm A under B',async({page,context,feed},info)=>{
 await page.clock.install();feed.pollSentinel=true;let release!:()=>void;feed.hold=new Promise<void>(resolve=>release=resolve);await openFeed(page);await begin(page);const text=page.locator('.swipe-text');await text.scrollIntoViewIfNeeded();const box=(await text.boundingBox())!,x=box.x+box.width/2,y=box.y+20;
 if(info.project.name==='mobile'){const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(const fraction of [.3,.6,1])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+105*fraction,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
 else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+105,y,{steps:8});await page.mouse.up();}
 await expect.poll(()=>feed.requests.length).toBe(1);expect(feed.requests[0].input).toMatchObject({decision:'LIKE',approval:{inputMethod:'gesture'}});
 feed.owner='feed-b';await page.clock.fastForward(5000);await expect(page.locator('.profile-button')).toContainText('Агент Б');release();
 await expect(page.getByText('Выбор подтверждён. Публикация в личном календаре.',{exact:true})).toHaveCount(0);expect((await journal(page))[0].state).toBe('pending');expect(await journal(page,'feed-b')).toEqual([]);expect(feed.requests).toHaveLength(1);expect(feed.posts.get('feed-b')).toHaveLength(0);
});

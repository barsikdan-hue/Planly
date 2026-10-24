import {test as base,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {eq,inArray} from 'drizzle-orm';
import {startLibraryBatchRuntime} from '../helpers/library-batch-http.mjs';
import {createPost,updatePost} from '../../lib/server/posts.ts';
import {posts,publications,libraryBatchConsentOperations} from '../../db/schema.ts';
import type {LibraryBatchCommitResult} from '../../lib/contracts/library-batch.ts';

type Runtime=Awaited<ReturnType<typeof startLibraryBatchRuntime>>;
const test=base.extend<{runtime:Runtime}>({runtime:async({context},provide)=>{
 const started=performance.now();
 let contextClosed=false;context.on('close',()=>{contextClosed=true;});
 const cleanupPhase=async<T,>(label:string,work:()=>Promise<T>):Promise<T>=>{
  const state=()=>({contextClosed,pageCount:context?.pages().length??0});
  console.log(JSON.stringify({diagnostic:'library-batch-cleanup',label,event:'BEGIN',elapsedMs:Math.round(performance.now()-started),...state()}));
  let returned=false;try{const result=await work();returned=true;return result;}finally{console.log(JSON.stringify({diagnostic:'library-batch-cleanup',label,event:'END',elapsedMs:Math.round(performance.now()-started),returned,...state()}));}
 };
 const f=await startLibraryBatchRuntime({cleanupPhase});try{await provide(f);}finally{
  // The compiled child must outlive its clients. SIGTERM while the test context
  // is still open can wait for browser connections until Playwright's timeout,
  // interrupting DB cleanup and contaminating the next shared-catalog fixture.
  try{await cleanupPhase('browser.context.close',()=>context.close());}finally{await f.cleanup();}
 }
}});
// Automatic auth/signed-URL artifacts are forbidden; explicit images follow login.
test.use({trace:'off',screenshot:'off',video:'off'});
async function content(page:Page){await expect(page.locator('.profile-button')).toContainText('Shared fixture 1');await page.evaluate(()=>{window.location.hash='content';});await expect(page.getByRole('heading',{name:'Библиотека',exact:true})).toBeVisible();}
async function login(page:Page,f:Runtime){await page.goto(f.base+'/login');await page.getByLabel('Email',{exact:true}).fill(`${f.ids[1]}@example.test`);await page.getByLabel('Пароль',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page).toHaveURL(f.base+'/');await content(page);}

for(const width of [1366,390,320])test(`compiled real HTTP same-operation late rollback and lost accepted reply ${width}`,async({page,context,runtime:f},info)=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[],consoleErrors:{text:string;url:string}[]=[],external:string[]=[],commits:unknown[]=[];
 const watch=(p:Page)=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),url:m.location().url});});};watch(page);
 const origins=new Set([new URL(f.base).origin,new URL(f.backend).origin]);
 const assets=await f.db.select().from(publications).where(eq(publications.userId,f.ids[1]));expect(assets).toHaveLength(0);
 // The child serves real routes. Only transport responses are held/lost below.
 context.on('request',r=>{const url=new URL(r.url());if(!origins.has(url.origin)&&!['127.0.0.1','localhost'].includes(url.hostname))external.push(url.origin);});
 await login(page,f);expect(await page.title()).toBe('Lentaro');await page.getByRole('button',{name:'Запланировать набор',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'Набор из библиотеки',exact:true})).toBeVisible();
 for(const id of f.input.sourceIds)await page.getByLabel(`Выбрать заготовку ${id}`,{exact:true}).check();
 for(const provider of ['TELEGRAM','MAX'])await page.getByLabel(`Площадка Batch ${provider}`,{exact:true}).check();
 await page.getByLabel('Начало периода').fill(f.input.settings.startDate);await page.getByLabel('Конец периода').fill(f.input.settings.endDate);await page.getByLabel('Время слотов').fill('10:00,18:00');
 const previewResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/library/batch-consent/preview'&&r.request().method()==='POST');await page.getByRole('button',{name:'Предпросмотр набора',exact:true}).click();const preview=await (await previewResponse).json();expect(preview.complete).toBe(true);
 await expect(page.getByRole('button',{name:'Подтвердить и сохранить 2 поста',exact:true})).toBeEnabled();await expect(page.locator('.library-batch-text').filter({hasText:'Last line retained'})).toBeVisible();
 const media=page.locator('.library-batch-preview article').filter({hasText:'Batch ordered media'}).locator('img,video');expect(await media.evaluateAll(nodes=>nodes.map(n=>n.tagName))).toEqual(['IMG','VIDEO']);await expect.poll(()=>media.first().evaluate(n=>(n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 const video=media.nth(1);await expect.poll(()=>video.evaluate(n=>{const v=n as HTMLVideoElement;return v.readyState>=2&&v.videoWidth>0&&v.duration>0;})).toBe(true);await video.evaluate(async n=>{const v=n as HTMLVideoElement;v.muted=true;await v.play();await new Promise<void>(resolve=>v.addEventListener('ended',()=>resolve(),{once:true}));});
 expect((await f.db.select().from(posts).where(eq(posts.userId,f.ids[1]))).length).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await expect(page.locator('nextjs-portal,vite-error-overlay')).toHaveCount(0);
 const out=process.env.PLANLY_BROWSER_EVIDENCE_DIR??info.outputPath('ui');await mkdir(out,{recursive:true});await page.screenshot({path:join(out,`compiled-batch-${info.project.name}-${width}.png`),fullPage:true});
 const occupant=await createPost(f.ids[1],{title:null,baseText:'Own synthetic temporary slot occupant',status:'READY',mediaIds:[],targets:[{provider:'telegram',textOverride:null,scheduledAt:preview.descriptor.intent.rows[0].targets[0].scheduledAt}]});
 let release!:()=>void,observed!:()=>void;const held=new Promise<void>(resolve=>release=resolve),received=new Promise<void>(resolve=>observed=resolve);const results:LibraryBatchCommitResult[]=[];
 await page.route('**/api/library/batch-consent/commit',async route=>{commits.push(route.request().postDataJSON());const actual=await route.fetch();expect(actual.status()).toBe(409);const body=await actual.json();expect(body.code).toBe('BATCH_SLOT_CONFLICT');expect(body.commitApplied).toBe(false);observed();await held;await route.fulfill({response:actual});},{times:1});
 const pendingA=page.getByRole('button',{name:'Подтвердить и сохранить 2 поста',exact:true}).click();await received;await pendingA;
 const other=await context.newPage();watch(other);await other.setViewportSize({width,height:900});await other.goto(f.base+'/');await content(other);await other.getByRole('button',{name:'Проверить набор',exact:true}).click();const absent=other.waitForResponse(r=>new URL(r.url()).pathname.startsWith('/api/library/batch-consent/operations/'));await other.getByRole('button',{name:'Проверить исходное сохранение',exact:true}).click();expect((await absent).status()).toBe(404);
 await updatePost(f.ids[1],occupant.id,{title:null,baseText:'Own synthetic temporary slot occupant',status:'DRAFT',mediaIds:[],targets:[{provider:'telegram',textOverride:null,scheduledAt:null}]});
 await other.route('**/api/library/batch-consent/commit',async route=>{commits.push(route.request().postDataJSON());const actual=await route.fetch();expect(actual.status()).toBe(200);results.push(await actual.json());await route.abort('connectionfailed');},{times:1});
 await other.getByRole('button',{name:'Повторить исходное сохранение',exact:true}).click();await expect.poll(()=>results.length).toBe(1);const saved=results[0];await expect(other.getByRole('button',{name:'Повторить исходное сохранение',exact:true})).toBeEnabled();expect(commits).toHaveLength(2);expect(commits[1]).toEqual(commits[0]);expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes(':attempt:')).length)).toBe(2);
 release();await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes(':attempt:')).length)).toBe(1);
 await page.reload();await content(page);await page.getByRole('button',{name:'Проверить набор',exact:true}).click();await expect(page.locator('.scheduling-warning article')).toHaveCount(1);const recovered=page.waitForResponse(r=>new URL(r.url()).pathname.startsWith('/api/library/batch-consent/operations/'));await page.getByRole('button',{name:'Проверить исходное сохранение',exact:true}).click();expect((await recovered).status()).toBe(200);await expect(page.getByText('Набор сохранён: 2 поста',{exact:true})).toBeVisible();expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes(':attempt:')).length)).toBe(0);
 const receipts=await f.db.select().from(libraryBatchConsentOperations).where(eq(libraryBatchConsentOperations.userId,f.ids[1]));expect(receipts).toHaveLength(1);expect(receipts[0].receipt).toEqual(saved.receipt);const pubs=await f.db.select().from(publications).where(inArray(publications.postId,saved.receipt.rows.map((r:{postId:string})=>r.postId)));expect(pubs).toHaveLength(4);expect(pubs.every(p=>p.attemptCount===0&&p.providerRemoteId===null)).toBe(true);expect(errors).toEqual([]);expect(external).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 const unexpected=consoleErrors.filter(e=>!(/\/api\/library\/batch-consent\/(?:commit|operations\/)/.test(e.url)&&/409|404|ERR_CONNECTION_FAILED/.test(e.text))&&!(/\/api\/admin\/shared-library/.test(e.url)&&/403/.test(e.text)));expect(unexpected).toEqual([]);await other.close();
});

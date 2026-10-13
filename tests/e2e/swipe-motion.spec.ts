import {test,expect,setupReview} from './swipe-fixture';
test('Dashboard review preserves origin and shows live drag before a confirmed decision',async({page,swipeFixture})=>{
 await page.goto('/#dashboard');
 await page.getByRole('button',{name:'Разобрать заготовки · 4',exact:true}).click(); await setupReview(page);
 await expect(page.locator('.workspace')).toHaveClass(/view-dashboard/);
 const card=page.locator('.swipe-card'); await card.scrollIntoViewIfNeeded();
 const box=(await card.boundingBox())!; const x=box.x+30,y=box.y+30;
 await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+60,y,{steps:5});
 await expect(card).toHaveAttribute('data-motion','dragging');
 expect(await card.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
 await page.mouse.up(); await expect(card).toHaveAttribute('data-motion','idle'); expect(swipeFixture.decisions).toEqual([]);
 await page.getByRole('button',{name:'Назад на главную',exact:true}).click();
 await expect(page.getByRole('button',{name:'Разобрать заготовки · 4',exact:true})).toBeVisible();
});

const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
test('response confirmation alone advances card, preserves focus, and blocks duplicates',async({page,swipeFixture})=>{
 const gate=deferred(); swipeFixture.beforeDecision=()=>gate.promise;
 await page.goto('/#dashboard'); await page.getByRole('button',{name:'Разобрать заготовки · 4'}).click(); await setupReview(page);
 const card=page.locator('.swipe-card'); await card.focus(); await card.press('ArrowRight');
 await expect(card).toHaveAttribute('data-motion','submitting'); await expect(card).toHaveAttribute('aria-label','Заготовка: Review a');
 await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeDisabled(); expect(swipeFixture.decisions).toEqual([]);
 await card.press('ArrowRight'); gate.resolve();
 await expect(card).toHaveAttribute('aria-label','Заготовка: Review b'); await expect(card).toBeFocused(); expect(swipeFixture.decisions).toHaveLength(1);
 await card.press(' '); await expect(card).toHaveAttribute('aria-label','Заготовка: Review c'); expect(swipeFixture.decisions).toHaveLength(1);
});
test('known API rejection springs back on original card with no false success',async({page,swipeFixture})=>{
 swipeFixture.failDecision=true; await page.goto('/#content'); await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click(); await setupReview(page);
 const card=page.locator('.swipe-card'); await card.focus(); await card.press('ArrowLeft');
 await expect(page.getByRole('alert')).toContainText('Fixture source changed'); await expect(card).toHaveAttribute('aria-label','Заготовка: Review a');
 await expect(card).toHaveAttribute('data-motion','idle'); await expect(card).toBeFocused(); expect(swipeFixture.decisions).toEqual([]);
});
test('empty Dashboard Add opens Library editor without a server write',async({page,swipeFixture})=>{
 swipeFixture.empty=true; await page.goto('/#dashboard'); await expect(page.getByText('Пока нет готовых заготовок')).toBeVisible();
 await page.getByRole('button',{name:'Разобрать заготовки · 0'}).click(); await page.getByRole('button',{name:'Добавить заготовку'}).click();
 await expect(page.locator('.library-editor')).toBeVisible(); expect(swipeFixture.decisions).toEqual([]);
});
test('reduced motion preserves the confirmation order without card transforms',async({page,swipeFixture})=>{
 await page.emulateMedia({reducedMotion:'reduce'}); const gate=deferred(); swipeFixture.beforeDecision=()=>gate.promise;
 await page.goto('/#content'); await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click(); await setupReview(page); const card=page.locator('.swipe-card');
 await card.scrollIntoViewIfNeeded(); const visible=(await card.boundingBox())!;
 await page.mouse.move(visible.x+30,visible.y+30); await page.mouse.down(); await page.mouse.move(visible.x+100,visible.y+30);
 await expect(card).toHaveAttribute('data-motion','dragging'); expect(await card.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 await page.mouse.up(); expect(swipeFixture.decisions).toEqual([]); await card.focus(); await card.press('ArrowRight');
 await expect(card).toHaveAttribute('data-motion','submitting'); gate.resolve(); await expect(card).toHaveAttribute('aria-label','Заготовка: Review b'); expect(swipeFixture.decisions).toHaveLength(1);
});
test('already in-flight identity snapshot closes A review and late A result cannot affect B',async({page,swipeFixture})=>{
 swipeFixture.scheduled=true; await page.clock.install(); await page.goto('/#content'); await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click(); await setupReview(page);
 const poll=deferred(),a=deferred(),b=deferred(); let started=false,decisionCount=0;
 swipeFixture.beforeBootstrap=()=>{started=true;return poll.promise;}; swipeFixture.beforeDecision=()=>++decisionCount===1?a.promise:b.promise;
 await page.clock.runFor(5000); await expect.poll(()=>started).toBe(true); await page.getByRole('button',{name:'В календарь',exact:true}).click();
 await expect(page.locator('.swipe-card')).toHaveAttribute('data-motion','submitting'); swipeFixture.owner='owner-B'; poll.resolve();
 await expect(page.locator('.swipe-planner')).toHaveCount(0); await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click(); await setupReview(page);
 await page.getByRole('button',{name:'В календарь',exact:true}).click(); await expect.poll(()=>decisionCount).toBe(2);
 const before=await page.evaluate(()=>sessionStorage.getItem('planly:pending-create:v1:owner-B')); a.resolve();
 await expect.poll(()=>swipeFixture.decisions.length).toBe(1); await expect(page.locator('.swipe-card')).toHaveAttribute('aria-label','Заготовка: Owner B a');
 await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeDisabled(); expect(await page.evaluate(()=>sessionStorage.getItem('planly:pending-create:v1:owner-B'))).toBe(before);
 b.resolve(); await expect.poll(()=>swipeFixture.decisions.length).toBe(2);
});

test('photo, video playback and selected text remain interactive without a decision',async({page,swipeFixture})=>{
 swipeFixture.withMedia=true; await page.goto('/#content'); await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click(); await setupReview(page);
 const photo=page.getByRole('img',{name:'Fixture photo'}),video=page.getByLabel('Fixture video', {exact:true});
 await expect(photo).toBeVisible(); await expect(video).toHaveAttribute('controls','');
 await video.evaluate(async(el:HTMLVideoElement)=>{await el.play();}); await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.currentTime)).toBeGreaterThan(0);
 await video.focus(); await video.press('ArrowRight'); await photo.scrollIntoViewIfNeeded(); const box=(await photo.boundingBox())!;
 await page.mouse.move(box.x+20,box.y+20); await page.mouse.down(); await page.mouse.move(box.x+130,box.y+20,{steps:5});await page.mouse.up();
 await page.locator('.swipe-text').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);window.getSelection()?.removeAllRanges();window.getSelection()?.addRange(range);});
 const card=page.locator('.swipe-card'); await card.scrollIntoViewIfNeeded(); const c=(await card.boundingBox())!;
 await page.mouse.move(c.x+30,c.y+30);await page.mouse.down();await page.mouse.move(c.x+130,c.y+30,{steps:5});await page.mouse.up();
 await expect(card).toHaveAttribute('aria-label','Заготовка: Review a');expect(swipeFixture.decisions).toEqual([]);
});

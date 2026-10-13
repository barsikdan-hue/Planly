import {test,expect,setupReview} from './swipe-fixture';
test('explicit setup has no networks and Next default; unavailable slot right swipe springs back without writes',async({page,swipeFixture},info)=>{
 swipeFixture.slot=null;await page.goto('/#dashboard');await page.getByRole('button',{name:'Разобрать заготовки · 4',exact:true}).click();
 await expect(page.locator('.swipe-card')).toHaveCount(0);await expect(page.getByLabel('Режим одобрения')).toHaveValue('next');
 await expect(page.getByRole('button',{name:'Telegram',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Telegram',exact:true}).click();await page.getByRole('button',{name:'Начать разбор',exact:true}).click();
 const card=page.locator('.swipe-card');await card.scrollIntoViewIfNeeded();const box=(await card.boundingBox())!;
 const x=box.x+35,y=box.y+35;
 if(info.project.name==='mobile'){
  const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(const dx of [30,60,110])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
 }else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y,{steps:8});await page.mouse.up();}
 await expect(card).toHaveAttribute('data-motion','idle');await expect(card).toHaveAttribute('aria-label','Заготовка: Review a');await expect(page.getByRole('alert')).toContainText('не раньше чем через минуту');
 await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeDisabled();expect(swipeFixture.requests).toHaveLength(0);
 await page.getByRole('button',{name:'Позже',exact:true}).click();await expect(card).toHaveAttribute('aria-label','Заготовка: Review b');
 await page.getByRole('button',{name:'Не нравится',exact:true}).click();expect(swipeFixture.decisions).toEqual([{action:'reject',itemId:'b'}]);
});

test('preview API failure blocks right decision while skip remains available',async({page,swipeFixture})=>{
 swipeFixture.failPreview=true;await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();
 await page.getByRole('button',{name:'Telegram',exact:true}).click();await page.getByRole('button',{name:'Начать разбор',exact:true}).click();
 await expect(page.getByText('Fixture preview unavailable',{exact:true})).toBeVisible();const card=page.locator('.swipe-card');await card.focus();await card.press('ArrowRight');
 await expect(card).toHaveAttribute('data-motion','idle');expect(swipeFixture.requests).toHaveLength(0);await page.getByRole('button',{name:'Позже',exact:true}).click();await expect(card).toHaveAttribute('aria-label','Заготовка: Review b');
});
test('manual Moscow slot conflict preserves time and card until explicit repair',async({page,swipeFixture},info)=>{
 swipeFixture.conflictOnce=true;await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();
 await page.getByLabel('Режим одобрения').selectOption('manual');await page.getByRole('button',{name:'Telegram',exact:true}).click();
 await page.getByLabel('Дата публикации',{exact:true}).fill('2099-01-01');await page.getByLabel('Время публикации',{exact:true}).fill('10:00');await page.getByRole('button',{name:'Начать разбор',exact:true}).click();
 const card=page.locator('.swipe-card');await expect(card.locator('.swipe-destination')).toContainText('10:00');await expect(card.locator('.swipe-destination')).toContainText('МСК');
 await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Fixture manual slot occupied');
 await expect(card).toHaveAttribute('aria-label','Заготовка: Review a');await expect(page.getByLabel('Время публикации',{exact:true})).toHaveValue('10:00');expect(swipeFixture.decisions).toHaveLength(0);expect(swipeFixture.requests).toHaveLength(1);
 expect(JSON.parse(swipeFixture.requests[0].body).targets[0].scheduledAt).toBe('2099-01-01T07:00:00.000Z');
 await page.getByRole('button',{name:'Изменить расписание',exact:true}).click();await expect(card).toHaveCount(0);await page.getByLabel('Время публикации',{exact:true}).fill('11:00');await page.getByRole('button',{name:'Начать разбор',exact:true}).click();
 await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByText(/В календаре · .*11:00 МСК/)).toBeVisible();expect(swipeFixture.decisions).toHaveLength(1);expect(swipeFixture.requests).toHaveLength(2);
 expect(JSON.parse(swipeFixture.requests[1].body).targets[0].scheduledAt).toBe('2099-01-01T08:00:00.000Z');expect(swipeFixture.requests[1].key).not.toBe(swipeFixture.requests[0].key);
 await info.attach('manual-calendar-result',{body:await page.screenshot(),contentType:'image/png'});
});
test('next conflict and parent busy release keep original slot until explicit refresh',async({page,swipeFixture})=>{
 let previewRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/planner-slots')previewRequests++;});
 swipeFixture.conflictOnce=true;await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 swipeFixture.slot='2099-01-02T07:00:00.000Z';await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Fixture manual slot occupied');
 const card=page.locator('.swipe-card');await expect(card.locator('.swipe-destination')).toContainText('1 янв. 2099');expect(swipeFixture.requests).toHaveLength(1);expect(swipeFixture.decisions).toHaveLength(0);expect(previewRequests).toBe(1);
 await page.getByRole('button',{name:'Изменить расписание',exact:true}).click();await page.getByRole('button',{name:'Начать разбор',exact:true}).click();await expect(card.locator('.swipe-destination')).toContainText('2 янв. 2099');expect(previewRequests).toBe(2);
 await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(card).toHaveAttribute('aria-label','Заготовка: Review b');expect(swipeFixture.decisions).toHaveLength(1);
 expect(JSON.parse(swipeFixture.requests[0].body).targets[0].scheduledAt).toBe('2099-01-01T07:00:00.000Z');expect(JSON.parse(swipeFixture.requests[1].body).targets[0].scheduledAt).toBe('2099-01-02T07:00:00.000Z');
});
test('Moscow midnight after actual Next conflict retains slot and GET count until explicit setup',async({page,swipeFixture})=>{
 await page.clock.install({time:new Date('2030-01-01T20:59:50Z')});swipeFixture.slot='2030-01-02T07:00:00.000Z';swipeFixture.conflictOnce=true;
 const queryDates:string[]=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/planner-slots')queryDates.push(url.searchParams.get('startDate')!);});
 await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 swipeFixture.slot='2030-01-03T07:00:00.000Z';await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Fixture manual slot occupied');
 await page.clock.runFor(15_000);const card=page.locator('.swipe-card');await expect(card.locator('.swipe-destination')).toContainText('2 янв. 2030');expect(queryDates).toEqual(['2030-01-01']);expect(swipeFixture.requests).toHaveLength(1);expect(swipeFixture.decisions).toHaveLength(0);
 await page.getByRole('button',{name:'Изменить расписание',exact:true}).click();await page.getByRole('button',{name:'Начать разбор',exact:true}).click();await expect(card.locator('.swipe-destination')).toContainText('3 янв. 2030');expect(queryDates).toEqual(['2030-01-01','2030-01-02']);
});
test('disconnected selected network is removed only by explicit owner action before MAX approval',async({page,swipeFixture})=>{
 swipeFixture.scheduled=true;swipeFixture.maxConnected=true;await page.clock.install();await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 swipeFixture.telegramConnected=false;await page.clock.runFor(5_000);const telegram=page.getByRole('button',{name:'Telegram',exact:true});await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeDisabled();await expect(telegram).toHaveAttribute('aria-pressed','true');expect(swipeFixture.decisions).toHaveLength(0);
 await page.getByRole('button',{name:'Изменить расписание',exact:true}).click();await page.getByRole('button',{name:'MAX',exact:true}).click();await expect(telegram).toBeEnabled();await telegram.click();await expect(telegram).toHaveAttribute('aria-pressed','false');await expect(telegram).toBeDisabled();
 await page.getByRole('button',{name:'Начать разбор',exact:true}).click();await expect(page.locator('.swipe-card .swipe-destination')).toContainText('MAX');await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect.poll(()=>swipeFixture.decisions.length).toBe(1);expect(JSON.parse(swipeFixture.requests[0].body).targets.map((target:{provider:string})=>target.provider)).toEqual(['max']);await page.clock.runFor(200);
});
test('unknown committed response reload recovers original marked slot and UUID without a new approval',async({page,swipeFixture})=>{
 swipeFixture.loseResponse=true;await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 await page.getByRole('button',{name:'В календарь',exact:true}).click();await expect(page.getByRole('button',{name:'Повторить сохранение',exact:true})).toBeVisible();
 expect(swipeFixture.decisions).toHaveLength(1);expect(swipeFixture.requests).toHaveLength(1);
 const original=swipeFixture.requests[0];await page.reload();expect(swipeFixture.requests).toHaveLength(1);
 await page.getByRole('button',{name:'Повторить сохранение',exact:true}).click();await expect(page.getByRole('button',{name:'Повторить сохранение',exact:true})).toHaveCount(0);
 expect(swipeFixture.requests).toHaveLength(2);expect(swipeFixture.requests[1]).toEqual(original);expect(swipeFixture.decisions).toHaveLength(1);
 expect(JSON.parse(original.body)).toMatchObject({status:'READY',requireFreeSlot:true,swipeReview:{inputMethod:'button'},targets:[{provider:'telegram',scheduledAt:'2099-01-01T07:00:00.000Z'}]});
});

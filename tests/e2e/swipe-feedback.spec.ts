import {test,expect,setupReview} from './swipe-fixture';

test('durable DISLIKE lost acknowledgement reload stays blocked then identical explicit replay',async({page,swipeFixture})=>{
 swipeFixture.loseDislikeResponse=true;await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 await page.getByRole('button',{name:'Не нравится',exact:true}).click();await expect(page.getByRole('button',{name:'Повторить решение',exact:true})).toBeVisible();expect(swipeFixture.decisions).toHaveLength(1);expect(swipeFixture.dislikeRequests).toHaveLength(1);
 expect(JSON.parse(swipeFixture.dislikeRequests[0].body).swipeReview.inputMethod).toBe('button');
 await expect(page.getByRole('button',{name:'В календарь',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Позже',exact:true})).toBeDisabled();
 await page.reload();await expect(page.getByRole('button',{name:'Повторить решение',exact:true})).toBeVisible();expect(swipeFixture.dislikeRequests).toHaveLength(1);
 await page.getByRole('button',{name:'Повторить решение',exact:true}).click();await expect(page.getByRole('button',{name:'Повторить решение',exact:true})).toHaveCount(0);
 expect(swipeFixture.dislikeRequests).toHaveLength(2);expect(swipeFixture.dislikeRequests[1]).toEqual(swipeFixture.dislikeRequests[0]);expect(swipeFixture.decisions).toHaveLength(1);
});
for(const decision of ['LIKE','DISLIKE'])test(`${decision} reload terminal410 clears original pending without a new decision`,async({page,swipeFixture})=>{
 if(decision==='LIKE')swipeFixture.loseResponse=true;else swipeFixture.loseDislikeResponse=true;
 await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 await page.getByRole('button',{name:decision==='LIKE'?'В календарь':'Не нравится',exact:true}).click();const label=decision==='LIKE'?'Повторить сохранение':'Повторить решение';await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
 swipeFixture.deletedResult=true;await page.reload();await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByText('Результат подтверждённого решения удалён. Новое решение не создано.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);expect(swipeFixture.decisions).toHaveLength(1);
 const calls=decision==='LIKE'?swipeFixture.requests:swipeFixture.dislikeRequests;expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
});
test('private preferences load only on demand; zero ratio and manual JSON download',async({page,swipeFixture},info)=>{
 const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);
 expect(swipeFixture.feedbackRequests).toEqual([]);await page.getByRole('button',{name:'Мои оценки',exact:true}).click();await expect(page.getByRole('region',{name:'Мои оценки'})).toContainText('Доля LIKE: нет данных');expect(downloads).toHaveLength(0);expect(swipeFixture.feedbackRequests).toEqual(['/api/swipe-feedback']);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать JSON',exact:true}).click();const download=await downloaded;expect(download.suggestedFilename()).toBe('planly-swipe-feedback-v1.json');const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));expect(JSON.parse(Buffer.concat(chunks).toString()).aggregate.likeRatio).toBeNull();expect(downloads).toHaveLength(1);
 await info.attach('preferences-private-summary',{body:await page.screenshot(),contentType:'image/png'});
});
test('owner change while export response waits cannot download previous owner data',async({page,swipeFixture})=>{
 swipeFixture.scheduled=true;await page.clock.install();const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));await page.goto('/#content');await page.getByRole('button',{name:'Разобрать заготовки',exact:true}).click();await setupReview(page);await page.getByRole('button',{name:'Мои оценки',exact:true}).click();await expect(page.getByRole('button',{name:'Скачать JSON',exact:true})).toBeVisible();
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);swipeFixture.beforeFeedback=()=>gate;await page.getByRole('button',{name:'Скачать JSON',exact:true}).click();await expect.poll(()=>swipeFixture.feedbackRequests.length).toBe(2);
 swipeFixture.owner='B';await page.clock.runFor(5_000);await expect(page.locator('.swipe-planner')).toHaveCount(0);release();await page.clock.runFor(200);expect(downloads).toEqual([]);
});

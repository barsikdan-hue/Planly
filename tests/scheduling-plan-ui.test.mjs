import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {fixture,text,nodes,preview,deferred,storage} from './helpers/scheduling-plan-fixture.mjs';
import {persistPendingSchedulingPlan} from '../lib/client/scheduling-plan-recovery.ts';
register('./helpers/planner-lifecycle-loader.mjs',import.meta.url);
const schedulingModule=await import('../components/planner/scheduling-plan.tsx').catch(()=>null);
const original={fetch:globalThis.fetch,window:globalThis.window};const hs=[];
afterEach(()=>{hs.splice(0).forEach(h=>h.unmount());Object.assign(globalThis,original);});
async function setup(opts){assert.ok(schedulingModule,'SchedulingPlan exists');const f=await fixture(schedulingModule.SchedulingPlan,opts);hs.push(f.h);return f;}
test('ordered selection survives filters; every full row needs its own review',async()=>{
 const f=await setup();await f.select('a');await f.select('b');await f.button('Выше b').props.onClick();await f.h.settle();f.field('Поиск черновиков').props.onChange({target:{value:'no matches'}});await f.h.settle();await f.loadPreview();
 for(const s of ['Full base a','Full base b','Full override a','Full override b','Channel','destination'])assert.ok(text(f.h.tree).includes(s));assert.equal(nodes(f.h.tree,n=>n.type==='img').length,2);assert.equal(nodes(f.h.tree,n=>n.type==='video').length,2);
 await f.review('b');assert.equal(f.button('Запланировать 2 постов').props.disabled,true);assert.equal(f.commits().length,0);await f.review('a');assert.equal(f.button('Запланировать 2 постов').props.disabled,false);const click=f.button('Запланировать 2 постов').props.onClick;await Promise.all([click(),click()]);await f.h.settle();assert.equal(f.commits().length,1);assert.deepEqual(f.commits()[0].body.rows.map(r=>r.postId),['b','a']);
});
test('incomplete plan and media failure cannot confirm; refresh clears checks',async()=>{
 let complete=false;const f=await setup({mutation:r=>r.url.endsWith('/preview')?Response.json(preview(r.body,complete)):undefined});await f.select('a');await f.loadPreview();assert.equal(f.button('Запланировать 1 постов').props.disabled,true);complete=true;await f.loadPreview();await f.review('a');nodes(f.h.tree,n=>n.type==='img')[0].props.onError();await f.h.settle();assert.equal(f.button('Запланировать 1 постов').props.disabled,true);await f.loadPreview();assert.equal(f.field('Содержание проверено a').props.checked,false);assert.equal(f.commits().length,0);
});
test('old preview after reordering or owner invalidation is ignored',async()=>{
 const d=deferred();const f=await setup({mutation:r=>r.url.endsWith('/preview')?d.promise:undefined});await f.select('a');await f.select('b');const pending=f.button('Обновить предпросмотр').props.onClick();await f.h.settle();await f.button('Выше b').props.onClick();await f.h.settle();d.resolve(Response.json(preview({postIds:['a','b']})));await pending;await f.h.settle();assert.equal(nodes(f.h.tree,n=>n.props?.['aria-label']==='Содержание проверено a').length,0);
});
test('receipt stays saved when refresh fails; refresh alone never schedules again',async()=>{
 let refreshes=0;const f=await setup({onSaved:async()=>{refreshes++;throw Error('refresh unavailable');}});await f.select('a');await f.loadPreview();await f.review('a');await f.button('Запланировать 1 постов').props.onClick();await f.h.settle();assert.ok(text(f.h.tree).includes('План сохранён'));assert.ok(text(f.h.tree).includes('Не удалось обновить календарь'));await f.button('Обновить календарь').props.onClick();assert.equal(refreshes,2);assert.equal(f.commits().length,1);
});
test('storage failure dispatches nothing and unknown response preserves original retry',async()=>{
 const cache=storage();cache.setItem=()=>{throw Error('quota');};const f=await setup({cache});await f.select('a');await f.loadPreview();await f.review('a');await f.button('Запланировать 1 постов').props.onClick();assert.equal(f.commits().length,0);
 const g=await setup({mutation:r=>r.url.endsWith('/commit')?Response.json({error:'unavailable'},{status:500}):undefined});await g.select('a');await g.loadPreview();await g.review('a');await g.button('Запланировать 1 постов').props.onClick();await g.h.settle();assert.equal(g.cache.length,1);const first=g.commits()[0].body;await g.button(`Проверить сохранение ${first.operationId}`).props.onClick();assert.deepEqual(g.commits()[1].body,first);
});
test('hydration/storage events offer each original operation and never dispatch automatically',async()=>{
 const cache=storage();const make=id=>({version:1,ownerId:'owner',operationId:id,input:{operationId:id,settings:{startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[2],times:['10:00']},rows:[{postId:'a',fingerprint:'a'.repeat(64),scheduledAt:'2030-01-01T07:00:00.000Z',reviewed:true}]}});
 persistPendingSchedulingPlan(cache,make('11111111-1111-4111-8111-111111111111'));const f=await setup({cache});assert.equal(f.commits().length,0);assert.ok(f.button('Проверить сохранение 11111111-1111-4111-8111-111111111111'));persistPendingSchedulingPlan(cache,make('22222222-2222-4222-8222-222222222222'));f.handlers.get('storage')({storageArea:cache});await f.h.settle();assert.ok(f.button('Проверить сохранение 22222222-2222-4222-8222-222222222222'));assert.equal(f.commits().length,0);await f.button('Закрыть').props.onClick();assert.equal(f.commits().length,0);
});
test('proven stale rejection requires fresh preview and reviews',async()=>{
 const f=await setup({mutation:r=>r.url.endsWith('/commit')?Response.json({error:'changed',code:'PLAN_STALE',commitApplied:false},{status:409}):undefined});await f.select('a');await f.loadPreview();await f.review('a');await f.button('Запланировать 1 постов').props.onClick();await f.h.settle();assert.equal(f.cache.length,0);assert.equal(f.button('Запланировать 1 постов').props.disabled,true);await f.loadPreview();assert.equal(f.field('Содержание проверено a').props.checked,false);
});
test('changed fingerprints require separate reviews again and late owner responses stay hidden',async()=>{
 let fingerprint='a';const f=await setup({mutation:r=>r.url.endsWith('/preview')?Response.json(preview(r.body,true,fingerprint)):undefined});await f.select('a');await f.loadPreview();await f.review('a');fingerprint='b';await f.loadPreview();assert.equal(f.field('Содержание проверено a').props.checked,false);
 const d=deferred();const g=await setup({mutation:r=>r.url.endsWith('/preview')?d.promise:undefined});await g.select('a');const pending=g.button('Обновить предпросмотр').props.onClick();g.deactivate();d.resolve(Response.json(preview({postIds:['a']})));await pending;await g.h.settle();assert.equal(nodes(g.h.tree,n=>n.props?.['aria-label']==='Содержание проверено a').length,0);assert.equal(g.commits().length,0);
});
test('replayed receipt identifies the earlier application and does not assert deleted posts still exist',async()=>{
 const cache=storage(),operationId='33333333-3333-4333-8333-333333333333';
 const input={operationId,settings:{startDate:'2020-01-01',endDate:'2020-01-01',weekdays:[1,2,3,4,5,6,7],times:['10:00']},rows:[{postId:'deleted-post',fingerprint:'a'.repeat(64),scheduledAt:'2020-01-01T07:00:00.000Z',reviewed:true}]};
 persistPendingSchedulingPlan(cache,{version:1,ownerId:'owner',operationId,input});
 const f=await setup({cache,mutation:r=>r.url.endsWith('/commit')?Response.json({replayed:true,receipt:{operationId,appliedAt:'2019-12-31T12:00:00.000Z',rows:[{postId:'deleted-post',targetIds:['deleted-target'],scheduledAt:input.rows[0].scheduledAt}]}}):undefined});
 await f.button(`Проверить сохранение ${operationId}`).props.onClick();await f.h.settle();
 assert.ok(text(f.h.tree).includes('Результат предыдущего сохранения'));assert.ok(text(f.h.tree).includes('2019'));assert.ok(text(f.h.tree).includes('Текущие посты могли быть изменены или удалены'));assert.equal(f.commits().length,1);assert.deepEqual(f.commits()[0].body,input);assert.equal(cache.length,0);
});
test('a confirmed recovery receipt removes the obsolete uncertain-response alert',async()=>{
 let attempts=0;
 const f=await setup({mutation:r=>{
   if(!r.url.endsWith('/commit'))return;
   if(++attempts===1)throw new TypeError('uncertain browser response');
   return Response.json({replayed:true,receipt:{operationId:r.body.operationId,appliedAt:'2026-10-09T12:00:00Z',rows:r.body.rows.map(row=>({postId:row.postId,targetIds:[`${row.postId}-target`],scheduledAt:row.scheduledAt}))}});
 }});
 await f.select('a');await f.loadPreview();await f.review('a');await f.button('Запланировать 1 постов').props.onClick();await f.h.settle();
 assert.equal(nodes(f.h.tree,n=>n.props?.role==='alert').length,1);assert.equal(f.cache.length,1);
 const original=f.commits()[0].body;
 await f.button(`Проверить сохранение ${original.operationId}`).props.onClick();await f.h.settle();
 assert.ok(text(f.h.tree).includes('Результат предыдущего сохранения'));
 assert.equal(nodes(f.h.tree,n=>n.props?.role==='alert').length,0,'confirmed recovery must not keep asking the owner to repeat a failed operation');
 assert.deepEqual(f.commits()[1].body,original);assert.equal(f.cache.length,0);
});

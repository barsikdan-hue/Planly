import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {createHarness} from './helpers/planner-hook-harness.mjs';
register('./helpers/analytics-ui-loader.mjs',import.meta.url);
const {Analytics}=await import('../components/planner/analytics.tsx');
const {AnalyticsSummary,DashboardAnalytics}=await import('../components/planner/analytics-summary.tsx');
const original=globalThis.fetch;const mounted=[];
afterEach(()=>{mounted.splice(0).forEach(h=>h.unmount());globalThis.fetch=original;});
const empty=(provider='max',period=7)=>({provider,period,page:0,pageSize:20,eligibleCount:0,observedCount:0,total:null,totalOverflow:false,rows:[],asOf:'2026-10-08T12:00:00Z'});
function find(node,label){if(!node||typeof node!=='object')return null;if(node.type==='button'&&node.props.children===label)return node;const children=Array.isArray(node)?node:node.props?.children;for(const child of Array.isArray(children)?children:[children]){const result=find(child,label);if(result)return result;}return null;}
function mount(owner={id:'a',generation:{}}){const state={owner};const h=createHarness(()=>Analytics({ownerContext:state.owner}));mounted.push(h);h.render();return {h,state};}
test('summary distinguishes observed zero and unavailable coverage without demo trends',()=>{
  const data={...empty(),eligibleCount:2,observedCount:1,total:0};const html=renderToStaticMarkup(AnalyticsSummary({data,loading:false,error:null}));
  assert.match(html,/0/);assert.match(html,/1 из 2/);assert.doesNotMatch(html,/12 840|Демонстрац|Сохранения|\+12,4/);
  const missing=renderToStaticMarkup(AnalyticsSummary({data:empty('telegram'),loading:false,error:null}));assert.match(missing,/нет данных/);
});
test('analytics loads then performs one bounded refresh, with explicit empty state',async()=>{
  const requests=[];globalThis.fetch=async(url,init)=>{requests.push({url,init});return Response.json(init?.method==='POST'?{checked:0,observed:0,unavailable:0,skipped:0,busy:false,nextPage:null}:empty());};
  const {h}=mount();await h.settle();h.render();await h.settle();
  assert.equal(requests.filter(r=>r.init?.method==='POST').length,1);const refresh=requests.find(r=>r.init?.method==='POST');assert.equal(new Headers(refresh.init.headers).get('X-Planly-Analytics'),'1');
  const html=renderToStaticMarkup(h.tree);assert.match(html,/Опубликованных постов/);assert.doesNotMatch(html,/Демонстрац|Просмотры по дням|Сохранения/);
});
test('late MAX reply after provider switch cannot replace Telegram selection',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async url=>String(url).includes('provider=max')?pending:Response.json(empty('telegram'));
  const {h}=mount();find(h.tree,'Telegram').props.onClick();h.render();await h.settle();release(Response.json({...empty(),total:999,observedCount:1,eligibleCount:1}));await h.settle();
  const html=renderToStaticMarkup(h.tree);assert.doesNotMatch(html,/999/);assert.match(html,/сбор реакций ещё не дал данных/);
});
test('owner replacement and unmount discard old metrics',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});let first=true;
  globalThis.fetch=async(_url,init)=>init?.method==='POST'?Response.json({nextPage:null,busy:false}):first?(first=false,pending):Response.json(empty());
  const {h,state}=mount();state.owner={id:'b',generation:{}};h.render();await h.settle();release(Response.json({...empty(),total:12345,observedCount:1,eligibleCount:1}));await h.settle();assert.doesNotMatch(renderToStaticMarkup(h.tree),/12345/);h.unmount();
});
test('dashboard only loads persisted metrics and cannot refresh a provider',async()=>{
  let calls=0;globalThis.fetch=async(url,init)=>{calls++;assert.equal(init?.method,undefined);return Response.json(empty(String(url).includes('telegram')?'telegram':'max'));};
  const h=createHarness(()=>DashboardAnalytics({ownerContext:{id:'a',generation}}));const generation={};mounted.push(h);h.render();await h.settle();assert.equal(calls,2);
});
test('period change discards a late cohort and uses 30-day labels',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async(url,init)=>init?.method==='POST'?Response.json({nextPage:null,busy:false}):String(url).includes('period=7')?pending:Response.json(empty('max',30));
  const {h}=mount();find(h.tree,'30 дней').props.onClick();h.render();await h.settle();
  release(Response.json({...empty(),total:54321,observedCount:1,eligibleCount:1}));await h.settle();
  const html=renderToStaticMarkup(h.tree);assert.doesNotMatch(html,/54321/);assert.match(html,/за 30 дней по Москве/);
});
test('partial metrics show actual zero, age, safe links and preserved failures',async()=>{
  const metric={value:0,observedAt:'2026-10-06T10:00:00Z',coverage:'AVAILABLE',stale:true,collectionError:'RATE_LIMITED'};
  const data={...empty('telegram'),eligibleCount:2,observedCount:1,total:0,rows:[{publicationId:'p1',text:'Основное сообщение',publishedAt:'2026-10-06T09:00:00Z',providerUrl:'https://t.me/c/123456/31',primaryMessageOnly:true,metric},{publicationId:'p2',text:'Нет наблюдения',publishedAt:'2026-10-07T09:00:00Z',providerUrl:'https://evil.test/post?token=private',primaryMessageOnly:false,metric:{...metric,value:null,observedAt:null,coverage:'IDENTITY_UNPROVEN',stale:false,collectionError:null}}]};
  globalThis.fetch=async()=>Response.json(data);
  const {h}=mount();find(h.tree,'Telegram').props.onClick();h.render();await h.settle();
  const html=renderToStaticMarkup(h.tree);assert.match(html,/1 из 2/);assert.match(html,/возраст: 51 ч/);assert.match(html,/реакции на основное сообщение/);assert.match(html,/старше 24 часов/);assert.match(html,/временно ограничила запросы/);assert.match(html,/Последнее значение сохранено/);assert.match(html,/Не подтверждён адрес/);assert.match(html,/noopener noreferrer/);assert.doesNotMatch(html,/evil.test|private|RATE_LIMITED/);
});
test('manual refresh advances collection pages separately from ranked page',async()=>{
  const pages=[];globalThis.fetch=async(_url,init)=>{if(init?.method==='POST'){const query=JSON.parse(init.body);pages.push(query.page);return Response.json({nextPage:query.page===0?1:null,busy:false});}return Response.json({...empty(),eligibleCount:21});};
  const {h}=mount();await h.settle();find(h.tree,'Обновить следующие 20 постов').props.onClick();await h.settle();find(h.tree,'Обновить просмотры').props.onClick();await h.settle();
  assert.deepEqual(pages,[0,1,0]);assert.match(renderToStaticMarkup(h.tree),/Страница 1/);
});
test('failed read exits loading without fabricated values',async()=>{
  globalThis.fetch=async()=>Response.json({error:'unavailable'},{status:503});
  const {h}=mount();await h.settle();const html=renderToStaticMarkup(h.tree);assert.match(html,/Не удалось обновить статистику/);assert.match(html,/нет данных/);assert.doesNotMatch(html,/Загрузка статистики/);
});
test('unmounted analytics does not refresh after a late initial read',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});let posts=0;
  globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;return pending;};
  const {h}=mount();h.unmount();release(Response.json(empty()));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(posts,0);
});

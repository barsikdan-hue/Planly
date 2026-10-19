import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {toast} from 'sonner';
import {fixture,cleanup,deferred} from './helpers/library-editor-fixture.mjs';
import * as api from '../lib/client/planly-api.ts';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {Composer}=await import('../components/planner/composer.tsx');
const originalToast={success:toast.success,error:toast.error};
afterEach(()=>{cleanup();Object.assign(toast,originalToast);});
const launchUrl=`https://t.me/test_bot?startapp=${'a'.repeat(43)}`;
const account=(owner='owner',state='verified-disabled')=>({id:`${owner}-telegram`,provider:'telegram',providerAccountId:'-55555',displayName:'Channel',enabled:state==='enabled',connectionStatus:'CONNECTED',connection:{mode:'verified-user',ready:true,reason:null,state,accountHint:'Lentaro • 0123456789',bindingRevision:3,checkedAt:'2020-01-01T00:00:00.000Z',actions:state==='enabled'?['begin','pause','release']:['begin','enable','release']}});
function messages(){const results=[];for(const kind of Object.keys(originalToast))toast[kind]=message=>results.push({kind,message});return results;}
async function open(mutation){const value=fixture({scheduled:true,mutation});value.snapshot.socialAccounts=[account()];const redirects=[];window.location.assign=url=>redirects.push(url);await value.settle();await value.navigate('settings');return {value,redirects};}
const props=value=>value.app.find('Settings').props;
function act(value,action){return action==='begin'?props(value).connect('owner-telegram','-55555'):action==='release'?props(value).release?.('owner-telegram'):props(value).toggle('owner-telegram',action==='enable');}
test('actual client start and lifecycle POST use strict header/body no-store and encoded account path',async()=>{
 assert.equal(typeof api.beginSocialConnection,'function');assert.equal(typeof api.changeSocialConnection,'function');
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,...init});return Response.json({accountId:'a /',bindingRevision:3,enabled:false,launchUrl});};
 await api.beginSocialConnection('a /','-55555');for(const action of ['enable','pause','release'])await api.changeSocialConnection('a /',action,3);
 assert.deepEqual(calls.map(c=>c.url),['start','enable','pause','release'].map(a=>`/api/social-connections/accounts/a%20%2F/${a}`));
 for(const [i,c] of calls.entries()){assert.equal(c.method,'POST');assert.equal(c.cache,'no-store');assert.equal(new Headers(c.headers).get('X-Planly-Social-Connection'),'1');assert.deepEqual(JSON.parse(c.body),i?{bindingRevision:3}:{destinationId:'-55555'});assert.deepEqual([...new Headers(c.headers).keys()].sort(),['content-type','x-planly-social-connection']);}
});
test('USER begin launches only allowlisted Mini App and cannot mark account verified or enabled',async()=>{
 const {value,redirects}=await open(()=>Response.json({launchUrl}));const before=props(value).accounts;
 await act(value,'begin');await value.settle();assert.equal(value.requests[0].url,'/api/social-connections/accounts/owner-telegram/start');assert.deepEqual(value.requests[0].body,{destinationId:'-55555'});assert.deepEqual(redirects,[launchUrl]);assert.deepEqual(props(value).accounts,before);
});
for(const url of ['https://evil.test/a','https://t.me/test_bot/extra?startapp='+ 'a'.repeat(43),'https://t.me/test_bot?startapp=x','https://max.ru/test_bot?startapp='+ 'a'.repeat(43),launchUrl+'&return=https://evil.test',launchUrl+'#extra','javascript:alert(1)'])test(`USER start rejects unsupported launch contract ${url.slice(0,36)}`,async()=>{
 const observed=messages(),{value,redirects}=await open(()=>Response.json({launchUrl:url}));await act(value,'begin');await value.settle();assert.deepEqual(redirects,[]);assert.equal(observed[0]?.kind,'error');assert.ok(!observed[0].message.includes(url));
});
for(const action of ['enable','pause','release'])test(`USER ${action} reads authoritative metadata after strict revision POST instead of assuming full DTO`,async()=>{
 const observed=messages();let value;
 ({value}=await open(()=>{value.snapshot.socialAccounts=[account('owner',action==='enable'?'enabled':action==='pause'?'verified-disabled':'unverified')];return Response.json({accountId:'owner-telegram',bindingRevision:action==='release'?4:3,enabled:action==='enable'});}));
 assert.equal(typeof props(value).release,'function');await act(value,action);await value.settle();
 assert.equal(value.requests[0].url,`/api/social-connections/accounts/owner-telegram/${action}`);assert.deepEqual(value.requests[0].body,{bindingRevision:3});assert.deepEqual(props(value).accounts,value.snapshot.socialAccounts);assert.equal(observed[0]?.kind,'success');assert.equal(props(value).accountBusy['owner-telegram'],undefined);
});
for(const action of ['begin','enable','pause','release'])for(const outcome of ['success','error'])for(const departure of ['owner','logout','unmount'])test(`${action} old ${outcome} after ${departure} cannot update DTO toast navigation or cleanup`,async()=>{
 const pending=deferred(),observed=messages();const {value,redirects}=await open(request=>request.url==='/api/auth/logout'?new Response(null,{status:204}):pending.promise);
 assert.equal(typeof props(value).release,'function');const operation=act(value,action);await value.settle();assert.equal(props(value).accountBusy['owner-telegram'],true);
 if(departure==='owner'){value.snapshot.profile={id:'other',displayName:'Other'};value.snapshot.socialAccounts=[account('other')];await value.poll();}
 if(departure==='logout'){await props(value).logout();await value.settle();}
 if(departure==='unmount')value.unmount();
 const before=departure==='logout'?null:props(value).accounts;observed.length=0;redirects.length=0;
 pending.resolve(outcome==='success'?Response.json(action==='begin'?{launchUrl}:{accountId:'owner-telegram',bindingRevision:3,enabled:true}):Response.json({error:'private provider response',code:'DENIED'},{status:403}));
 await operation;if(departure!=='unmount')await value.settle();
 assert.deepEqual(observed,[]);assert.deepEqual(redirects,[]);if(departure!=='logout')assert.deepEqual(props(value).accounts,before);if(departure==='unmount')assert.equal(value.app.changed,false);if(departure==='owner')assert.deepEqual(props(value).accountBusy,{});
});
test('release conflict reports manual review, preserves data, and offers no automatic cancel/delete promise',async()=>{
 const observed=messages(),{value}=await open(()=>Response.json({error:'private data',code:'CONFLICT'},{status:409}));assert.equal(typeof props(value).release,'function');const before=props(value).accounts;
 await act(value,'release');await value.settle();assert.deepEqual(props(value).accounts,before);assert.match(observed[0].message,/ручн/);assert.match(observed[0].message,/сохран/);assert.doesNotMatch(observed[0].message,/private|удали|отмени/i);
});
for(const state of ['unverified','stale','pending','verified-disabled','enabled'])test(`actual Composer usability follows verified ${state} and retains selected private Telegram/MAX draft targets`,async()=>{
 const {value}=await open(()=>{throw Error('No mutation');});
 value.snapshot.posts=[{...value.snapshot.posts[0],id:'private-draft',status:'DRAFT',baseText:'Private draft',mediaIds:['A'],targets:[
  {id:'private-telegram',socialAccountId:'owner-telegram',provider:'telegram',textOverride:null,scheduledAt:null,publication:null},
  {id:'private-max',socialAccountId:'owner-max',provider:'max',textOverride:'Private MAX text',scheduledAt:null,publication:null},
 ]},value.snapshot.posts[0]];
 value.snapshot.socialAccounts=[account('owner','enabled'),{...account('owner','enabled'),id:'owner-max',provider:'max'}];
 await value.poll();await value.navigate('content');
 const content=value.app.find('Content').props;content.editPost(content.posts.find(post=>post.id==='private-draft'));await value.settle();
 const before=value.app.find('Composer').props.draft;
 assert.equal(before.id,'private-draft');assert.deepEqual(before.networks,['telegram','max']);
 for(const network of ['Telegram','MAX'])assert.match(renderToStaticMarkup(createElement(Composer,value.app.find('Composer').props)),new RegExp(`<[^>]+aria-label="${network}"[^>]+aria-checked="true"|<[^>]+aria-checked="true"[^>]+aria-label="${network}"`));
 value.snapshot.socialAccounts=value.snapshot.socialAccounts.map(item=>({...item,...account('owner',state),id:item.id,provider:item.provider,enabled:true}));
 await value.poll();
 const composer=value.app.find('Composer').props;
 assert.equal(composer.accounts.telegram,state==='enabled');assert.equal(composer.accounts.max,state==='enabled');
 assert.deepEqual(composer.draft,before);
 for(const network of ['Telegram','MAX'])assert.match(renderToStaticMarkup(createElement(Composer,composer)),new RegExp(`<[^>]+aria-label="${network}"[^>]+aria-checked="true"|<[^>]+aria-checked="true"[^>]+aria-label="${network}"`));
 assert.equal(value.requests.length,0);
});

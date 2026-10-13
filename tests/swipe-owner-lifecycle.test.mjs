import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cleanup,item,deferred,find,text} from './helpers/library-editor-fixture.mjs';
import {writePendingCreation,readPendingCreation} from '../lib/client/pending-creation.ts';
import {blankPost} from '../lib/planner.ts';
afterEach(cleanup);
const approval={mode:'next',providers:['telegram'],scheduledAt:'2099-01-01T07:00:00Z'};
const saved=(id)=>Response.json({id,baseText:'Server text',status:'DRAFT',targets:[],mediaIds:[],createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()});
for(const action of ['onApprove','onReject','retry'])for(const failure of [false,true])test(`late owner A ${action} failure=${failure} cannot apply cards or release owner B busy lock`,async()=>{
 const gateA=deferred(),gateB=deferred(),pollGate=deferred(); let calls=0;
 const value=fixture({scheduled:true,items:[item('A')],mutation:request=>{
  if(request.url==='/api/library-items')return Response.json(value.snapshot.libraryItems);
  if(request.method==='POST'||request.method==='PATCH')return ++calls===1?gateA.promise:gateB.promise;
  throw Error(`Unexpected ${request.url}`);
 }});
 if(action==='retry'){const token=crypto.randomUUID();writePendingCreation(value.cache,'owner',{version:1,key:crypto.randomUUID(),input:{baseText:'Server text',status:'DRAFT',targets:[],mediaIds:[],sourceLibraryItemId:'A'},editor:blankPost(),intent:'draft',editorToken:token,activeEditorToken:token,origin:'swipe-planner'});}
 await value.settle(); value.props().startReview(); await value.settle();
 const fetchOriginal=globalThis.fetch; globalThis.fetch=(url,init)=>url==='/api/bootstrap'?pollGate.promise:fetchOriginal(url,init); await value.poll();
 const captured=value.app.find('SwipePlanner').props;

 const a=action==='retry' ? Promise.resolve(find(value.app.tree,n=>typeof n.props?.onClick==='function'&&text(n)==='Повторить сохранение').props.onClick()) : captured[action](item('A'),approval).catch(()=>{}); await value.settle();
 value.snapshot.profile={id:'B',displayName:'B'}; value.snapshot.libraryItems=[item('B')]; pollGate.resolve(Response.json(value.snapshot)); await value.settle();
 assert.equal(value.app.find('SwipePlanner'),null,'owner transition ends old review');
 value.props().startReview(); await value.settle(); const b=value.app.find('SwipePlanner').props.onApprove(item('B'),approval); await value.settle();
 assert.equal(value.app.find('SwipePlanner').props.busy,true); const pendingB=readPendingCreation(value.cache,'B'); assert.ok(pendingB);
 gateA.resolve(failure ? Response.json({error:'Old owner source changed',code:'LIBRARY_SOURCE_STALE'},{status:409}) : action==='onReject'?Response.json({...item('A'),status:'ARCHIVED'}):saved('saved-A')); await a; await value.settle();
 assert.equal(value.app.find('SwipePlanner').props.busy,true,'late A finally must not release B');
 assert.equal(readPendingCreation(value.cache,'B').key,pendingB.key); assert.deepEqual(value.app.find('SwipePlanner').props.items.map(i=>i.id),['B']);
 gateB.resolve(saved('saved-B')); await b; await value.settle();
});

test('busy ordinary Composer retains A identity until completion and a fresh B poll replaces its posts',async()=>{
 const saveGate=deferred(),pollGate=deferred();
 const value=fixture({scheduled:true,mutation:r=>r.url==='/api/posts'?saveGate.promise:Promise.reject(Error(`Unexpected ${r.url}`))});
 await value.settle();await value.navigate('create');value.app.composer().setDraft(p=>({...p,text:'Private A'}));await value.settle();
 const fetchOriginal=globalThis.fetch;globalThis.fetch=(url,init)=>url==='/api/bootstrap'?pollGate.promise:fetchOriginal(url,init);await value.poll();
 const composer=value.app.composer();const saving=composer.save(composer.draft,'draft');await value.settle();
 value.snapshot.profile={id:'B',displayName:'B'};pollGate.resolve(Response.json(value.snapshot));await value.settle();
 await value.navigate('dashboard');assert.equal(value.app.find('Dashboard').props.ownerContext.id,'owner','unguarded Composer must retain owner A while busy');
 saveGate.resolve(saved('private-A-post'));await saving;await value.settle();await value.navigate('dashboard');
 assert.equal(value.app.find('Dashboard').props.ownerContext.id,'owner');assert.equal(value.app.find('Dashboard').props.posts.some(p=>p.id==='private-A-post'),true);
 globalThis.fetch=fetchOriginal;await value.poll();assert.equal(value.app.find('Dashboard').props.ownerContext.id,'B');assert.equal(value.app.find('Dashboard').props.posts.some(p=>p.id==='private-A-post'),false);
});

test('A to B to A uses a new owner generation so old rejection cannot release returned A approval',async()=>{
 const oldA=deferred(),newA=deferred(),pollGate=deferred();let mutations=0;
 const value=fixture({scheduled:true,items:[item('old-A')],mutation:r=>r.url==='/api/library-items'?Response.json(value.snapshot.libraryItems):++mutations===1?oldA.promise:newA.promise});
 await value.settle();value.props().startReview();await value.settle();
 const fetchOriginal=globalThis.fetch;globalThis.fetch=(url,init)=>url==='/api/bootstrap'?pollGate.promise:fetchOriginal(url,init);await value.poll();
 const rejected=value.app.find('SwipePlanner').props.onReject(item('old-A'));await value.settle();
 value.snapshot.profile={id:'B',displayName:'B'};value.snapshot.libraryItems=[];pollGate.resolve(Response.json(value.snapshot));await value.settle();
 globalThis.fetch=fetchOriginal;value.snapshot.profile={id:'owner',displayName:'Returned A'};value.snapshot.libraryItems=[item('new-A')];await value.poll();
 value.props().startReview();await value.settle();const approved=value.app.find('SwipePlanner').props.onApprove(item('new-A'),approval);await value.settle();
 oldA.resolve(Response.json({...item('old-A'),status:'ARCHIVED'}));await rejected;await value.settle();
 assert.equal(value.app.find('SwipePlanner').props.busy,true,'same ID must not authorize old generation finally');assert.deepEqual(value.app.find('SwipePlanner').props.items.map(i=>i.id),['new-A']);
 newA.resolve(saved('returned-A-post'));await approved;await value.settle();
});

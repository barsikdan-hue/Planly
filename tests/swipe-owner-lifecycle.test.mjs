import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cleanup,item,deferred,find,text} from './helpers/library-editor-fixture.mjs';
import {writePendingCreation,readPendingCreation} from '../lib/client/pending-creation.ts';
import {blankPost} from '../lib/planner.ts';
afterEach(cleanup);
const approval={mode:'draft',providers:[],scheduledAt:null};
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

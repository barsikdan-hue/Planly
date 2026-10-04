import test,{before,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createHarness} from './helpers/planner-hook-harness.mjs';
import {writeRecovery} from '../lib/client/editor-recovery.ts';
import {writePendingCreation,readPendingCreation} from '../lib/client/pending-creation.ts';
import {blankPost} from '../lib/planner.ts';
register('./helpers/planner-lifecycle-loader.mjs',import.meta.url);
let PlannerApp; before(async()=>{({default:PlannerApp}=await import('../components/planner/app.tsx'));});
const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document};
const hs=[];afterEach(()=>{hs.splice(0).forEach(h=>h.unmount());Object.assign(globalThis,original);});
const item={id:'ready',title:'Title',text:'Queue text',mediaIds:[],status:'READY',sourcePostId:null,createdAt:'2026-10-04T09:00:00Z',updatedAt:'2026-10-04T09:00:00Z'};
function cache(){const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function nodes(node,predicate){if(!node||typeof node!=='object')return[];const children=Array.isArray(node)?node:node.props?.children;return[...(predicate(node)?[node]:[]),...(Array.isArray(children)?children:[children]).flatMap(child=>nodes(child,predicate))];}
async function app(storage=cache(),mutation){
 globalThis.window={sessionStorage:storage,location:{hash:'#content',assign(){}},history:{replaceState(){}},scrollTo(){},confirm:()=>true,addEventListener(){},removeEventListener(){}};
 globalThis.document={hidden:false};const requests=[];
 globalThis.fetch=async(url,init)=>{requests.push({url,init});if(url==='/api/bootstrap')return Response.json({profile:{id:'owner',displayName:'Owner',email:'owner@example.test'},posts:[],media:[],socialAccounts:[],libraryItems:[item]});if(mutation)return mutation(url,init);throw Error(`Unexpected ${url}`);};
 const h=createHarness(PlannerApp);hs.push(h);await h.settle();return{h,requests,storage};
}
test('Library review opens without creating any Post; skip/reject/approve are separate callbacks',async()=>{
 const {h,requests}=await app();const library=h.find('ContentLibrary');
 assert.equal(typeof library.props.startReview,'function');library.props.startReview();await h.settle();
 const review=h.find('SwipePlanner');assert.ok(review);assert.equal(typeof review.props.onApprove,'function');assert.equal(typeof review.props.onReject,'function');
 assert.equal(requests.filter(r=>r.init?.method==='POST').length,0);
});
test('explicit draft queue approve creates source-linked Post without scheduler time and updates Library',async()=>{
 let savedInput;
 const {h,storage}=await app(undefined,(url,init)=>{
  if(url==='/api/posts'){savedInput=JSON.parse(init.body);return Response.json({id:'saved',title:savedInput.title,baseText:savedInput.baseText,status:'DRAFT',targets:[],mediaIds:[],createdAt:item.createdAt,updatedAt:item.updatedAt});}
  if(url==='/api/library-items')return Response.json([{...item,status:'USED',sourcePostId:'saved'}]);throw Error(`Unexpected ${url}`);
 });
 h.find('ContentLibrary').props.startReview();await h.settle();
 await h.find('SwipePlanner').props.onApprove(item,{mode:'draft',providers:[],scheduledAt:null});await h.settle();
 assert.equal(savedInput.status,'DRAFT');assert.deepEqual(savedInput.targets,[]);assert.equal(savedInput.sourceLibraryItemId,item.id);
 assert.equal(savedInput.sourceLibraryUpdatedAt,item.updatedAt);assert.equal(savedInput.title,item.title);
 assert.equal(readPendingCreation(storage,'owner'),null);assert.equal(h.find('SwipePlanner').props.items[0].status,'USED');
});
test('reload and explicit recovery of queue-origin pending preserve unrelated dirty Composer',async()=>{
 const storage=cache();const editor={...blankPost(),text:'Unrelated dirty Composer'};writeRecovery(storage,'owner',editor);
 writePendingCreation(storage,'owner',{version:1,key:'11111111-1111-4111-8111-111111111111',input:{baseText:item.text,status:'DRAFT',targets:[],mediaIds:[],sourceLibraryItemId:item.id},editor:{...blankPost(),text:item.text},intent:'draft',editorToken:'22222222-2222-4222-8222-222222222222',activeEditorToken:'22222222-2222-4222-8222-222222222222',origin:'swipe-planner'});
 const {h,requests}=await app(storage,(url)=>{
  if(url==='/api/posts')return Response.json({id:'recovered',baseText:item.text,status:'DRAFT',targets:[],mediaIds:[],createdAt:item.createdAt,updatedAt:item.updatedAt});
  if(url==='/api/library-items')return Response.json([{...item,status:'USED',sourcePostId:'recovered'}]);throw Error(`Unexpected ${url}`);
 });assert.equal(requests.length,1);h.find('ContentLibrary').props.startReview();await h.settle();
 assert.equal(h.find('SwipePlanner').props.pending,true);
 assert.ok(readPendingCreation(storage,'owner')); 
 assert.equal(JSON.parse(storage.getItem('planly:editor:v1:owner')).editor.text,'Unrelated dirty Composer');
 await nodes(h.tree,n=>n.props?.children==='Повторить сохранение')[0].props.onClick();await h.settle();
 assert.equal(readPendingCreation(storage,'owner'),null);
 assert.equal(JSON.parse(storage.getItem('planly:editor:v1:owner')).editor.text,'Unrelated dirty Composer');
});
for(const action of ['onApprove','onReject'])test(`stale ${action} refreshes card without overwriting newer Library content`,async()=>{
 const {h}=await app(undefined,(url)=>{
  if(url==='/api/library-items')return Response.json([{...item,text:'Updated elsewhere',updatedAt:'2026-10-04T10:00:00Z'}]);
  return Response.json({error:'Source changed',code:'LIBRARY_SOURCE_STALE'},{status:409});
 });h.find('ContentLibrary').props.startReview();await h.settle();
 await assert.rejects(h.find('SwipePlanner').props[action](item,{mode:'draft',providers:[],scheduledAt:null}));await h.settle();
 assert.equal(h.find('SwipePlanner').props.items[0].text,'Updated elsewhere');
});

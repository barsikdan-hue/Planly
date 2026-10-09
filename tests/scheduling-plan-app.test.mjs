import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createHarness} from './helpers/planner-hook-harness.mjs';
import {nodes,text,storage} from './helpers/scheduling-plan-fixture.mjs';
register('./helpers/planner-lifecycle-loader.mjs',import.meta.url);
const {default:App}=await import('../components/planner/app.tsx');
test('scheduling entry remains accessible with no drafts and uses current owner lifetime',async()=>{
 const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document};let h;
 try{globalThis.window={sessionStorage:storage(),localStorage:storage(),location:{hash:'#content',assign(){}},history:{replaceState(){}},scrollTo(){},addEventListener(){},removeEventListener(){}};globalThis.document={hidden:false};globalThis.fetch=async()=>Response.json({profile:{id:'owner',displayName:'Owner'},posts:[],media:[],socialAccounts:[],libraryItems:[]});h=createHarness(App);await h.settle();const button=nodes(h.tree,n=>n.props?.onClick&&text(n)==='Распределить по слотам')[0];assert.ok(button);button.props.onClick();await h.settle();const panel=h.find('SchedulingPlan');assert.ok(panel);assert.equal(panel.props.ownerContext.id,'owner');assert.equal(panel.props.isOwnerCurrent(panel.props.ownerContext),true);h.unmount();assert.equal(panel.props.isOwnerCurrent(panel.props.ownerContext),false);}finally{h?.unmount();Object.assign(globalThis,original);}
});

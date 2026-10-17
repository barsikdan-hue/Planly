import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cleanup,deferred} from './helpers/library-editor-fixture.mjs';
import {createHarness} from './helpers/planner-hook-harness.mjs';
import {cancelPostTargetApproval,PlanlyApiError} from '../lib/client/planly-api.ts';
const {ApprovalCancellation}=await import('../components/planner/approval-cancellation.tsx');
afterEach(cleanup);
const at='2026-10-17T10:00:00.000Z';
const input={expectedPublicationId:'auth',expectedPublicationUpdatedAt:at,expectedTargetUpdatedAt:at,expectedBindingRevision:3};
const target={id:'target',network:'telegram',status:'failed',approvalCancelledAt:null,cancelApproval:{...input,eligible:true,reason:'AVAILABLE',historicalDestinationId:'-123'}};

test('effect setup cleanup setup keeps actual cancellation completion visible',async()=>{
 const app=createHarness(()=>ApprovalCancellation({target,isCurrent:()=>true,onCancel:async()=>{}}));await app.settle();
 // React development StrictMode repeats effect setup with retained hook state.
 app.unmount();for(const hook of app.hooks)if(hook.cleanup)hook.deps=undefined;app.render();
 app.find('Button').props.onClick();await app.settle();assert.equal(app.find('AlertDialog').props.open,true);
 app.find('AlertDialogAction').props.onClick({preventDefault(){}});await app.settle();
 assert.equal(app.find('AlertDialog').props.open,false);assert.equal(app.find('Button').props.disabled,false);app.unmount();
});

test('client sends exact immutable preconditions to encoded target path',async()=>{
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({});};
 await cancelPostTargetApproval('p /','t /',input);assert.equal(calls[0].url,'/api/posts/p%20%2F/targets/t%20%2F/cancel-approval');assert.deepEqual(JSON.parse(calls[0].init.body),input);assert.equal(calls[0].init.cache,'no-store');assert.equal(new Headers(calls[0].init.headers).get('X-Planly-Social-Connection'),'1');
});

for(const outcome of ['success','conflict'])test(`departed component suppresses ${outcome} state updates`,async()=>{
 const gate=deferred();let current=true;const app=createHarness(()=>ApprovalCancellation({target,isCurrent:()=>current,onCancel:()=>gate.promise}));await app.settle();app.find('Button').props.onClick();await app.settle();app.find('AlertDialogAction').props.onClick({preventDefault(){}});await app.settle();
 app.unmount();current=false;app.changed=false;if(outcome==='success')gate.resolve();else gate.reject(new PlanlyApiError('conflict',409));await new Promise(r=>setTimeout(r,0));assert.equal(app.changed,false);
});

test('copy action opens unsaved blank-ID draft with empty target history and no API persistence',async()=>{
 const value=fixture({scheduled:true});await value.settle();await value.navigate('content');
 const content=value.app.find('Content').props,original=content.posts[0];original.targets[0]={...original.targets[0],...target};original.editBlockedReason='Frozen';
 content.duplicatePost(original);await value.settle();const copy=value.app.composer().draft;
 assert.equal(copy.id,'');assert.equal(copy.status,'draft');assert.deepEqual(copy.targets,[]);assert.equal(copy.editBlockedReason,null);assert.equal(copy.text,original.text);assert.deepEqual(copy.mediaIds,original.mediaIds);assert.equal(value.requests.length,0);
});

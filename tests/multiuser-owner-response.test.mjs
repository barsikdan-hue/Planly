import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, cleanup, deferred, find } from './helpers/library-editor-fixture.mjs';
import { blankPost } from '../lib/planner.ts';
import {createHarness} from './helpers/planner-hook-harness.mjs';
const {Settings}=await import('../components/planner/settings.tsx');
afterEach(cleanup);
test('Settings logout uses server session endpoint and clears the mounted private workspace',async()=>{
  const value=fixture({mutation:request=>{assert.equal(request.url,'/api/auth/logout');assert.equal(request.method,'POST');return Response.json({ok:true});}});
  await value.settle();await value.navigate('settings');
  const redirects=[];window.location.assign=url=>redirects.push(url);
  assert.equal(typeof value.app.find('Settings').props.logout,'function');
  await value.app.find('Settings').props.logout();await value.settle();
  assert.deepEqual(redirects,['/login']);assert.equal(value.app.find('Settings'),null);
});
test('A profile input is remounted for B rather than retaining A private edits',async()=>{
  const value=fixture({scheduled:true});await value.settle();await value.navigate('settings');
  let descriptor=value.app.find('Settings'),key=descriptor.key;
  let child=createHarness(()=>Settings(descriptor.props));await child.settle();
  find(child.tree,node=>node.type==='input' && node.props.id==='profile-name').props.onChange({target:{value:'A private profile draft'}});await child.settle();
  value.snapshot.profile={id:'B',displayName:'B name'};await value.poll();descriptor=value.app.find('Settings');
  if(descriptor.key!==key){child.unmount();child=createHarness(()=>Settings(descriptor.props));}
  await child.settle();assert.equal(find(child.tree,node=>node.type==='input' && node.props.id==='profile-name').props.value,'B name');child.unmount();
});
test('A post deletion confirmation text is removed on the B owner transition',async()=>{
  const value=fixture({scheduled:true});await value.settle();await value.navigate('content');
  value.app.find('Content').props.deletePost(value.props().posts[0]);await value.settle();assert.equal(value.app.find('AlertDialog').props.open,true);
  value.snapshot.profile={id:'B',displayName:'B'};value.snapshot.posts=[];await value.poll();
  assert.equal(value.app.find('AlertDialog').props.open,false);
});
test('late A logout does not clear/redirect B or retain A signingOut lock',async()=>{
  const pending=deferred(),value=fixture({scheduled:true,mutation:()=>pending.promise});await value.settle();await value.navigate('settings');
  const redirects=[];window.location.assign=url=>redirects.push(url);
  const operation=value.app.find('Settings').props.logout();await value.settle();
  value.snapshot.profile={id:'B',displayName:'B'};await value.poll();
  assert.equal(value.app.find('Settings').props.signingOut,false);
  pending.resolve(Response.json({ok:true}));await operation;await value.settle();assert.deepEqual(redirects,[]);assert.equal(value.app.find('Settings').props.name,'B');
});
test('late A delete response cannot close the current B post confirmation',async()=>{
  const pending=deferred(),value=fixture({scheduled:true,mutation:()=>pending.promise});await value.settle();await value.navigate('content');
  value.app.find('Content').props.deletePost(value.props().posts[0]);await value.settle();
  find(value.app.tree,node=>node.props?.className==='destructive-action').props.onClick();await value.settle();
  value.snapshot.profile={id:'B',displayName:'B'};value.snapshot.posts=value.snapshot.posts.map(p=>({...p,id:'b-post',baseText:'B private post'}));await value.poll();
  value.app.find('Content').props.deletePost(value.props().posts[0]);await value.settle();
  pending.resolve(new Response(null,{status:204}));await value.settle();
  assert.equal(value.app.find('AlertDialog').props.open,true);
});
for(const intent of ['draft','now'])for(const outcome of ['success','error','unauthorized']) {
  test(`delayed A ${intent}/${outcome} cannot enter B or unlock B pending save`,async()=>{
    const a=deferred(),b=deferred();
    const value=fixture({scheduled:true,media:[],mutation:(_request,n)=>n===1?a.promise:b.promise});
    const redirects=[];window.location.assign=url=>redirects.push(url);
    value.snapshot.socialAccounts=[{id:'tg',provider:'telegram',enabled:true,connectionStatus:'CONNECTED',providerAccountId:'-100123'}];
    await value.settle();await value.navigate('create');
    const draft={...blankPost(),text:'Private A',networks:['telegram'],date:'2099-10-06',time:'14:30'};
    value.app.composer().setDraft(draft);await value.settle();
    const opA=intent==='draft'?value.app.composer().save(draft,'draft'):value.app.composer().publishNow(draft);
    await value.settle();assert.equal(value.requests.length,1);
    value.snapshot.profile={id:'other',displayName:'B'};value.snapshot.posts=[];await value.poll();
    assert.equal(value.app.composer().draft.text,'','A pending response must not prevent B transition');
    const bDraft={...draft,text:'Private B'};value.app.composer().setDraft(bDraft);await value.settle();
    const opB=value.app.composer().save(bDraft,'draft');await value.settle();assert.equal(value.requests.length,2);
    a.resolve(outcome==='success'?Response.json({id:'a-result',title:null,baseText:'Private A',status:'DRAFT',targets:[],mediaIds:[],createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}):Response.json({error:'A rejected'},{status:outcome==='unauthorized'?401:409}));
    await opA;await value.settle();
    assert.equal(value.app.composer().draft.text,'Private B');assert.equal(value.app.composer().saving,true,'A completion cannot unlock B');
    assert.deepEqual(redirects,[],'expired A response cannot navigate active B to login');
    assert.ok(!value.app.find('ContentLibrary')?.props.posts?.some(p=>p.id==='a-result'));
    const recovery=JSON.parse(value.cache.getItem('planly:editor:v1:other'));assert.equal(recovery.editor.text,'Private B');
    b.resolve(Response.json({id:'b-result',title:null,baseText:'Private B',status:'DRAFT',targets:[],mediaIds:[],createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}));await opB;await value.settle();
    await value.navigate('content');assert.ok(!value.props().posts.some(p=>p.id==='a-result'));assert.ok(value.props().posts.some(p=>p.id==='b-result'));
  });
}

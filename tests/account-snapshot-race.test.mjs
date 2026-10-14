import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {toast} from 'sonner';
import {fixture, cleanup, deferred, find, text} from './helpers/library-editor-fixture.mjs';

const originalToast={success:toast.success,error:toast.error};
afterEach(()=>{cleanup();Object.assign(toast,originalToast);});
const account=(enabled)=>({id:'tg',provider:'telegram',displayName:'Telegram',providerAccountId:'-100123456',enabled,connectionStatus:'CONNECTED'});
const settings=value=>value.app.find('Settings').props;
async function open(mutation=()=>Response.json(account(false))) {
  toast.success=()=>{};toast.error=()=>{};
  const value=fixture({scheduled:true,mutation});
  value.snapshot.socialAccounts=[account(true)];
  await value.settle();await value.navigate('settings');
  assert.equal(settings(value).accounts[0].enabled,true);
  return value;
}
function holdSnapshot(value) {
  const held=deferred(), stale=Response.json(structuredClone(value.snapshot));
  const previous=globalThis.fetch;let reads=0;
  globalThis.fetch=(url,init)=>url==='/api/bootstrap'&&!init?(reads++,held.promise):previous(url,init);
  return {held,stale,previous,reads:()=>reads};
}

test('a late same-owner poll cannot overwrite an acknowledged account toggle',async()=>{
  const value=await open();value.snapshot.posts[0].baseText='Fresh server post update';const poll=holdSnapshot(value);
  await value.poll();assert.equal(poll.reads(),1);
  settings(value).toggle('tg',false);await value.settle();
  assert.equal(settings(value).accounts[0].enabled,false,'successful PATCH is visible before stale GET resolves');
  assert.equal(value.requests.length,1);assert.equal(value.requests[0].method,'PATCH');
  poll.held.resolve(poll.stale);await value.settle();
  assert.equal(settings(value).accounts[0].enabled,false,'old GET cannot undo acknowledged disabled state');
  assert.equal(value.app.find('Navigation').props.posts[0].text,'Fresh server post update','account guard must not suppress post refresh');
  globalThis.fetch=poll.previous;
  value.snapshot.socialAccounts=[account(true)];await value.poll();
  assert.equal(settings(value).accounts[0].enabled,true,'a fresh authoritative GET can still update account state');
});

test('a poll begun during a pending toggle cannot overwrite its later acknowledgement',async()=>{
  const patch=deferred();const value=await open(()=>patch.promise);
  settings(value).toggle('tg',false);await value.settle();
  const poll=holdSnapshot(value);await value.poll();assert.equal(poll.reads(),1);
  patch.resolve(Response.json(account(false)));await value.settle();
  assert.equal(settings(value).accounts[0].enabled,false);
  poll.held.resolve(poll.stale);await value.settle();
  assert.equal(settings(value).accounts[0].enabled,false);
});

test('an account PATCH failure leaves later authoritative polls usable',async()=>{
  const value=await open(()=>Response.json({error:'synthetic denied'},{status:403}));
  settings(value).toggle('tg',false);await value.settle();
  assert.equal(settings(value).accounts[0].enabled,true);
  value.snapshot.socialAccounts=[account(false)];await value.poll();
  assert.equal(settings(value).accounts[0].enabled,false);
});

test('a late scheduling refresh cannot undo an acknowledged account toggle',async()=>{
  const value=await open();const launch=find(value.app.tree,n=>typeof n.props?.onClick==='function'&&text(n)==='Распределить по слотам');
  launch.props.onClick();await value.settle();
  const poll=holdSnapshot(value);
  const refreshed=value.app.find('SchedulingPlan').props.onSaved();await value.settle();
  assert.equal(poll.reads(),1);
  await value.navigate('settings');settings(value).toggle('tg',false);await value.settle();
  assert.equal(settings(value).accounts[0].enabled,false);
  poll.held.resolve(poll.stale);await refreshed;await value.settle();
  assert.equal(settings(value).accounts[0].enabled,false);
});

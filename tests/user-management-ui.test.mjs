import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createHarness} from './helpers/planner-hook-harness.mjs';
register('./helpers/planner-lifecycle-loader.mjs',import.meta.url);
const {UserManagement}=await import('../components/planner/user-management.tsx');
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
let app;
afterEach(()=>{app?.unmount();globalThis.fetch=originalFetch;globalThis.window=originalWindow;});
const colleague={id:'fixture-user',email:'colleague@example.test',displayName:'Коллега',accessState:'ACTIVE',createdAt:'2026-10-15T00:00:00.000Z'};
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children??node].flat(Infinity)){if(child===node)continue;const found=find(child,predicate);if(found)return found;}return null;}
function text(node){if(typeof node==='string')return node;if(!node||typeof node!=='object')return '';return [node.props?.children??node].flat(Infinity).filter(x=>x!==node).map(text).join('');}
const button=label=>find(app.tree,node=>node.type==='button'&&text(node)===label);
async function setup(mutate){globalThis.window={location:{assign(){}}};globalThis.fetch=async(url,init)=>init?.method==='POST'?mutate(url,init):Response.json({users:[colleague]});app=createHarness(()=>UserManagement());await app.settle();}
test('cancelled confirmation never changes access; confirmed block updates the existing screen',async()=>{
  const writes=[];
  await setup(async(url,init)=>{writes.push({url,body:JSON.parse(init.body)});return Response.json({user:{...colleague,accessState:'BLOCKED'}});});
  button('Заблокировать').props.onClick();await app.settle();
  assert.ok(find(app.tree,n=>n.props?.role==='alertdialog'));assert.equal(writes.length,0);
  button('Отмена').props.onClick();await app.settle();assert.equal(writes.length,0);
  button('Заблокировать').props.onClick();await app.settle();
  await button('Подтвердить').props.onClick();await app.settle();
  assert.deepEqual(writes,[{url:'/api/admin/users/fixture-user',body:{action:'block'}}]);
  assert.ok(button('Восстановить доступ'));assert.ok(find(app.tree,n=>n.props?.role==='status'));
});
test('expired ADMIN mutation cannot show success or retain a colleague action',async()=>{
  const redirects=[];await setup(async()=>Response.json({error:'Unauthorized'},{status:401}));
  window.location.assign=url=>redirects.push(url);
  button('Заблокировать').props.onClick();await app.settle();await button('Подтвердить').props.onClick();await app.settle();
  assert.deepEqual(redirects,['/login']);assert.equal(find(app.tree,n=>n.props?.role==='status'),null);
});
test('two confirmation callbacks while one mutation is pending send only once',async()=>{
  let release,writes=0;const held=new Promise(resolve=>{release=resolve;});
  await setup(async()=>{writes++;await held;return Response.json({user:{...colleague,accessState:'BLOCKED'}});});
  button('Заблокировать').props.onClick();await app.settle();const confirm=button('Подтвердить').props.onClick;
  const first=confirm(),second=confirm();assert.equal(writes,1);
  release();await Promise.all([first,second]);await app.settle();assert.ok(button('Восстановить доступ'));
});

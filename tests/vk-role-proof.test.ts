import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateVkCommunity,VkCommunityValidationError} from '../lib/server/connectors/vk.ts';
import {vkCommunityOAuthFailure} from '../lib/server/vk/diagnostics.ts';

const token='role-proof-private-token';
const active={id:242095689,type:'group',name:'Fixture'};
function fixture(group:unknown=active,list:unknown={count:1,items:[242095689]},errorCode?:number){
 const calls:Array<{url:string;body:URLSearchParams}>=[];
 const fetchImpl:typeof fetch=async(url,init)=>{
  const body=new URLSearchParams(String(init?.body));calls.push({url:String(url),body});
  assert.equal(init?.redirect,'error');assert.equal(init?.method,'POST');assert.equal(body.get('access_token'),token);
  return String(url).endsWith('/groups.getById')?Response.json({response:{groups:[group]}}):errorCode?Response.json({error:{error_code:errorCode,error_msg:token}}):Response.json({response:list});
 };
 return {calls,run:()=>validateVkCommunity({token,communityId:'242095689',fetchImpl})};
}
test('missing role fields require positive server-filtered current-user editor membership',async()=>{
 const f=fixture();const r=await f.run();assert.equal(r.destinationId,'-242095689');assert.equal(r.authorizationProof,'EDITOR_FILTER');assert.equal(f.calls.length,2);
 const call=f.calls[1];assert.equal(call.url,'https://api.vk.com/method/groups.get');assert.equal(call.body.get('filter'),'editor');assert.equal(call.body.get('extended'),'0');assert.equal(call.body.get('count'),'1000');assert.equal(call.body.has('user_id'),false);assert.equal(call.body.has('offset'),false);
});
test('target membership proves authority even when further pages exist; no pagination or guessed subject',async()=>{const f=fixture(active,{count:1200,items:[242095689]});assert.equal((await f.run()).authorizationProof,'EDITOR_FILTER');assert.equal(f.calls.length,2);});
for(const fields of [{is_admin:0,admin_level:0},{is_admin:1,admin_level:1},{is_admin:0,admin_level:3},{is_admin:1},{admin_level:3},{is_admin:'1',admin_level:'3'},{is_admin:null,admin_level:null}])test(`explicit/partial/invalid role does not trigger alternate proof ${JSON.stringify(fields)}`,async()=>{const f=fixture({...active,...fields});await assert.rejects(f.run());assert.equal(f.calls.length,1);});
for(const group of [{...active,id:999},{...active,deactivated:'banned'},{...active,type:'user'}])test(`wrong/inactive community never asks editor membership ${JSON.stringify(group)}`,async()=>{const f=fixture(group);await assert.rejects(f.run());assert.equal(f.calls.length,1);});
for(const list of [{count:0,items:[]},{count:1,items:[999]},{count:3000,items:[999]},[242095689],{items:[242095689]},{count:0,items:[242095689]},{count:'1',items:[242095689]},{count:1,items:['242095689']},{count:1,items:[{id:242095689}]},{count:2,items:[242095689,242095689]},{count:1,items:[0]},{count:1,items:[-242095689]},{count:1.5,items:[242095689]}])test(`malformed/absent editor membership fails closed ${JSON.stringify(list)}`,async()=>{const f=fixture(active,list);await assert.rejects(f.run(),e=>e instanceof VkCommunityValidationError&&e.code==='VK_POST_PERMISSION');assert.equal(f.calls.length,2);});
for(const code of [7,15,1051])test(`filtered membership provider error ${code} stops and retains closed OAuth diagnostics`,async()=>{const f=fixture(active,{},code);await assert.rejects(f.run(),e=>{
 assert.ok(e instanceof VkCommunityValidationError);assert.equal(e.vkDiagnostic?.stage,'COMMUNITY_VALIDATION');assert.equal(e.vkDiagnostic?.method,'groups.get');assert.equal(e.vkDiagnostic?.vkErrorCode,code);assert.ok(!JSON.stringify(e).includes(token));
 const wrapped=vkCommunityOAuthFailure(e);assert.equal(wrapped.communityValidationMetadata?.vkErrorCode,code);return true;
 });assert.equal(f.calls.length,2);});

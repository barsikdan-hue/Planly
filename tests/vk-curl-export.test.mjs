import test from 'node:test';
import assert from 'node:assert/strict';
import {exportAddress} from '../public/vk-curl-export-core.mjs';
const payload={groupId:242095689,uploadUrl:'https://pu.vk.ru/c1/ss2/upload.php?act=do_add&wallphoto=1&hash=private',imageBase64:btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0,0,0))};
test('export writes only approved address and timestamp, never image or token',async()=>{
 let output;const handle={createWritable:async()=>({write:async v=>{output=v;},close:async()=>{}})};
 assert.deepEqual(await exportAddress({payload,handle,active:()=>true,claim:()=>true,now:()=>123}),{status:'ADDRESS_EXPORTED'});
 assert.deepEqual(JSON.parse(output),{uploadUrl:payload.uploadUrl,exportedAt:123});
});
test('cancelled or invalid export never opens writer, failures have no private reflection',async()=>{
 let calls=0;const handle={createWritable:async()=>{calls++;throw Error(payload.uploadUrl);}};
 assert.deepEqual(await exportAddress({payload,handle,active:()=>false}),{status:'CANCELLED'});assert.equal(calls,0);
 assert.deepEqual(await exportAddress({payload,handle,active:()=>true,claim:()=>true}),{status:'EXPORT_UNCONFIRMED'});assert.equal(calls,1);
});
test('consumed export marker blocks another write',async()=>{
 let calls=0;const handle={createWritable:async()=>{calls++;}};
 assert.deepEqual(await exportAddress({payload,handle,active:()=>true,claim:()=>false}),{status:'ALREADY_ATTEMPTED'});
 assert.equal(calls,0);
});
test('cancel during write aborts instead of committing the address',async()=>{
 let active=true,release,closed=0,aborted=0;
 const handle={createWritable:async()=>({write:()=>new Promise(r=>{release=r;}),close:async()=>{closed++;},abort:async()=>{aborted++;}})};
 const pending=exportAddress({payload,handle,active:()=>active,claim:()=>true});
 await new Promise(r=>setImmediate(r));active=false;release();
 assert.deepEqual(await pending,{status:'CANCELLED'});assert.equal(closed,0);assert.equal(aborted,1);
});

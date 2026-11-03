import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {request as httpsRequest} from 'node:https';
import {relayUpload} from '../lib/server/vk/upload-relay-transport.ts';
import {parseRelayInput} from '../lib/server/vk/upload-relay.ts';
const input=()=>parseRelayInput({groupId:242095689,uploadUrl:'https://pu.vk.ru/c1/ss1/upload.php?act=do_add&wallphoto=1&hash=synthetic',
  imageBase64:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')});
for(const kind of ['html','limit','error'] as const){
  test(`transport captures safe rejection metadata (${kind}) with one unchanged POST`,async()=>{
    let calls=0,destroyed=false;
    const request=((_url:URL,options:{method:string},callback:(res:EventEmitter)=>void)=>{
      assert.equal(options.method,'POST');calls++;
      return Object.assign(new EventEmitter(),{destroy(){},end(){
        const res=Object.assign(new EventEmitter(),{statusCode:405,headers:{allow:'GET, HEAD','content-type':'text/html','set-cookie':'private'},destroy(){destroyed=true;}});
        callback(res);queueMicrotask(()=>{
          if(kind==='error')res.emit('error',Error('private-url'));
          else{res.emit('data',kind==='limit'?Buffer.alloc(4097):Buffer.from('<h1>405 Not Allowed</h1>private-url'));res.emit('end');}
        });
      }});
    }) as unknown as typeof httpsRequest;
    const result=await relayUpload(input(),{resolve:async()=>['87.240.190.67'],request});
    assert.equal(calls,1);assert.equal(result.httpStatus,405);assert.equal(result.status,'UPSTREAM_HTTP_REJECTED');
    assert.deepEqual(result.diagnostic,{allowPost:'NO',contentType:'HTML',body:kind==='html'?'METHOD_REJECTION':kind==='limit'?'LIMIT':'INCOMPLETE'});
    assert.equal(JSON.stringify(result).includes('private'),false);if(kind==='limit')assert.equal(destroyed,true);
  });
}

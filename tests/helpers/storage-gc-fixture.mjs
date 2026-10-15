// Disposable transport fixture, not a database or provider client.
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createS3Storage, readMediaObjectBytes } from '../../lib/server/storage.ts';
import { resetServerEnvForTests } from '../../lib/server/env.ts';

const nativeTimeout=AbortSignal.timeout.bind(AbortSignal);
let mode='GET headers',budget='individual',held,closeRequest;
const server=createServer(async(request,response)=>{
  for await(const chunk of request)void chunk;
  held=response;
  const closed=closeRequest;response.once('close',()=>closed());
  if(mode==='GET body'){response.writeHead(200);response.write(Buffer.from('x'));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const config={S3_ENDPOINT:`http://127.0.0.1:${server.address().port}`,S3_REGION:'fixture',S3_BUCKET:'fixture',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture'};
Object.assign(process.env,config);delete process.env.S3_PUBLIC_ENDPOINT;resetServerEnvForTests();
// Scale only native timers. Do not retain timeout sources in mocks or spies:
// doing so would hide the weak-reference defect in Node22.13 AbortSignal.any.
AbortSignal.timeout=milliseconds=>nativeTimeout(milliseconds===30_000?(budget==='individual'?150:1500):milliseconds===60_000?(budget==='individual'?1500:150):milliseconds);
const results=[];
try{
  for(const limit of ['individual','batch'])for(const gc of [false,true])for(const variant of ['GET headers','GET body','PUT']){
    budget=limit;
    mode=variant;
    const closed=new Promise(resolve=>{closeRequest=resolve;});
    const parent=AbortSignal.timeout(60_000);
    const collect=gc?setInterval(()=>globalThis.gc(),5):undefined;
    const keepAlive=setInterval(()=>{},100);
    let watchdogFired=false;
    const watchdog=setTimeout(()=>{watchdogFired=true;held?.destroy();},2200);
    try{
      if(mode==='PUT')await createS3Storage(config).put('held',Buffer.from('x'),'image/png',parent);
      else await readMediaObjectBytes('held',2,parent);
      results.push({budget,gc,variant,unexpectedSuccess:true});
    }catch(error){
      const transportClosed=await Promise.race([closed.then(()=>true),delay(500).then(()=>false)]);
      results.push({budget,gc,variant,parentAborted:parent.aborted,error:error.name,watchdogFired,transportClosed});
    }
    finally{clearTimeout(watchdog);clearInterval(collect);clearInterval(keepAlive);held?.destroy();}
  }
}finally{AbortSignal.timeout=nativeTimeout;await new Promise(resolve=>server.close(resolve));resetServerEnvForTests();}
console.log(JSON.stringify(results));

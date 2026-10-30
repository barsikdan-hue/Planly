import {resolve4} from 'node:dns/promises';
import {request} from 'node:https';
import {randomBytes} from 'node:crypto';
import {isPublicRelayIpv4,type RelayInput,type RelayResult} from './upload-relay.ts';

type RelayNetwork={resolve:(host:string)=>Promise<string[]>;request:typeof request};
export async function relayUpload(input:RelayInput,network:RelayNetwork={resolve:host=>resolve4(host),request}):Promise<RelayResult>{
  // Resolve only the already validated exact host and pin the TCP destination.
  if(input.uploadUrl.hostname!=='pu.vk.ru')return {status:'UPSTREAM_UNCONFIRMED'};
  let dnsTimer:ReturnType<typeof setTimeout>|undefined;
  let addresses:string[];
  try{
    addresses=await Promise.race([network.resolve('pu.vk.ru'),new Promise<never>((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('DNS deadline')),5000);})]);
    if(!addresses.length||!addresses.every(isPublicRelayIpv4))return {status:'UPSTREAM_UNCONFIRMED'};
  }catch{return {status:'UPSTREAM_UNCONFIRMED'};}finally{clearTimeout(dnsTimer);}
  const boundary='planly-'+randomBytes(16).toString('hex');
  const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="planly-server-test.png"\r\nContent-Type: image/png\r\n\r\n`),input.image,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return new Promise(resolve=>{
    let settled=false;
    const done=(value:RelayResult)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    const req=network.request(input.uploadUrl,{method:'POST',family:4,agent:false,servername:'pu.vk.ru',
      lookup:(_host,_options,callback)=>callback(null,addresses[0],4),
      headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':String(payload.length)}},res=>{
      const code=res.statusCode;
      if(!code||code<200||code>=300){res.destroy();done({status:'UPSTREAM_HTTP_REJECTED',...(code?{httpStatus:code}:{})});return;}
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_100_000){res.destroy();done({status:'UPSTREAM_RESPONSE_INVALID',httpStatus:code});}else chunks.push(chunk);});
      res.on('error',()=>done({status:'UPSTREAM_UNCONFIRMED'}));
      res.on('end',()=>{
        try{
          const raw=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {server?:unknown;photo?:unknown;hash?:unknown};
          if(!Number.isSafeInteger(raw?.server)||Number(raw.server)<=0||typeof raw.photo!=='string'||!raw.photo.trim()||raw.photo.trim()==='[]'||raw.photo.length>1_048_576||typeof raw.hash!=='string'||!raw.hash.trim()||raw.hash.length>8192)throw {};
          done({status:'UPLOAD_CONFIRMED',httpStatus:code});
        }catch{done({status:'UPSTREAM_RESPONSE_INVALID',httpStatus:code});}
      });
    });
    req.on('error',()=>done({status:'UPSTREAM_UNCONFIRMED'}));
    const timer=setTimeout(()=>{req.destroy();done({status:'UPSTREAM_UNCONFIRMED'});},30_000);
    req.end(payload);
  });
}

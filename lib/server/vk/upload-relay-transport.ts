import {resolve4} from 'node:dns/promises';
import {request} from 'node:https';
import {randomBytes} from 'node:crypto';
import {isPublicRelayIpv4,parseRelayUploadUrl,type RelayInput,type RelayResult,type RelayReceiptResult} from './upload-relay.ts';
import {classifyRejection} from './upload-rejection.ts';
import {sanitizeUploadReceipt} from '../../../public/vk-upload-receipt.mjs';

type RelayNetwork={resolve:(host:string)=>Promise<string[]>;request:typeof request};
export async function relayUpload(input:RelayInput,network:RelayNetwork={resolve:host=>resolve4(host),request}):Promise<RelayResult>{
  const result=await relayUploadReceipt(input,network);
  return {status:result.status,...(result.httpStatus!==undefined?{httpStatus:result.httpStatus}:{}),...(result.diagnostic?{diagnostic:result.diagnostic}:{})};
}
export async function relayUploadReceipt(input:RelayInput,network:RelayNetwork={resolve:host=>resolve4(host),request}):Promise<RelayReceiptResult>{
  // Resolve only the already validated exact host and pin the TCP destination.
  let uploadUrl:URL;
  try{uploadUrl=parseRelayUploadUrl(input.uploadUrl.toString());}catch{return {status:'UPSTREAM_UNCONFIRMED'};}
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
    const deadline:{timer?:ReturnType<typeof setTimeout>}={};
    let incompleteRejection:(()=>void)|undefined;
    const done=(value:RelayReceiptResult)=>{if(settled)return;settled=true;clearTimeout(deadline.timer);resolve(value);};
    let req:ReturnType<typeof request>;
    try{req=network.request(uploadUrl,{method:'POST',family:4,agent:false,servername:'pu.vk.ru',rejectUnauthorized:true,
      lookup:(_host,_options,callback)=>callback(null,addresses[0],4),
      headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':String(payload.length)}},res=>{
      const code=res.statusCode;
      if(!code||code<200||code>=300){
        const chunks:Buffer[]=[];let size=0;
        const rejected=(state:'COMPLETE'|'LIMIT'|'INCOMPLETE')=>{
          if(settled)return;
          const diagnostic=classifyRejection(res.headers??{},Buffer.concat(chunks),state);chunks.length=0;
          done({status:'UPSTREAM_HTTP_REJECTED',...(code?{httpStatus:code}:{}),diagnostic});
        };
        incompleteRejection=()=>rejected('INCOMPLETE');
        res.on('data',(chunk:Buffer)=>{
          if(settled)return;
          if(size+chunk.length>4096){rejected('LIMIT');res.destroy();return;}
          size+=chunk.length;chunks.push(chunk);
        });
        res.on('error',incompleteRejection);res.on('aborted',incompleteRejection);
        res.on('end',()=>rejected('COMPLETE'));return;
      }
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(chunk:Buffer)=>{if(settled)return;size+=chunk.length;if(size>1_100_000){done({status:'UPSTREAM_RESPONSE_INVALID',httpStatus:code});res.destroy();}else chunks.push(chunk);});
      res.on('error',()=>done({status:'UPSTREAM_UNCONFIRMED'}));
      res.on('end',()=>{
        if(settled)return;
        try{
          const receipt=sanitizeUploadReceipt(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          if(!receipt)throw {};
          done({status:'UPLOAD_CONFIRMED',httpStatus:code,receipt});
        }catch{done({status:'UPSTREAM_RESPONSE_INVALID',httpStatus:code});}
      });
    });}catch{done({status:'UPSTREAM_UNCONFIRMED'});return;}
    req.on('error',()=>{if(incompleteRejection)incompleteRejection();else done({status:'UPSTREAM_UNCONFIRMED'});});
    deadline.timer=setTimeout(()=>{incompleteRejection?.();req.destroy();done({status:'UPSTREAM_UNCONFIRMED'});},30_000);
    try{req.end(payload);}catch{req.destroy();done({status:'UPSTREAM_UNCONFIRMED'});}
  });
}

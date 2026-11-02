import {ORIGIN,WINDOW_PATH,TTL,validNonce,validatePayload,safeResult} from '../../public/vk-upload-window-core.mjs';
import {inspectPreconditions} from './single-photo-test.mjs';
import {DIAGNOSTIC_OPERATION} from '../../public/vk-upload-diagnostic.mjs';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
// Must be called directly from the user's click, before awaiting VK or Web Locks.
export function openFirstPartyUpload({openWindow=(...args)=>window.open(...args),events=globalThis,now=Date.now,
  randomNonce=random,schedule=f=>setInterval(f,250),stop=clearInterval}={}){
  const nonce=randomNonce();let popup=null,done=false,outcome=null,options=null,payload=null,admitted=false,hello=false,sent=false,acknowledged=false,timer=null;
  const deadline=now()+TTL;let resolve;
  const completion=new Promise(r=>{resolve=r;});
  const post=m=>{try{popup?.postMessage(m,ORIGIN);}catch{finish({status:'WINDOW_UNAVAILABLE'});}};
  const finish=raw=>{
    if(done)return;done=true;outcome=safeResult(raw);payload=null;options=null;
    events.removeEventListener('message',receive);if(timer!==null)stop(timer);resolve(outcome);
  };
  const cancel=status=>{if(!done){try{popup?.postMessage({type:'CANCEL',nonce},ORIGIN);}catch{/* closed */}finish({status});}};
  const active=()=>!done&&now()<deadline&&(!options||options.active());
  const send=()=>{
    if(!active()){cancel('CANCELLED');return;}
    if(admitted&&payload&&!sent){sent=true;post({type:'PAYLOAD',nonce,payload});payload=null;}
  };
  function receive(event){
    if(done||event.origin!==ORIGIN||event.source!==popup||!event.data||typeof event.data!=='object')return;
    const m=event.data;
    if(!active()){cancel('WINDOW_EXPIRED');return;}
    if(m.type==='READY'&&!hello&&m.operation===DIAGNOSTIC_OPERATION&&Object.keys(m).sort().join(',')==='operation,type'){
      hello=true;post({type:'HELLO',nonce,operation:DIAGNOSTIC_OPERATION});return;
    }
    if(!hello||m.nonce!==nonce)return;
    if(m.type==='CONFIRM_REQUEST'&&sent&&!acknowledged&&validNonce(m.challenge)&&Object.keys(m).sort().join(',')==='challenge,nonce,type'){
      acknowledged=true;post({type:'CONFIRM_ACK',nonce,challenge:m.challenge});return;
    }
    if(m.type==='ADMITTED'&&!admitted&&Object.keys(m).sort().join(',')==='nonce,type'){admitted=true;send();return;}
    if(m.type==='RESULT'&&Object.keys(m).sort().join(',')==='nonce,result,type')finish(m.result);
  }
  events.addEventListener('message',receive);
  try{if(validNonce(nonce))popup=openWindow(ORIGIN+WINDOW_PATH,'_blank','popup,width=620,height=780');}catch{/* blocked */}
  if(!popup)finish({status:'WINDOW_UNAVAILABLE'});
  else timer=schedule(()=>{if(popup.closed)cancel('WINDOW_UNAVAILABLE');else if(now()>=deadline)cancel('WINDOW_EXPIRED');else if(!active())cancel('CANCELLED');});
  return {
    async run(input){
      if(done)return outcome;
      if(options){cancel('CANCELLED');return completion;}
      options=input;
      if(inspectPreconditions(input)!=='READY'){cancel('PAYLOAD_REJECTED');return completion;}
      const uploadUrl=input.uploadUrl;
      try{
        const bytes=new Uint8Array(await input.image.arrayBuffer());
        if(!active()){cancel('CANCELLED');return completion;}
        const parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
        payload=validatePayload({groupId:242095689,uploadUrl,imageBase64:btoa(parts.join(''))});send();
      }catch{cancel('PAYLOAD_REJECTED');}
      return completion;
    },
    cancel:()=>cancel('CANCELLED'),
  };
}

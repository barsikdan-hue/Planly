import {ORIGIN,TTL,USER_UPLOAD_OPERATION,USER_UPLOAD_WINDOW_PATH,validNonce,validateUserUploadPayload,safeUserUploadResult} from '../../public/vk-user-upload-core.mjs';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
// Open synchronously in the click handler; no token is placed in the window URL.
export function openUserTokenUpload({openWindow=(...args)=>window.open(...args),events=globalThis,now=Date.now,randomNonce=random,
  schedule=f=>setInterval(f,250),stop=clearInterval}={}){
  const nonce=randomNonce(),deadline=now()+TTL;let popup=null,done=false,outcome=null,input=null,payload=null,hello=false,admitted=false,sent=false,acknowledged=false,timer=null,resolve;
  const completion=new Promise(r=>{resolve=r;});
  const active=()=>!done&&now()<deadline&&(!input||input.active());
  const finish=raw=>{
    if(done)return;done=true;input=null;payload=null;outcome=safeUserUploadResult(raw);
    events.removeEventListener('message',receive);if(timer!==null)stop(timer);resolve(outcome);
  };
  const post=message=>{try{popup?.postMessage(message,ORIGIN);}catch{finish({status:'WINDOW_UNAVAILABLE'});}};
  const cancel=status=>{if(done)return;try{popup?.postMessage({type:'CANCEL',nonce},ORIGIN);}catch{/* Closed peer. */}finish({status});};
  const send=()=>{
    if(!active()){cancel('CANCELLED');return;}
    if(admitted&&payload&&!sent){sent=true;post({type:'PAYLOAD',nonce,payload});payload=null;}
  };
  function receive(event){
    if(done||event.origin!==ORIGIN||event.source!==popup||!event.data||typeof event.data!=='object'||Array.isArray(event.data))return;
    const m=event.data;
    if(!active()){cancel('WINDOW_EXPIRED');return;}
    if(m.type==='READY'&&!hello&&m.operation===USER_UPLOAD_OPERATION&&Object.keys(m).sort().join(',')==='operation,type'){
      hello=true;post({type:'HELLO',nonce,operation:USER_UPLOAD_OPERATION});return;
    }
    if(!hello||m.nonce!==nonce)return;
    if(m.type==='ADMITTED'&&!admitted&&Object.keys(m).sort().join(',')==='nonce,type'){admitted=true;send();return;}
    if(m.type==='CONFIRM_REQUEST'&&sent&&!acknowledged&&validNonce(m.challenge)&&Object.keys(m).sort().join(',')==='challenge,nonce,type'){
      acknowledged=true;post({type:'CONFIRM_ACK',nonce,challenge:m.challenge});return;
    }
    if(m.type==='RESULT'&&Object.keys(m).sort().join(',')==='nonce,result,type')finish(m.result);
  }
  events.addEventListener('message',receive);
  try{if(validNonce(nonce))popup=openWindow(ORIGIN+USER_UPLOAD_WINDOW_PATH,'_blank','popup,width=620,height=780');}catch{/* Popup blocked. */}
  if(!popup)finish({status:'WINDOW_UNAVAILABLE'});
  else timer=schedule(()=>{if(popup.closed)cancel('WINDOW_UNAVAILABLE');else if(now()>=deadline)cancel('WINDOW_EXPIRED');else if(!active())cancel('CANCELLED');});
  return {
    run(options){
      if(done)return Promise.resolve(outcome);
      if(input){cancel('CANCELLED');return completion;}
      try{
        if(typeof options?.active!=='function')throw Error();
        payload=validateUserUploadPayload({groupId:242095689,accessToken:options.accessToken,scopes:['wall','photos','groups'],issuedAt:now()},now());
        input={active:options.active};send();
      }catch{cancel('PAYLOAD_REJECTED');}
      return completion;
    },
    cancel:()=>cancel('CANCELLED'),
  };
}

export const ORIGIN='https://stage.lentaro.ru';
export const WINDOW_PATH='/social-connections/vk-upload-test';
export const TTL=120_000;
export const OPERATION='planly-vk-server-upload-only-20261030-01';
export const validNonce=n=>typeof n==='string'&&/^[a-f0-9]{32}$/.test(n);
export const randomWindowNonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validatePayload(p){
  if(!record(p)||Object.keys(p).sort().join(',')!=='groupId,imageBase64,uploadUrl'||p.groupId!==242095689
    ||typeof p.uploadUrl!=='string'||p.uploadUrl.length>8192||/[\r\n\0]/.test(p.uploadUrl)
    ||typeof p.imageBase64!=='string'||!p.imageBase64||p.imageBase64.length>1_333_336
    ||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.imageBase64))throw Error('Invalid payload');
  const u=new URL(p.uploadUrl);
  if(u.protocol!=='https:'||u.hostname!=='pu.vk.ru'||u.port||u.username||u.password||u.hash
    ||!/^\/c\d{1,12}\/ss\d{1,12}\/upload\.php$/.test(u.pathname)
    ||u.searchParams.get('act')!=='do_add'||u.searchParams.getAll('act').length!==1
    ||u.searchParams.get('wallphoto')!=='1'||u.searchParams.getAll('wallphoto').length!==1
    ||/[\r\n\0]/.test(decodeURIComponent(u.toString())))throw Error('Invalid payload');
  for(const key of u.searchParams.keys())if(/^(access_token|refresh_token|authorization)$/i.test(key))throw Error('Invalid payload');
  const bytes=atob(p.imageBase64);
  if(bytes.length<12||bytes.length>1_000_000||btoa(bytes)!==p.imageBase64
    ||![137,80,78,71,13,10,26,10].every((v,i)=>bytes.charCodeAt(i)===v))throw Error('Invalid payload');
  return Object.freeze({groupId:p.groupId,uploadUrl:p.uploadUrl,imageBase64:p.imageBase64});
}
const results=new Set(['UPLOAD_CONFIRMED','UPSTREAM_HTTP_REJECTED','UPSTREAM_RESPONSE_INVALID','UPSTREAM_UNCONFIRMED',
  'ALREADY_ATTEMPTED','OWNER_SESSION_REQUIRED','OWNER_ACCESS_DENIED','ADMISSION_UNAVAILABLE','INVALID_INPUT','FORBIDDEN',
  'CANCELLED','MARKER_UNAVAILABLE','SERVER_UPLOAD_UNCONFIRMED','WINDOW_UNAVAILABLE','WINDOW_EXPIRED','PAYLOAD_REJECTED']);
export function safeResult(raw){
  const status=record(raw)&&results.has(raw.status)?raw.status:'SERVER_UPLOAD_UNCONFIRMED';
  return {status,...(Number.isSafeInteger(raw?.httpStatus)&&raw.httpStatus>=100&&raw.httpStatus<=599?{httpStatus:raw.httpStatus}:{})};
}
export async function ownerAdmission(fetchImpl){
  try{
    const r=await fetchImpl('/api/social-accounts/vk/upload-test',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});
    const body=await r.json();
    if(r.status===200&&body?.status==='OWNER_SESSION_RECOGNIZED')return {status:'OWNER_SESSION_RECOGNIZED'};
    if(r.status===401&&body?.status==='OWNER_SESSION_REQUIRED')return {status:'OWNER_SESSION_REQUIRED'};
    if(r.status===403&&body?.status==='OWNER_ACCESS_DENIED')return {status:'OWNER_ACCESS_DENIED'};
  }catch{/* no private error reflection */}
  return {status:'ADMISSION_UNAVAILABLE'};
}
export async function executeUpload({payload,active,storage,locks,fetchImpl}){
  try{
    const input=validatePayload(payload);
    if(!active())return {status:'CANCELLED'};
    if(!locks)return {status:'MARKER_UNAVAILABLE'};
    return await locks.request(OPERATION,{ifAvailable:true},async lock=>{
      if(!lock)return {status:'ALREADY_ATTEMPTED'};
      if(!active())return {status:'CANCELLED'};
      try{
        if(storage.getItem(OPERATION)!==null)return {status:'ALREADY_ATTEMPTED'};
        storage.setItem(OPERATION,'ATTEMPTED');
        if(storage.getItem(OPERATION)!=='ATTEMPTED')return {status:'MARKER_UNAVAILABLE'};
      }catch{return {status:'MARKER_UNAVAILABLE'};}
      if(!active())return {status:'CANCELLED'};
      const r=await fetchImpl('/api/social-accounts/vk/upload-test',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(45_000)});
      return safeResult(await r.json());
    });
  }catch{return {status:'SERVER_UPLOAD_UNCONFIRMED'};}
}
export function requestPeerConfirmation({opener,nonce,active,events,send,randomNonce=randomWindowNonce,schedule=setTimeout,stop=clearTimeout}){
  return new Promise(resolve=>{
    const challenge=randomNonce();let done=false,timer=null;
    const finish=ok=>{if(done)return;done=true;events.removeEventListener('message',receive);if(timer!==null)stop(timer);resolve(ok);};
    function receive(event){
      const m=event.data;
      if(event.origin!==ORIGIN||event.source!==opener||!record(m)||m.type!=='CONFIRM_ACK'||m.nonce!==nonce||m.challenge!==challenge
        ||Object.keys(m).sort().join(',')!=='challenge,nonce,type')return;
      finish(active());
    }
    if(!validNonce(nonce)||!validNonce(challenge)||!active()){finish(false);return;}
    events.addEventListener('message',receive);timer=schedule(()=>finish(false),5000);
    try{send({type:'CONFIRM_REQUEST',nonce,challenge});}catch{finish(false);}
  });
}
export function createReceiver({opener,now,admit,confirmPeer,execute,send,preview,render}){
  let nonce=null,expires=now()+TTL,phase='WAITING',payload=null;
  const active=()=>phase!=='DONE'&&nonce!==null&&now()<expires;
  const finish=raw=>{
    if(phase==='DONE')return;
    phase='DONE';payload=null;const result=safeResult(raw);render(result.status);
    if(nonce)send({type:'RESULT',nonce,result});
  };
  const expire=()=>finish({status:phase==='UPLOADING'?'SERVER_UPLOAD_UNCONFIRMED':'WINDOW_EXPIRED'});
  async function receive(event){
    if(phase==='DONE'||event.origin!==ORIGIN||event.source!==opener||!record(event.data))return;
    if(now()>=expires){expire();return;}
    const m=event.data;
    if(m.type==='HELLO'&&phase==='WAITING'&&validNonce(m.nonce)&&Object.keys(m).sort().join(',')==='nonce,type'){
      nonce=m.nonce;phase='ADMITTING';render(phase);
      let result;try{result=await admit();}catch{result={status:'ADMISSION_UNAVAILABLE'};}
      if(!active()){finish({status:'WINDOW_EXPIRED'});return;}
      if(result?.status!=='OWNER_SESSION_RECOGNIZED'){finish(result);return;}
      phase='ADMITTED';send({type:'ADMITTED',nonce});render(phase);return;
    }
    if(m.nonce!==nonce||!nonce)return;
    if(!active()){finish({status:'WINDOW_EXPIRED'});return;}
    if(m.type==='CANCEL'){finish({status:'CANCELLED'});return;}
    if(m.type==='PAYLOAD'){
      if(phase!=='ADMITTED'){finish({status:'PAYLOAD_REJECTED'});return;}
      try{
        if(Object.keys(m).sort().join(',')!=='nonce,payload,type')throw {};
        payload=validatePayload(m.payload);
      }catch{finish({status:'PAYLOAD_REJECTED'});return;}
      phase='PREVIEW';preview(payload);render(phase);
    }
  }
  async function confirm(){
    if(phase!=='PREVIEW')return;
    if(!active()){finish({status:'WINDOW_EXPIRED'});return;}
    phase='CONFIRMING';render(phase);
    const frozen=payload;
    try{if(!confirmPeer||!await confirmPeer(nonce,active)){finish({status:'CANCELLED'});return;}}
    catch{finish({status:'CANCELLED'});return;}
    if(!active()){finish({status:'WINDOW_EXPIRED'});return;}
    let admitted;try{admitted=await admit();}catch{admitted={status:'ADMISSION_UNAVAILABLE'};}
    if(!active()){finish({status:'WINDOW_EXPIRED'});return;}
    if(admitted?.status!=='OWNER_SESSION_RECOGNIZED'){finish(admitted);return;}
    // A second PAYLOAD or cancellation during admission makes active() false.
    phase='UPLOADING';render(phase);
    try{const result=await execute(frozen,active);if(active())finish(result);else finish({status:'CANCELLED'});}
    catch{finish({status:'SERVER_UPLOAD_UNCONFIRMED'});}
  }
  return {receive,confirm,cancel:()=>finish({status:'CANCELLED'}),tick:()=>{if(now()>=expires)expire();},phase:()=>phase};
}

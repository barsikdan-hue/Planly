import {publishOne,inspectPreconditions} from './single-photo-test.mjs';
const APP_ID=54809413;
const GROUP_ID=242095689;
const API_VERSION='5.199';
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function errorCode(error){
  const code=error?.error_data?.error_code??error?.error_code;
  return Number.isSafeInteger(code)&&code>=0&&code<1_000_000?code:null;
}
function unpack(raw){
  if(!isRecord(raw))throw {};
  if(isRecord(raw.error))throw {error_code:errorCode(raw.error)};
  return raw.response??raw;
}
async function boundedSend(bridge,method,params){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve(bridge.send(method,params)),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject({}),15_000);}),
    ]);
  }finally{clearTimeout(timer);}
}

/** Closure-only credentials. Reads and one-shot publication require explicit actions. */
export function createProbe(bridge,context,onChange=()=>{}){
  let token=null,uploadUrl=null,initialized=false,epoch=0;
  let state={phase:'NOT_INITIALIZED',busy:false,scopes:{wall:false,photos:false,groups:false},expiresIn:null,errorCode:null,communityDiagnostic:null,preflight:null};
  const validContext=context?.appId===String(APP_ID);
  const snapshot=()=>({appId:APP_ID,communityId:GROUP_ID,...state,scopes:{...state.scopes},preflight:state.preflight?{...state.preflight}:null,communityDiagnostic:state.communityDiagnostic?{...state.communityDiagnostic}:null});
  const emit=()=>onChange(snapshot());
  const update=next=>{state={...state,...next};emit();};
  async function run(work,failurePhase){
    if(state.busy)return snapshot();
    const current=epoch;
    const active=()=>epoch===current;
    update({busy:true,errorCode:null});
    try{await work(active);}
    catch(error){if(active())update({phase:failurePhase,errorCode:errorCode(error)});}
    finally{if(active())update({busy:false});}
    return snapshot();
  }
  function reset(){
    epoch++;token=null;uploadUrl=null;
    state={phase:validContext?(initialized?'READY':'NOT_INITIALIZED'):'OPEN_IN_VK',busy:false,scopes:{wall:false,photos:false,groups:false},expiresIn:null,errorCode:null,communityDiagnostic:null,preflight:null};
    emit();return snapshot();
  }
  async function initialize(){
    if(!validContext){update({phase:'OPEN_IN_VK'});return snapshot();}
    return run(async active=>{
      await boundedSend(bridge,'VKWebAppInit',{});
      if(active()){initialized=true;update({phase:'READY'});}
    },'INIT_FAILED');
  }
  async function requestAccess(){
    if(!initialized)return snapshot();
    return run(async active=>{
      token=null;uploadUrl=null;update({scopes:{wall:false,photos:false,groups:false},expiresIn:null,communityDiagnostic:null,preflight:null});
      const grant=await boundedSend(bridge,'VKWebAppGetAuthToken',{app_id:APP_ID,scope:'wall,photos,groups'});
      if(!active())return;
      if(!isRecord(grant)||typeof grant.scope!=='string'||typeof grant.access_token!=='string'||!/^[-A-Za-z0-9_.]{20,16000}$/.test(grant.access_token))throw {};
      const granted=new Set(grant.scope.split(/[\s,]+/).filter(Boolean));
      const scopes={wall:granted.has('wall'),photos:granted.has('photos'),groups:granted.has('groups')};
      const expiresIn=Number.isSafeInteger(grant.expires_in)&&grant.expires_in>0?grant.expires_in:null;
      if(!scopes.wall||!scopes.photos||!scopes.groups){update({phase:'MISSING_SCOPES',scopes,expiresIn});return;}
      token=grant.access_token;update({phase:'AUTHORIZED',scopes,expiresIn});
    },'AUTH_DECLINED_OR_UNAVAILABLE');
  }
  async function checkPhoto(){
    if(!initialized||!token)return snapshot();
    return run(async active=>{
      const currentToken=token;
      uploadUrl=null;
      update({communityDiagnostic:null,preflight:null});
      const groups=unpack(await boundedSend(bridge,'VKWebAppCallAPIMethod',{
        method:'groups.get',params:{access_token:currentToken,v:API_VERSION,filter:'editor',extended:0,count:1000,offset:0},
      }));
      if(!active())return;
      const items=isRecord(groups)&&Array.isArray(groups.items)?groups.items:null;
      const valid=items!==null&&items.length<=1000&&items.every(id=>Number.isSafeInteger(id)&&id>0)
        &&Number.isSafeInteger(groups.count)&&groups.count>=items.length
        &&new Set(items).size===items.length;
      const matched=valid&&items.includes(GROUP_ID);
      const complete=valid&&groups.count===items.length;
      update({communityDiagnostic:{shape:items?'items_array':'other',matched,complete}});
      if(!valid)throw {};
      if(!matched){
        update({phase:complete?'COMMUNITY_CONTROL_REQUIRED':'COMMUNITY_LIST_INCOMPLETE'});return;
      }
      const photo=unpack(await boundedSend(bridge,'VKWebAppCallAPIMethod',{
        method:'photos.getWallUploadServer',params:{access_token:currentToken,v:API_VERSION,group_id:String(GROUP_ID)},
      }));
      if(!active())return;
      if(!isRecord(photo)||typeof photo.upload_url!=='string')throw {};
      const url=new URL(photo.upload_url);
      if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw {};
      uploadUrl=url.toString();
      update({phase:'PHOTO_ENDPOINT_AVAILABLE'});
    },'CHECK_FAILED');
  }
  async function publishTest(options){
    if(state.busy||state.phase!=='PHOTO_ENDPOINT_AVAILABLE'||!token)return snapshot();
    const startedEpoch=epoch;
    await checkPhoto();
    if(epoch!==startedEpoch||state.busy||state.phase!=='PHOTO_ENDPOINT_AVAILABLE'||!token||!uploadUrl)return snapshot();
    return run(async active=>{
      const currentToken=token;
      const image=options.makeImage?await options.makeImage():options.image;
      if(!active())return;
      const result=await publishOne({...options,image,active,uploadUrl,sensitiveToken:currentToken,api:async(method,params)=>unpack(await boundedSend(bridge,'VKWebAppCallAPIMethod',{
        method,params:{...params,access_token:currentToken,v:API_VERSION},
      }))});
      if(active())update(result);
    },'TEST_OUTCOME_UNKNOWN');
  }
  async function inspectTest({makeImage,storageStatus}){
    if(state.busy||!token||!uploadUrl)return snapshot();
    return run(async active=>{
      const image=await makeImage();if(!active())return;
      const reason=inspectPreconditions({active,uploadUrl,image,sensitiveToken:token});
      let storage='UNAVAILABLE';
      try{const reported=storageStatus();if(['AVAILABLE','ATTEMPTED'].includes(reported))storage=reported;}catch{/* no raw errors */}
      update({preflight:{reason,storage}});
    },'TEST_DIAGNOSTIC_FAILED');
  }
  return {snapshot,initialize,requestAccess,checkPhoto,publishTest,inspectTest,reset};
}

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

/** Feasibility only. No token export, persistent storage, upload or send method. */
export function createProbe(bridge,context,onChange=()=>{}){
  let token=null,initialized=false,epoch=0;
  let state={phase:'NOT_INITIALIZED',busy:false,scopes:{wall:false,photos:false},expiresIn:null,errorCode:null,communityDiagnostic:null};
  const validContext=context?.appId===String(APP_ID);
  const snapshot=()=>({appId:APP_ID,communityId:GROUP_ID,...state,scopes:{...state.scopes},communityDiagnostic:state.communityDiagnostic?{...state.communityDiagnostic}:null});
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
    epoch++;token=null;
    state={phase:validContext?(initialized?'READY':'NOT_INITIALIZED'):'OPEN_IN_VK',busy:false,scopes:{wall:false,photos:false},expiresIn:null,errorCode:null,communityDiagnostic:null};
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
      token=null;update({scopes:{wall:false,photos:false},expiresIn:null,communityDiagnostic:null});
      const grant=await boundedSend(bridge,'VKWebAppGetAuthToken',{app_id:APP_ID,scope:'wall,photos'});
      if(!active())return;
      if(!isRecord(grant)||typeof grant.scope!=='string'||typeof grant.access_token!=='string'||!/^[-A-Za-z0-9_.]{20,16000}$/.test(grant.access_token))throw {};
      const granted=new Set(grant.scope.split(/[\s,]+/).filter(Boolean));
      const scopes={wall:granted.has('wall'),photos:granted.has('photos')};
      const expiresIn=Number.isSafeInteger(grant.expires_in)&&grant.expires_in>0?grant.expires_in:null;
      if(!scopes.wall||!scopes.photos){update({phase:'MISSING_SCOPES',scopes,expiresIn});return;}
      token=grant.access_token;update({phase:'AUTHORIZED',scopes,expiresIn});
    },'AUTH_DECLINED_OR_UNAVAILABLE');
  }
  async function checkPhoto(){
    if(!initialized||!token)return snapshot();
    return run(async active=>{
      const currentToken=token;
      update({communityDiagnostic:null});
      const groups=unpack(await boundedSend(bridge,'VKWebAppCallAPIMethod',{
        method:'groups.getById',params:{access_token:currentToken,v:API_VERSION,group_ids:String(GROUP_ID),fields:'is_admin,admin_level'},
      }));
      if(!active())return;
      const items=Array.isArray(groups)?groups:groups?.groups;
      const group=Array.isArray(items)&&items.length===1?items[0]:null;
      const record=isRecord(group)?group:null;
      update({communityDiagnostic:{
        shape:Array.isArray(groups)?'array':Array.isArray(groups?.groups)?'groups_array':isRecord(groups)?'object':'other',
        count:Array.isArray(items)?Math.min(items.length,100):null,
        idMatches:record?.id===GROUP_ID,
        isAdminType:record?.is_admin===null?'null':typeof record?.is_admin,
        isAdmin:[0,1].includes(record?.is_admin)?record.is_admin:null,
        adminLevel:[0,1,2,3].includes(record?.admin_level)?record.admin_level:null,
        deactivated:record?.deactivated!==undefined,
      }});
      if(!isRecord(group)||group.id!==GROUP_ID||group.is_admin!==1||![2,3].includes(group.admin_level)||group.deactivated!==undefined){
        update({phase:'COMMUNITY_CONTROL_REQUIRED'});return;
      }
      const photo=unpack(await boundedSend(bridge,'VKWebAppCallAPIMethod',{
        method:'photos.getWallUploadServer',params:{access_token:currentToken,v:API_VERSION,group_id:String(GROUP_ID)},
      }));
      if(!active())return;
      if(!isRecord(photo)||typeof photo.upload_url!=='string')throw {};
      const url=new URL(photo.upload_url);
      if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw {};
      update({phase:'PHOTO_ENDPOINT_AVAILABLE'});
    },'CHECK_FAILED');
  }
  return {snapshot,initialize,requestAccess,checkPhoto,reset};
}

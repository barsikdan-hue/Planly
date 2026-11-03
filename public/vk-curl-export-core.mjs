import {validatePayload} from './vk-upload-window-core.mjs';
export async function exportAddress({payload,handle,active,claim,now=Date.now}){
  let writer;
  try{
    const input=validatePayload(payload);
    if(!active())return {status:'CANCELLED'};
    if(typeof claim!=='function')return {status:'MARKER_UNAVAILABLE'};
    if(!claim())return {status:'ALREADY_ATTEMPTED'};
    writer=await handle.createWritable();
    if(!active()){await writer.abort();return {status:'CANCELLED'};}
    await writer.write(JSON.stringify({uploadUrl:input.uploadUrl,exportedAt:now()}));
    if(!active()){await writer.abort();return {status:'CANCELLED'};}
    await writer.close();return {status:'ADDRESS_EXPORTED'};
  }catch{try{await writer?.abort();}catch{/* no private errors */}return {status:'EXPORT_UNCONFIRMED'};}
}

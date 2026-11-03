import {ORIGIN,createReceiver,ownerAdmission,requestPeerConfirmation} from './vk-upload-window-core.mjs';
import {DIAGNOSTIC_OPERATION} from './vk-upload-diagnostic.mjs';
import {exportAddress} from './vk-curl-export-core.mjs';
const status=document.querySelector('#status'),button=document.querySelector('#confirm');
if(location.origin!==ORIGIN||window.top!==window.self||!window.opener){status.textContent='Откройте окно из Mini App.';}
else{
  const opener=window.opener;let handle=null;
  const exportMarker='planly-vk-curl-export-20261102-01';
  const claim=()=>{if(localStorage.getItem(exportMarker)!==null)return false;localStorage.setItem(exportMarker,'ATTEMPTED');return localStorage.getItem(exportMarker)==='ATTEMPTED';};
  const receiver=createReceiver({opener,now:Date.now,admit:()=>ownerAdmission(fetch.bind(globalThis)),
    confirmPeer:(nonce,active)=>requestPeerConfirmation({opener,nonce,active,events:window,send:m=>opener.postMessage(m,ORIGIN)}),
    execute:(payload,active)=>navigator.locks?navigator.locks.request(exportMarker,{ifAvailable:true},lock=>lock?exportAddress({payload,handle,active,claim}):{status:'ALREADY_ATTEMPTED'}):Promise.resolve({status:'MARKER_UNAVAILABLE'}),send:m=>opener.postMessage(m,ORIGIN),preview:()=>{},
    render:phase=>{button.disabled=phase!=='PREVIEW';status.textContent=phase==='PREVIEW'?'Выберите только согласованную закрытую папку. Загрузки в VK не будет.':phase==='ADDRESS_EXPORTED'?'Адрес сохранён. Загрузок и публикаций не было.':phase==='EXPORT_UNCONFIRMED'?'Экспорт не подтверждён. Не повторяйте, сначала проверьте файл.':`Состояние: ${phase}`;}
  });
  window.addEventListener('message',e=>{void receiver.receive(e);});
  button.addEventListener('click',async event=>{
    if(!event.isTrusted||receiver.phase()!=='PREVIEW'||!window.showSaveFilePicker)return;
    button.disabled=true;
    try{
      handle=await window.showSaveFilePicker({suggestedName:'vk-curl-address.json',types:[{description:'Временный адрес VK',accept:{'application/json':['.json']}}]});
      if(handle.name!=='vk-curl-address.json'){receiver.cancel();return;}
      await receiver.confirm();
    }catch{receiver.cancel();}finally{handle=null;}
  });
  document.querySelector('#cancel').addEventListener('click',()=>receiver.cancel());
  window.addEventListener('pagehide',()=>receiver.cancel());
  const timer=setInterval(()=>{if(opener.closed)receiver.cancel();receiver.tick();if(receiver.phase()==='DONE')clearInterval(timer);},250);
  opener.postMessage({type:'READY',operation:DIAGNOSTIC_OPERATION},ORIGIN);
}

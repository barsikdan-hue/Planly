import {ORIGIN,createReceiptReceiver,receiptOwnerAdmission,executeReceiptUpload,requestPeerConfirmation} from './vk-upload-window-core.mjs';
import {RECEIPT_OPERATION} from './vk-upload-receipt.mjs';
import {diagnosticText} from './vk-upload-diagnostic.mjs';
const status=document.querySelector('#status'),button=document.querySelector('#confirm'),image=document.querySelector('#preview');
const labels={WAITING:'Ожидаем Mini App…',ADMITTING:'Проверяем вход владельца…',ADMITTED:'Вход подтверждён. Ожидаем картинку…',
  PREVIEW:'Проверьте картинку. После одной серверной загрузки Mini App сохранит фото и создаст один пост.',CONFIRMING:'Повторная проверка доступа…',UPLOADING:'Выполняется одна серверная загрузка…',
  OWNER_SESSION_REQUIRED:'В этом окне нет входа владельца. Войдите в Planly в отдельной вкладке, затем вернитесь в Mini App. Если отправка уже начиналась, повтор запрещён.',
  OWNER_ACCESS_DENIED:'Этот аккаунт не имеет доступа владельца.',ADMISSION_UNAVAILABLE:'Проверка входа недоступна.',
  UPLOAD_CONFIRMED:'Квитанция загрузки передана в Mini App. Результат сохранения и публикации смотрите в Mini App.',
  UPSTREAM_HTTP_REJECTED:'Загрузчик отклонил запрос. Повтор запрещён.',ALREADY_ATTEMPTED:'Операция уже запускалась. Повтор запрещён.',
  WINDOW_EXPIRED:'Время подтверждения истекло. Если отправка уже началась, исход неизвестен; повтор запрещён.',
  CANCELLED:'Операция отменена. Если отправка уже началась, исход неизвестен; повтор запрещён.',PAYLOAD_REJECTED:'Данные изменились или не прошли проверку.'};
if(location.origin!==ORIGIN||window.top!==window.self||!window.opener){status.textContent='Откройте это окно кнопкой публикации из Mini App Planly.';}
else{
  const opener=window.opener;
  const receiver=createReceiptReceiver({opener,now:Date.now,admit:()=>receiptOwnerAdmission(globalThis.fetch.bind(globalThis)),
    confirmPeer:(nonce,active)=>requestPeerConfirmation({opener,nonce,active,events:window,send:message=>opener.postMessage(message,ORIGIN)}),
    execute:(payload,active)=>executeReceiptUpload({payload,active,storage:globalThis.localStorage,locks:navigator.locks,fetchImpl:globalThis.fetch.bind(globalThis)}),
    send:message=>opener.postMessage(message,ORIGIN),
    preview:payload=>{image.src='data:image/png;base64,'+payload.imageBase64;image.hidden=false;},
    render:(phase,result)=>{
      status.textContent=(labels[phase]??'Исход загрузки неизвестен. Повтор запрещён.')+(result?.httpStatus?` HTTP=${result.httpStatus}.`:'')+diagnosticText(result?.diagnostic);
      button.disabled=phase!=='PREVIEW';
      if(!['PREVIEW','CONFIRMING','UPLOADING'].includes(phase)){image.removeAttribute('src');image.hidden=true;}
    }});
  window.addEventListener('message',event=>{void receiver.receive(event);});
  button.addEventListener('click',event=>{if(event.isTrusted)void receiver.confirm();});
  document.querySelector('#cancel').addEventListener('click',()=>receiver.cancel());
  window.addEventListener('pagehide',()=>receiver.cancel());
  const timer=setInterval(()=>{if(opener.closed)receiver.cancel();receiver.tick();if(receiver.phase()==='DONE')clearInterval(timer);},250);
  opener.postMessage({type:'READY',operation:RECEIPT_OPERATION},ORIGIN);
}

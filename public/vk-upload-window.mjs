import {ORIGIN,createReceiver,ownerAdmission,executeUpload,requestPeerConfirmation} from './vk-upload-window-core.mjs';
import {DIAGNOSTIC_OPERATION,diagnosticText} from './vk-upload-diagnostic.mjs';
const status=document.querySelector('#status'),button=document.querySelector('#confirm'),image=document.querySelector('#preview');
const labels={WAITING:'Ожидаем данные из Mini App…',ADMITTING:'Проверяем вход владельца…',ADMITTED:'Вход подтверждён. Ожидаем картинку…',
  PREVIEW:'Проверьте картинку и подтвердите одну загрузку. Пост создан не будет.',CONFIRMING:'Повторная проверка доступа…',UPLOADING:'Выполняется одна загрузка…',
  OWNER_SESSION_REQUIRED:'В этом окне нет входа owner. Войдите в Planly в отдельной вкладке, затем начните проверку заново из Mini App.',
  OWNER_ACCESS_DENIED:'Этот аккаунт не имеет доступа к проверке owner.',ADMISSION_UNAVAILABLE:'Проверка входа сейчас недоступна.',
  UPLOAD_CONFIRMED:'VK подтвердил загрузку. Сохранение фотографии и публикация поста не выполнялись.',
  UPSTREAM_HTTP_REJECTED:'Загрузчик отклонил запрос. Повтор запрещён.',
  ALREADY_ATTEMPTED:'Эта операция уже запускалась. Повтор запрещён.',WINDOW_EXPIRED:'Время подтверждения истекло. Загрузка не запускается.',
  CANCELLED:'Проверка отменена. Если отправка уже началась, повторять её нельзя.',PAYLOAD_REJECTED:'Данные изменились или не прошли проверку. Загрузка запрещена.'};
if(location.origin!==ORIGIN||window.top!==window.self||!window.opener){status.textContent='Откройте это окно кнопкой из Mini App Planly.';}
else{
  const opener=window.opener;
  const receiver=createReceiver({opener,now:Date.now,admit:()=>ownerAdmission(globalThis.fetch.bind(globalThis)),
    confirmPeer:(nonce,active)=>requestPeerConfirmation({opener,nonce,active,events:window,send:message=>opener.postMessage(message,ORIGIN)}),
    execute:(payload,active)=>executeUpload({payload,active,storage:globalThis.localStorage,locks:navigator.locks,fetchImpl:globalThis.fetch.bind(globalThis)}),
    send:message=>opener.postMessage(message,ORIGIN),
    preview:payload=>{image.src='data:image/png;base64,'+payload.imageBase64;image.hidden=false;},
    render:(phase,result)=>{status.textContent=(labels[phase]??'Исход операции не подтверждён. Не повторяйте отправку.')+(result?.httpStatus?` HTTP=${result.httpStatus}.`:'')+diagnosticText(result?.diagnostic);button.disabled=phase!=='PREVIEW';if(!['PREVIEW','CONFIRMING','UPLOADING'].includes(phase)){image.removeAttribute('src');image.hidden=true;}}
  });
  window.addEventListener('message',event=>{void receiver.receive(event);});
  button.addEventListener('click',event=>{if(event.isTrusted)void receiver.confirm();});
  document.querySelector('#cancel').addEventListener('click',()=>receiver.cancel());
  window.addEventListener('pagehide',()=>receiver.cancel());
  const timer=setInterval(()=>{if(opener.closed)receiver.cancel();receiver.tick();if(receiver.phase()==='DONE')clearInterval(timer);},250);
  opener.postMessage({type:'READY',operation:DIAGNOSTIC_OPERATION},ORIGIN);
}

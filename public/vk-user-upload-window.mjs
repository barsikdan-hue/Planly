import {ORIGIN,USER_UPLOAD_OPERATION,createUserUploadReceiver,ownerUserUploadAdmission,executeUserUpload,requestPeerConfirmation} from './vk-user-upload-core.mjs';
import {FIXED_USER_UPLOAD_PNG} from './vk-user-upload-protocol.mjs';
const status=document.querySelector('#status'),button=document.querySelector('#confirm'),image=document.querySelector('#preview');
const labels={WAITING:'Ожидаем данные из Mini App…',ADMITTING:'Проверяем вход владельца…',ADMITTED:'Вход подтверждён. Ожидаем согласование операции…',
  PREVIEW:'Проверьте картинку. Подтверждение передаст ключ на сервер только для одной загрузки без поста.',CONFIRMING:'Повторная проверка доступа…',UPLOADING:'Выполняется одна серверная загрузка…',
  OWNER_SESSION_REQUIRED:'В этом окне нет входа owner. Войдите в Planly в отдельной вкладке и заново откройте окно из Mini App.',
  OWNER_ACCESS_DENIED:'Этот аккаунт не имеет доступа к тесту владельца.',ADMISSION_UNAVAILABLE:'Проверка входа сейчас недоступна. Ключ не передаётся серверу.',
  UPLOAD_CONFIRMED:'VK подтвердил загрузку. Фото не сохранялось, пост не создавался.',
  PROVIDER_READ_REJECTED:'VK отклонил проверку прав или получение адреса загрузки. Повтор запрещён.',
  COMMUNITY_CONTROL_REQUIRED:'Сервер не подтвердил управление тестовой группой. Загрузка не запускалась.',
  INVALID_PROVIDER_RESPONSE:'VK вернул неподтверждённый ответ. Повтор запрещён.',
  UPLOAD_ADDRESS_REJECTED:'VK вернул адрес загрузчика, который не прошёл проверку. Отправка файла запрещена.',
  UPSTREAM_HTTP_REJECTED:'Загрузчик отклонил запрос. Повтор запрещён.',
  ALREADY_ATTEMPTED:'Эта операция уже запускалась. Повтор запрещён.',WINDOW_EXPIRED:'Время подтверждения истекло. Новая отправка не запускается.',
  CANCELLED:'Проверка отменена. Если операция уже началась, повтор запрещён.',PAYLOAD_REJECTED:'Данные изменились или не прошли проверку. Отправка запрещена.',
  MARKER_UNAVAILABLE:'Защита от повторов недоступна. Отправка запрещена.'};
if(location.origin!==ORIGIN||window.top!==window.self||!window.opener){status.textContent='Откройте это окно кнопкой из Mini App Planly.';}
else{
  const opener=window.opener;
  const receiver=createUserUploadReceiver({opener,now:Date.now,admit:()=>ownerUserUploadAdmission(globalThis.fetch.bind(globalThis)),
    confirmPeer:(nonce,active)=>requestPeerConfirmation({opener,nonce,active,events:window,send:message=>opener.postMessage(message,ORIGIN)}),
    execute:(payload,active)=>executeUserUpload({payload,active,storage:globalThis.localStorage,locks:navigator.locks,fetchImpl:globalThis.fetch.bind(globalThis)}),
    send:message=>opener.postMessage(message,ORIGIN),
    preview:()=>{image.src='data:image/png;base64,'+FIXED_USER_UPLOAD_PNG;image.hidden=false;},
    render:(phase,result)=>{
      status.textContent=(labels[phase]??'Исход операции не подтверждён. Не повторяйте отправку.')+(result?.httpStatus?` HTTP=${result.httpStatus}.`:'');
      button.disabled=phase!=='PREVIEW';
      if(!['PREVIEW','CONFIRMING','UPLOADING'].includes(phase)){image.removeAttribute('src');image.hidden=true;}
    },
  });
  window.addEventListener('message',event=>{void receiver.receive(event);});
  button.addEventListener('click',event=>{if(event.isTrusted)void receiver.confirm();});
  document.querySelector('#cancel').addEventListener('click',()=>receiver.cancel());
  window.addEventListener('pagehide',()=>receiver.cancel());
  const timer=setInterval(()=>{if(opener.closed)receiver.cancel();receiver.tick();if(receiver.phase()==='DONE')clearInterval(timer);},250);
  opener.postMessage({type:'READY',operation:USER_UPLOAD_OPERATION},ORIGIN);
}

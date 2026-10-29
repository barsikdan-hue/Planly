import bridge from '@vkontakte/vk-bridge';
import {createProbe} from './controller.mjs';
const doc=globalThis.document;
const labels={
  NOT_INITIALIZED:'Подготовка проверки…',OPEN_IN_VK:'Откройте эту страницу внутри Mini App Planly №54809413.',
  READY:'Готово. Разрешения ещё не запрошены.',INIT_FAILED:'Не удалось инициализировать VK Bridge. Откройте приложение через VK.',
  AUTHORIZED:'Права wall, photos и groups получены. Можно проверить доступ к фото.',
  MISSING_SCOPES:'VK не выдал все необходимые разрешения. Проверка API не запущена.',
  AUTH_DECLINED_OR_UNAVAILABLE:'Разрешение отклонено или недоступно. Повторного запроса не было.',
  COMMUNITY_CONTROL_REQUIRED:'Не подтверждены права редактора или администратора группы №242095689.',
  COMMUNITY_LIST_INCOMPLETE:'Нужная группа не найдена в первой странице списка управления. Доступ не подтверждён, следующих запросов не было.',
  PHOTO_ENDPOINT_AVAILABLE:'VK выдал адрес загрузки фото. Файл не загружен, публикаций нет.',
  CHECK_FAILED:'VK не подтвердил доступ к методу. Публикаций и загрузок не было.',
};
const probe=createProbe(bridge,{appId:new URL(globalThis.location.href).searchParams.get('vk_app_id')},state=>{
  doc.querySelector('#status').textContent=labels[state.phase]??'Проверка не завершена.';
  doc.querySelector('#scopes').textContent=`wall: ${state.scopes.wall?'выдано':'не выдано'} · photos: ${state.scopes.photos?'выдано':'не выдано'} · groups: ${state.scopes.groups?'выдано':'не выдано'}`;
  doc.querySelector('#expiry').textContent=state.expiresIn===null?'Срок действия: API не сообщил. Фоновая работа не подтверждена.':`Сообщённый срок действия: ${state.expiresIn} секунд. Обновление токена ещё не проверено.`;
  doc.querySelector('#error').textContent=state.errorCode===null?'':`Код VK: ${state.errorCode}`;
  const d=state.communityDiagnostic;
  doc.querySelector('#community-diagnostic').textContent=d?`Проверка управления: форма=${d.shape}; нужная группа найдена среди редакторских/администраторских=${d.matched}; список полный=${d.complete}.`:'';
  doc.querySelector('#authorize').disabled=state.busy||!['READY','MISSING_SCOPES','AUTH_DECLINED_OR_UNAVAILABLE'].includes(state.phase);
  doc.querySelector('#check').disabled=state.busy||!['AUTHORIZED','CHECK_FAILED','PHOTO_ENDPOINT_AVAILABLE'].includes(state.phase);
  doc.querySelector('#reset').disabled=state.phase==='OPEN_IN_VK';
});
doc.querySelector('#authorize').addEventListener('click',()=>{void probe.requestAccess();});
doc.querySelector('#check').addEventListener('click',()=>{void probe.checkPhoto();});
doc.querySelector('#reset').addEventListener('click',()=>{probe.reset();});
globalThis.addEventListener('pagehide',()=>{probe.reset();});
void probe.initialize();

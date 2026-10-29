import bridge from '@vkontakte/vk-bridge';
import {createProbe} from './controller.mjs';
import {TEST_MESSAGE,TEST_OPERATION,claimTest,uploadPhoto} from './single-photo-test.mjs';
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
  TEST_PRECONDITION_FAILED:'Тест не запущен: не выполнены условия безопасной загрузки или недоступна защита от повторов.',
  TEST_ALREADY_ATTEMPTED:'Эта тестовая операция уже запускалась. Повтор запрещён.',
  TEST_OUTCOME_UNKNOWN:'Исход тестовой операции не подтверждён. Не повторяйте отправку: сначала нужна проверка результата.',
  TEST_POST_CONFIRMED:'VK подтвердил создание одного тестового поста с новой картинкой.',
  TEST_DIAGNOSTIC_FAILED:'Не удалось выполнить локальную проверку условий. Загрузок и отправок не было.',
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
  let attempted=true;
  try{attempted=globalThis.localStorage.getItem(TEST_OPERATION)!==null;}catch{/* fail closed */}
  doc.querySelector('#publish-test').disabled=state.busy||state.phase!=='PHOTO_ENDPOINT_AVAILABLE'||attempted||!globalThis.navigator?.locks;
  doc.querySelector('#inspect-test').disabled=state.busy||!['PHOTO_ENDPOINT_AVAILABLE','TEST_PRECONDITION_FAILED','TEST_ALREADY_ATTEMPTED'].includes(state.phase);
  doc.querySelector('#preflight-result').textContent=state.preflight?`Условия без отправки: ${state.preflight.reason}; хранилище: ${state.preflight.storage}. Запись в хранилище этой проверкой не выполнялась.`:'';
  const receipt=doc.querySelector('#post-receipt');
  receipt.textContent=state.phase==='TEST_POST_CONFIRMED'?`Открыть пост №${state.postId}`:'';
  if(state.phase==='TEST_POST_CONFIRMED')receipt.href=`https://vk.ru/wall-242095689_${state.postId}`;
  else receipt.removeAttribute('href');
});
doc.querySelector('#test-message').textContent=TEST_MESSAGE;
const canvas=doc.querySelector('#test-image');
const ctx=canvas.getContext('2d');
ctx.fillStyle='#edf4ff';ctx.fillRect(0,0,800,500);
ctx.fillStyle='#0969da';ctx.fillRect(60,60,680,14);
ctx.font='bold 62px sans-serif';ctx.fillText('PLANLY',60,220);
ctx.fillStyle='#183047';ctx.font='32px sans-serif';ctx.fillText('VK PHOTO UPLOAD TEST',60,295);
ctx.font='24px sans-serif';ctx.fillText('29.10.2026',60,360);
doc.querySelector('#authorize').addEventListener('click',()=>{void probe.requestAccess();});
doc.querySelector('#check').addEventListener('click',()=>{void probe.checkPhoto();});
doc.querySelector('#reset').addEventListener('click',()=>{probe.reset();});
doc.querySelector('#inspect-test').addEventListener('click',()=>{void probe.inspectTest({
  makeImage:()=>new Promise(resolve=>canvas.toBlob(resolve,'image/png')),
  storageStatus:()=>globalThis.localStorage.getItem(TEST_OPERATION)===null?'AVAILABLE':'ATTEMPTED',
});});
doc.querySelector('#publish-test').addEventListener('click',async()=>{
  if(!globalThis.navigator?.locks)return;
  await globalThis.navigator.locks.request(TEST_OPERATION,{ifAvailable:true},async lock=>{
    if(!lock)return;
    await probe.publishTest({makeImage:()=>new Promise(resolve=>canvas.toBlob(resolve,'image/png')),claim:()=>claimTest(globalThis.localStorage),upload:uploadPhoto});
  });
});
globalThis.addEventListener('pagehide',()=>{probe.reset();});
void probe.initialize();

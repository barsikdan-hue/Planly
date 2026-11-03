const stages=new Set(['GROUPS_READ','UPLOAD_ADDRESS_READ','FILE_UPLOAD','UPLOAD_RESPONSE']);
const reasons=new Set(['HTTP_REJECTED','API_REJECTED','INVALID_RESPONSE','TRANSPORT_FAILED','DEADLINE','UNKNOWN']);
const transports=new Set(['TLS_UNTRUSTED','DNS_FAILURE','CONNECT_TIMEOUT','CONNECTION_RESET','OTHER']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Reconstruct the public DTO. Never spread provider errors or return raw labels.
export function sanitizeUserUploadDiagnostic(raw){
  if(!record(raw)||!stages.has(raw.stage)||!reasons.has(raw.reason))return undefined;
  return {stage:raw.stage,reason:raw.reason,
    ...(raw.reason==='API_REJECTED'&&Number.isSafeInteger(raw.errorCode)&&raw.errorCode>=0&&raw.errorCode<1_000_000?{errorCode:raw.errorCode}:{}),
    ...(raw.reason==='TRANSPORT_FAILED'&&transports.has(raw.transport)?{transport:raw.transport}:{}),
  };
}
const stageLabels={GROUPS_READ:'Проверка управления группой',UPLOAD_ADDRESS_READ:'Получение адреса загрузчика',FILE_UPLOAD:'Отправка файла',UPLOAD_RESPONSE:'Проверка ответа загрузчика'};
const reasonLabels={HTTP_REJECTED:'HTTP-запрос отклонён',API_REJECTED:'VK отклонил запрос',INVALID_RESPONSE:'Ответ не прошёл проверку',TRANSPORT_FAILED:'Ошибка соединения',DEADLINE:'Время ожидания истекло',UNKNOWN:'Причина не определена'};
const transportLabels={TLS_UNTRUSTED:'сертификат не принят',DNS_FAILURE:'имя сервера не разрешено',CONNECT_TIMEOUT:'время подключения истекло',CONNECTION_RESET:'соединение сброшено',OTHER:'иная ошибка транспорта'};
export function userUploadDiagnosticText(raw){
  const d=sanitizeUserUploadDiagnostic(raw);
  if(!d)return '';
  return ` Этап: ${stageLabels[d.stage]}. ${reasonLabels[d.reason]}.${d.errorCode!==undefined?` Код VK: ${d.errorCode}.`:''}${d.transport?` Транспорт: ${transportLabels[d.transport]}.`:''}`;
}

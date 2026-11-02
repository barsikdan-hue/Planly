export function uploadWindowResponse():Response{
  return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Planly — диагностика отказа VK</title><body><main><h1>Диагностика загрузки VK: ошибка 405</h1><p>Новая отдельная попытка для группы №242095689. Старые маркеры сохраняются. Фотография не сохраняется, пост не создаётся.</p><p id="status" role="status">Ожидаем Mini App…</p><img id="preview" alt="Картинка для тестовой загрузки" width="400" hidden><p><button id="confirm" disabled>Подтвердить одну загрузку без поста</button> <button id="cancel">Отменить</button></p></main><script type="module" src="/vk-upload-window.mjs"></script></body></html>`,{
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"},
  });
}

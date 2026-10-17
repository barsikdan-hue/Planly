import {createHash} from 'node:crypto';

const bridgeUrls={telegram:'https://telegram.org/js/telegram-web-app.js',max:'https://st.max.ru/js/max-web-app.js'} as const;
const style='body{font-family:system-ui,sans-serif;max-width:38rem;margin:4rem auto;padding:0 1.25rem;color:#152033;background:#f5f7fb}main{background:white;padding:2rem;border-radius:1rem}h1{font-size:1.5rem}p{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}button{display:block;margin:1.25rem 0;padding:.8rem 1.2rem;font:inherit;border:0;border-radius:.5rem;background:#175cd3;color:white}button:disabled{background:#667085}a{color:#175cd3}label{display:block;line-height:1.6}';
const restart='Откройте Planly в исходном браузере и начните подключение заново. Подтверждение потеряно, истекло или относится к другой сессии.';
const finishScript=String.raw`(()=>{
 let ticket=/^#[A-Za-z0-9_-]{43}$/.test(location.hash)?location.hash.slice(1):'';
 history.replaceState(null,'',location.pathname);
 let closed=false,expires=0,busy=false;
 const controller=new AbortController();
 const clear=()=>{ticket='';closed=true;controller.abort();const button=document.getElementById('confirm');if(button)button.disabled=true;};
 addEventListener('pagehide',clear);
 document.addEventListener('DOMContentLoaded',()=>{
  const status=document.getElementById('status'),details=document.getElementById('details'),button=document.getElementById('confirm');
  const fail=()=>{clear();details.textContent='';status.textContent=RESTART;};
  const post=async(action)=>{
   const response=await fetch('/api/social-connections/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','X-Planly-Social-Connection':'1'},body:JSON.stringify({ticket}),signal:controller.signal});
   if(!response.ok)throw new Error('Unavailable');return response.json();
  };
  button.addEventListener('click',async(event)=>{
   if(!event.isTrusted || closed || busy || button.disabled || !ticket)return;
   if(Date.now()>=expires){fail();return;}
   busy=true;button.disabled=true;
   try {const result=await post('confirm');if(closed)return;if(result.state!=='VERIFIED_DISABLED')throw new Error('Unavailable');clear();status.textContent='Подключение подтверждено и выключено. Включите его отдельно в Planly, когда будете готовы.';}
   catch{if(!closed)fail();}
  });
  if(!ticket || closed){fail();return;}
  post('preview').then(proof=>{
   if(closed)return;
   expires=Date.parse(proof.expiresAt);
   if(!Number.isFinite(expires) || expires<=Date.now() || typeof proof.planlyName!=='string' || typeof proof.accountId!=='string' || typeof proof.humanId!=='string' || typeof proof.destinationId!=='string')throw new Error('Unavailable');
   details.textContent='Planly: '+proof.planlyName+'\nАккаунт: '+proof.accountId+'\nПлатформа: '+proof.provider+'\nПользователь: '+proof.humanName+' ('+proof.humanId+')\nКанал: '+proof.destinationName+' ('+proof.destinationId+')';
   status.textContent='Проверьте аккаунт, пользователя и канал. Подтверждение сохранит выключенное подключение.';button.disabled=false;
  }).catch(()=>{if(!closed)fail();});
 });
})();`.replace('RESTART',JSON.stringify(restart));

function documentResponse(script:string,body:string,sdk?:string,finish=false):Response {
 const hash=(value:string)=>`'sha256-${createHash('sha256').update(value).digest('base64')}'`;
 const csp=`default-src 'none'; script-src ${hash(script)}${sdk?' '+sdk:''}; style-src ${hash(style)}; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'${finish?"; frame-ancestors 'none'":''}`;
 return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Подключение канала — Planly</title><script>${script}</script><style>${style}</style></head><body><main><h1>Подключение канала</h1><p id="status" role="status">Проверяем подключение…</p><p id="details"></p>${body}<p><a href="/">Вернуться в Planly</a></p></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':csp}});
}
export function buildSocialConnectionFinish():Response {
 return documentResponse(finishScript,'<p>Не пересылайте подтверждение другим людям.</p><button id="confirm" type="button" disabled>Подтвердить выключенное подключение</button>',undefined,true);
}
export function buildSocialConnectionMiniApp(provider:'telegram'|'max',available:boolean):Response {
 const bridge=provider==='telegram'?'window.Telegram && window.Telegram.WebApp':'window.WebApp';
 const script=String.raw`(()=>{
 let ticket='',expires=0,closed=false,bridge;
 const controller=new AbortController();
 const clear=()=>{ticket='';closed=true;controller.abort();const button=document.getElementById('continue');if(button)button.disabled=true;};
 addEventListener('pagehide',clear);
 document.addEventListener('DOMContentLoaded',()=>{
  const status=document.getElementById('status'),details=document.getElementById('details'),button=document.getElementById('continue'),consent=document.getElementById('consent');
  const fail=()=>{clear();details.textContent='';status.textContent=RESTART;};
  button.addEventListener('click',(event)=>{
   if(!event.isTrusted || closed || !ticket || !consent.checked || button.disabled)return;
   if(Date.now()>=expires){fail();return;}
   const url=location.origin+'/social-connections/finish#'+ticket;
   try {bridge.openLink(url);clear();status.textContent='Продолжите подтверждение в исходном браузере Planly. Если открылась другая сессия, начните подключение заново в Planly.';}catch{fail();}
  });
  if(!AVAILABLE){status.textContent='Подключение пока недоступно. Администратору нужно настроить Mini App и бота.';clear();return;}
  const receive=async()=>{
   if(closed)return;
   bridge=BRIDGE;
   let raw=bridge && bridge.initData;
   history.replaceState(null,'',location.pathname);
   if(typeof raw!=='string' || !raw || new TextEncoder().encode(raw).byteLength>16384 || typeof bridge.openLink!=='function'){fail();return;}
   try {
    const request=fetch(PROOF_URL,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','X-Planly-Social-Connection':'1'},body:JSON.stringify({initData:raw}),signal:controller.signal});raw='';
    const response=await request;if(!response.ok)throw new Error('Unavailable');const proof=await response.json();if(closed)return;
    expires=Date.parse(proof.expiresAt);
    if(!/^[A-Za-z0-9_-]{43}$/.test(proof.ticket) || !Number.isFinite(expires) || expires<=Date.now() || typeof proof.accountHint!=='string' || typeof proof.humanId!=='string' || typeof proof.destinationId!=='string')throw new Error('Unavailable');
    ticket=proof.ticket;
    details.textContent='Аккаунт: '+proof.accountHint+'\nПлатформа: '+proof.provider+'\nПользователь: '+proof.humanName+' ('+proof.humanId+')\nКанал: '+proof.destinationName+' ('+proof.destinationId+')';
    status.textContent='Проверьте канал и пользователя. Продолжение откроет Planly для отдельного подтверждения.';button.disabled=false;
   }catch{raw='';if(!closed)fail();}
  };
  if(BRIDGE){receive();return;}
  const sdk=document.createElement('script');sdk.src=SDK_URL;sdk.referrerPolicy='no-referrer';sdk.onload=receive;sdk.onerror=fail;document.head.appendChild(sdk);
 });
})();`.replaceAll('BRIDGE',bridge).replace('AVAILABLE',String(available)).replace('RESTART',JSON.stringify(restart)).replace('PROOF_URL',JSON.stringify(`/api/social-connections/providers/${provider}/proof`)).replace('SDK_URL',JSON.stringify(bridgeUrls[provider]));
 return documentResponse(script,'<p>Не пересылайте подтверждение другим людям.</p><label><input id="consent" type="checkbox"> Согласен подтвердить указанные аккаунт Planly, пользователя и канал</label><button id="continue" type="button" disabled>Согласиться и продолжить в Planly</button>',available?bridgeUrls[provider]:undefined);
}

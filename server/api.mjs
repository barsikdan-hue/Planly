import {encrypt,decrypt} from './crypto.mjs';
import {verifyAccount,publish} from './social.mjs';
const networks=['Telegram','VK','Instagram'];
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const rows=async(env,sql,...args)=>(await stmt(env,sql,...args).all()).results;
const one=(env,sql,...args)=>stmt(env,sql,...args).first();
const run=(env,sql,...args)=>stmt(env,sql,...args).run();
const now=()=>new Date().toISOString();
async function body(request){if(Number(request.headers.get('content-length'))>100000)fail('Слишком большой запрос.',413);const text=await request.text();if(text.length>100000)fail('Слишком большой запрос.',413);try{return JSON.parse(text)}catch{fail('Некорректный запрос.')}}
function bounded(value,max,fallback=''){return typeof value==='string'?value.trim().slice(0,max):fallback;}
async function state(env,owner,email){
  const [profile,posts,media,accounts,deliveries]=await Promise.all([
    one(env,'SELECT name,email FROM profiles WHERE owner=?',owner),rows(env,'SELECT * FROM posts WHERE owner=? ORDER BY created DESC',owner),
    rows(env,'SELECT * FROM media WHERE owner=? ORDER BY created DESC',owner),rows(env,'SELECT network,target,label FROM accounts WHERE owner=?',owner),
    rows(env,'SELECT id,post_id,network,status,due,remote_id,error FROM deliveries WHERE owner=? ORDER BY due DESC',owner)
  ]);
  return {name:profile?.name||'Данил',email:profile?.email||email,accounts:accounts.map(a=>a.network),accountDetails:accounts,media:media.map(m=>({...m,src:`/api/media/${m.id}`})),posts:posts.map(p=>({id:p.id,title:p.title,text:p.body,networks:JSON.parse(p.networks),date:p.date,status:p.status,revision:p.revision,publicUrl:p.public_url||'',media:media.find(m=>m.id===p.media_id)?{...media.find(m=>m.id===p.media_id),src:`/api/media/${p.media_id}`}:undefined})),deliveries,scheduler:env.SCHEDULER_MODE==='cron'?'cron':'on-open'};
}
async function savePost(request,env,owner){
  const input=await body(request);const id=bounded(input.id,80)||crypto.randomUUID();
  if(!/^[\w-]+$/.test(id))fail('Некорректный ID.');
  const existing=await one(env,'SELECT * FROM posts WHERE id=? AND owner=?',id,owner);
  if(existing&&!['draft','scheduled'].includes(existing.status))fail('Публикация уже отправлялась. Создайте копию.',409);
  if(existing&&existing.revision!==input.revision)fail('Пост изменён в другой вкладке. Обновите список.',409);
  const status=input.status==='published'?'scheduled':input.status;
  if(!['draft','scheduled'].includes(status))fail('Некорректный статус.');
  const text=bounded(input.text,10001);if(!text||text.length>10000)fail('Текст должен содержать от 1 до 10 000 символов.');
  if(!Array.isArray(input.networks)||input.networks.some(n=>!networks.includes(n)))fail('Неизвестная социальная сеть.');
  const chosen=[...new Set(input.networks)];
  if(!Number.isFinite(new Date(input.date).getTime()))fail('Некорректная дата.');
  const date=input.status==='published'?now():new Date(input.date).toISOString();
  const mediaId=input.media?.id||null;let media=null;
  if(mediaId){media=await one(env,'SELECT * FROM media WHERE id=? AND owner=?',mediaId,owner);if(!media)fail('Медиафайл не найден.');}
  let publicUrl=bounded(input.publicUrl,2000);
  if(publicUrl){let u;try{u=new URL(publicUrl)}catch{fail('Некорректная ссылка на изображение.')}if(u.protocol!=='https:'||u.username||u.password)fail('Нужна публичная HTTPS-ссылка.');}
  if(status==='scheduled'){
    if(!chosen.length)fail('Выберите социальную сеть.');
    if(input.status!=='published'&&new Date(date).getTime()<=Date.now())fail('Выберите время в будущем.');
    const connected=await rows(env,'SELECT network FROM accounts WHERE owner=?',owner);
    if(chosen.some(n=>!connected.some(a=>a.network===n)))fail('Сначала подключите выбранные соцсети.');
    if(chosen.includes('Telegram')&&text.length>(media?1024:4096))fail(`Telegram: максимум ${media?1024:4096} символов.`);
    if(chosen.includes('Telegram')&&media&&!['image/jpeg','image/png','video/mp4'].includes(media.type))fail('Для Telegram выберите JPG, PNG или MP4.');
    if(chosen.includes('VK')&&media)fail('В этой версии VK поддерживает текстовые посты. Уберите вложение или выберите Telegram.');
    if(chosen.includes('Instagram')&&(!publicUrl||text.length>2200))fail('Instagram: нужна публичная ссылка на JPEG и подпись до 2200 символов.');
  }
  const commands=[];const mutation=crypto.randomUUID();
  if(existing){
    commands.push(stmt(env,"UPDATE posts SET title=?,body=?,networks=?,date=?,status=?,media_id=?,public_url=?,mutation=?,revision=revision+1 WHERE id=? AND owner=? AND revision=? AND status IN ('draft','scheduled') AND NOT EXISTS(SELECT 1 FROM deliveries WHERE post_id=? AND status IN ('sending','sent','unknown'))",bounded(input.title,120,text.slice(0,64))||text.slice(0,64),text,JSON.stringify(chosen),date,status,mediaId,publicUrl,mutation,id,owner,existing.revision,id));
    // All dependent mutations require the successfully incremented revision.
    commands.push(stmt(env,'DELETE FROM deliveries WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND mutation=?)',id,id,mutation));
  }else commands.push(stmt(env,'INSERT INTO posts(id,owner,title,body,networks,date,status,media_id,public_url,created,revision,mutation) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)',id,owner,bounded(input.title,120)||text.slice(0,64),text,JSON.stringify(chosen),date,status,mediaId,publicUrl,now(),mutation));
  if(status==='scheduled')for(const network of chosen)commands.push(stmt(env,"INSERT INTO deliveries(id,post_id,owner,network,status,due) SELECT ?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND owner=? AND mutation=?)",crypto.randomUUID(),id,owner,network,date,id,owner,mutation));
  const result=await env.DB.batch(commands);
  if(existing&&!result[0].meta.changes)fail('Пост уже обрабатывается или изменён. Обновите список.',409);
  return id;
}
async function reconcile(env,postId){
  const ds=await rows(env,'SELECT status FROM deliveries WHERE post_id=?',postId);
  if(!ds.length)return;
  const status=ds.every(d=>d.status==='sent')?'published':ds.some(d=>d.status==='sending')?'publishing':ds.some(d=>['failed','unknown'].includes(d.status))?'error':'scheduled';
  await run(env,'UPDATE posts SET status=? WHERE id=?',status,postId);
}
export async function processDue(env,owner){
  // A crashed request is never blindly retried: a provider may have accepted it.
  const stale=await rows(env,"SELECT id,post_id FROM deliveries WHERE status='sending' AND started<?"+(owner?' AND owner=?':''),new Date(Date.now()-180000).toISOString(),...(owner?[owner]:[]));
  for(const d of stale){await run(env,"UPDATE deliveries SET status='unknown',error=? WHERE id=? AND status='sending'",'Ответ не сохранён. Проверьте соцсеть перед повторной отправкой.',d.id);await reconcile(env,d.post_id);}
  const due=await rows(env,"SELECT * FROM deliveries WHERE status='pending' AND due<=?"+(owner?' AND owner=?':'')+' ORDER BY due LIMIT 5',now(),...(owner?[owner]:[]));
  for(const delivery of due){
    const claimed=await run(env,"UPDATE deliveries SET status='sending',started=? WHERE id=? AND status='pending'",now(),delivery.id);
    if(!claimed.meta.changes)continue;
    await reconcile(env,delivery.post_id);
    let remoteAccepted=false;
    try{
      const post=await one(env,'SELECT * FROM posts WHERE id=? AND owner=?',delivery.post_id,delivery.owner);
      const account=await one(env,'SELECT * FROM accounts WHERE owner=? AND network=?',delivery.owner,delivery.network);
      if(!post||!account)throw new Error('Аккаунт отключён. Подключите его и повторите отправку.');
      const media=post.media_id?await one(env,'SELECT * FROM media WHERE id=? AND owner=?',post.media_id,delivery.owner):null;
      const remoteId=await publish(delivery.network,await decrypt(account.secret,env.TOKEN_KEY),account.target,post,media,env,delivery.id);
      remoteAccepted=true;
      await run(env,"UPDATE deliveries SET status='sent',remote_id=?,error=NULL WHERE id=?",remoteId,delivery.id);
    }catch(error){await run(env,'UPDATE deliveries SET status=?,error=? WHERE id=?',error.uncertain||remoteAccepted?'unknown':'failed',remoteAccepted?'Соцсеть приняла пост, но подтверждение не сохранено. Проверьте канал.':error.message?.slice(0,300)||'Не удалось отправить пост.',delivery.id);}
    await reconcile(env,delivery.post_id);
  }
}
export async function api(request,env,ctx){
  try{
    const owner=request.headers.get('oai-authenticated-user-id');const email=request.headers.get('oai-authenticated-user-email');
    if(!owner||!email)return json({error:'Войдите через ChatGPT.'},401);
    if(!env.DB||!env.BUCKET)return json({error:'Хранилище пока недоступно.'},503);
    const url=new URL(request.url);const path=url.pathname;const method=request.method;
    if(method!=='GET'&&method!=='HEAD'){
      if(request.headers.get('origin')!==url.origin||request.headers.get('x-planly-request')!=='1')return json({error:'Недопустимый источник запроса.'},403);
    }
    if(path==='/api/state'&&method==='GET')return json(await state(env,owner,email));
    if(path==='/api/posts'&&method==='POST'){const id=await savePost(request,env,owner);ctx.waitUntil(processDue(env,owner));return json({id},201);}
    if(path==='/api/tick'&&method==='POST'){ctx.waitUntil(processDue(env,owner));return json({ok:true});}
    if(path.startsWith('/api/posts/')&&method==='DELETE'){
      const id=path.split('/').pop();
      const p=await one(env,'SELECT * FROM posts WHERE id=? AND owner=?',id,owner);if(!p)fail('Пост не найден.',404);
      const deleted=await run(env,"DELETE FROM posts WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM deliveries WHERE post_id=? AND status='sending')",id,owner,id);
      if(!deleted.meta.changes)fail('Сейчас идёт отправка. Дождитесь результата.',409);
      await run(env,'DELETE FROM deliveries WHERE post_id=? AND owner=?',id,owner);return json({ok:true});
    }
    if(path.startsWith('/api/retry/')&&method==='POST'){
      const id=path.split('/').pop();const d=await one(env,'SELECT * FROM deliveries WHERE id=? AND owner=?',id,owner);
      if(!d||!['failed','unknown'].includes(d.status))fail('Повтор недоступен.',409);
      const input=await body(request);if(d.status==='unknown'&&input.confirmAbsent!==true)fail('Сначала проверьте, что пост не опубликован.');
      await run(env,"UPDATE deliveries SET status='pending',due=?,error=NULL WHERE id=? AND owner=? AND status IN ('failed','unknown')",now(),id,owner);await reconcile(env,d.post_id);ctx.waitUntil(processDue(env,owner));return json({ok:true});
    }
    if(path==='/api/profile'&&method==='POST'){
      const input=await body(request);const name=bounded(input.name,40);if(!name)fail('Введите имя.');
      await run(env,'INSERT INTO profiles(owner,name,email) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,email=excluded.email',owner,name,email);return json({ok:true});
    }
    if(path==='/api/accounts'&&method==='POST'){
      const input=await body(request);if(!networks.includes(input.network))fail('Неизвестная соцсеть.');
      const token=bounded(input.token,4096);if(!token)fail('Введите токен.');
      const verified=await verifyAccount(input.network,token,bounded(input.target,120));
      const secret=await encrypt(token,env.TOKEN_KEY);
      await run(env,'INSERT INTO accounts(owner,network,target,label,secret) VALUES(?,?,?,?,?) ON CONFLICT(owner,network) DO UPDATE SET target=excluded.target,label=excluded.label,secret=excluded.secret',owner,input.network,verified.target,verified.label,secret);return json({ok:true});
    }
    if(path.startsWith('/api/accounts/')&&method==='DELETE'){
      const network=decodeURIComponent(path.split('/').pop());
      if(await one(env,"SELECT id FROM deliveries WHERE owner=? AND network=? AND status IN ('pending','sending')",owner,network))fail('Сначала отмените запланированные посты этой соцсети.',409);
      await run(env,'DELETE FROM accounts WHERE owner=? AND network=?',owner,network);return json({ok:true});
    }
    if(path==='/api/media'&&method==='POST'){
      const type=request.headers.get('content-type')||'';
      if(!['image/jpeg','image/png','image/webp','video/mp4'].includes(type))fail('Поддерживаются JPG, PNG, WebP, MP4.');
      if(Number(request.headers.get('content-length'))>200*1024*1024)fail('Файл больше 200 МБ.',413);
      const chunks=[];let size=0;const reader=request.body.getReader();
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024){await reader.cancel();fail('Файл больше 20 МБ.',413);}chunks.push(value);}
      if(!size)fail('Пустой файл.');
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:type==='image/webp'?new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP':new TextDecoder().decode(bytes.slice(4,8))==='ftyp';
      if(!valid)fail('Содержимое файла не соответствует формату.');
      const id=crypto.randomUUID();let name='Файл';try{name=decodeURIComponent(request.headers.get('x-file-name')||'Файл').slice(0,200)}catch{}
      await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:type}});
      try{await run(env,'INSERT INTO media(id,owner,name,type,size,created) VALUES(?,?,?,?,?,?)',id,owner,name,type,size,now());}catch(error){await env.BUCKET.delete(id);throw error;}
      return json({id},201);
    }
    if(path.startsWith('/api/media/')){
      const id=path.split('/').pop();const m=await one(env,'SELECT * FROM media WHERE id=? AND owner=?',id,owner);if(!m)fail('Файл не найден.',404);
      if(method==='GET'){const object=await env.BUCKET.get(id);if(!object)fail('Файл не найден.',404);return new Response(object.body,{headers:{'Content-Type':m.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
      if(method==='DELETE'){
        if(await one(env,'SELECT id FROM posts WHERE media_id=? AND owner=?',id,owner))fail('Файл используется в посте. Сначала уберите вложение из поста.',409);
        await run(env,'DELETE FROM media WHERE id=? AND owner=?',id,owner);await env.BUCKET.delete(id);return json({ok:true});
      }
    }
    return json({error:'Не найдено.'},404);
  }catch(error){return json({error:error.status||error.name==='ProviderError'?error.message:'Не удалось выполнить действие. Попробуйте ещё раз.'},error.status||400);}
}

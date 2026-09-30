export class ProviderError extends Error { constructor(message, uncertain=false) { super(message); this.name='ProviderError';this.uncertain=uncertain; } }
async function call(url, init, provider, writing=false) {
  let response;
  try { response=await fetch(url,{...init,signal:AbortSignal.timeout(25000)}); }
  catch { throw new ProviderError(`${provider}: нет ответа. ${writing?'Перед повтором проверьте, не вышел ли пост.':'Попробуйте позже.'}`,writing); }
  let data;
  try { data=await response.json(); } catch { throw new ProviderError(`${provider}: некорректный ответ сервера.`,writing); }
  if(!response.ok||data.error||data.ok===false){
    const code=data.error?.error_code||data.error?.code||data.error_code||response.status;
    throw new ProviderError(`${provider}: запрос отклонён (код ${code}). Проверьте токен, права и формат публикации.`,writing&&response.status>=500);
  }
  return data.result??data.response??data;
}
const form=values=>new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(v)]));
const tg=(token,method,body,writing=false)=>call(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',body:body instanceof FormData?body:form(body)},'Telegram',writing);
const vk=(token,method,body,writing=false)=>call(`https://api.vk.com/method/${method}`,{method:'POST',body:form({...body,access_token:token,v:'5.199'})},'VK',writing);
const ig=(token,path,body,writing=false)=>call(`https://graph.instagram.com/v25.0/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`},...(body?{body:form(body)}:{})},'Instagram',writing);
export async function verifyAccount(network,token,target) {
  if(network==='Telegram') {
    if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||!/^(@[A-Za-z0-9_]+|-?\d+)$/.test(target))throw new ProviderError('Укажите токен бота и @имя либо числовой ID канала.');
    const bot=await tg(token,'getMe',{}); const chat=await tg(token,'getChat',{chat_id:target});
    const member=await tg(token,'getChatMember',{chat_id:chat.id,user_id:bot.id});
    if(chat.type!=='channel'||!['administrator','creator'].includes(member.status)||member.can_post_messages===false)throw new ProviderError('Добавьте бота администратором канала с правом публикации.');
    return {target:String(chat.id),label:chat.title||target};
  }
  if(network==='VK'){
    if(!/^-\d+$/.test(target))throw new ProviderError('Укажите ID сообщества со знаком минус, например -123456.');
    const groups=await vk(token,'groups.getById',{group_ids:target.slice(1),fields:'can_post'});
    const group=(groups.groups||groups)[0];
    if(!group||group.can_post===0)throw new ProviderError('Нет права публикации в этом сообществе.');
    return {target,label:group.name};
  }
  if(network==='Instagram'){
    const profile=await ig(token,'me?fields=user_id,username');
    if(!profile.user_id)throw new ProviderError('Нужен токен Instagram Login профессионального аккаунта.');
    return {target:String(profile.user_id),label:profile.username};
  }
  throw new ProviderError('Неизвестная социальная сеть.');
}
export async function publish(network,token,target,post,media,env,deliveryId){
  if(network==='Telegram'){
    let result;
    if(media){
      const object=await env.BUCKET.get(media.id); if(!object)throw new ProviderError('Файл публикации не найден.');
      const video=media.type.startsWith('video/'); const body=new FormData();
      body.set('chat_id',target);body.set('caption',post.body);body.set(video?'video':'photo',new Blob([await object.arrayBuffer()],{type:media.type}),media.name);
      result=await tg(token,video?'sendVideo':'sendPhoto',body,true);
    }else result=await tg(token,'sendMessage',{chat_id:target,text:post.body},true);
    return String(result.message_id);
  }
  if(network==='VK'){
    const result=await vk(token,'wall.post',{owner_id:target,from_group:1,message:post.body,guid:deliveryId},true);
    return String(result.post_id);
  }
  const container=await ig(token,`${target}/media`,{image_url:post.public_url,caption:post.body});
  for(let attempt=0;attempt<5;attempt++){
    const state=await ig(token,`${container.id}?fields=status_code`);
    if(state.status_code==='FINISHED'){
      const result=await ig(token,`${target}/media_publish`,{creation_id:container.id},true);return String(result.id);
    }
    if(['ERROR','EXPIRED'].includes(state.status_code))throw new ProviderError('Instagram не принял изображение. Нужен публичный JPEG по HTTPS.');
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new ProviderError('Instagram ещё обрабатывает изображение. Публикация не отправлена; повторите позже.');
}

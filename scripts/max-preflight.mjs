// Read-only bot/destination discovery; no publishing, subscriptions, or persisted poll marker.
const token=(process.env.MAX_BOT_TOKEN??'').trim();
if(!token)throw new Error('Configure the private MAX_BOT_TOKEN Actions secret.');
const expectedLink='https://max.ru/channel_danil_sochi_realty';
async function api(path){
 let response;
 try{response=await fetch('https://platform-api2.max.ru'+path,{headers:{authorization:token},redirect:'error',signal:AbortSignal.timeout(30000)});}catch(error){const allowed=new Set(['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','CERT_HAS_EXPIRED','ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT']);const code=error?.cause?.code;throw new Error(`MAX HTTPS connection failed (${allowed.has(code)?code:'UNKNOWN_TRANSPORT'}); TLS verification remains enabled.`);}
 if(!response.ok)throw new Error(`MAX read-only check failed with HTTP${response.status}.`);
 return response.json();
}
const me=await api('/me');
if(me.is_bot!==true||me.username!=='se14310498_bot')throw new Error('MAX did not confirm the designated test bot.');
console.log('PASS designated MAX bot identity');
const snapshot=await api('/updates?types=bot_added,bot_started&timeout=0&limit=100');
console.log(JSON.stringify({updateCount:(snapshot.updates??[]).length,types:[...new Set((snapshot.updates??[]).map(u=>u.update_type))]}));
const ids=new Set();
for(const update of snapshot.updates??[]){for(const id of[update.chat_id,update.chat?.chat_id,update.message?.recipient?.chat_id])if(Number.isSafeInteger(id)&&id!==0)ids.add(String(id));}
let destination=null;
for(const id of ids){const chat=await api(`/chats/${id}`);console.log(JSON.stringify({candidateId:id,title:chat.title,type:chat.type,status:chat.status,publicLink:typeof chat.link==='string'&&chat.link.startsWith('https://max.ru/')?chat.link:null}));if(chat.link?.replace(/\/$/,'')===expectedLink){destination=id;console.log(JSON.stringify({chatId:id,title:chat.title,type:chat.type,status:chat.status,link:chat.link}));}}
if(!destination)throw new Error('No update confirmed the supplied MAX destination link. A numeric chat_id or a fresh bot_added event is needed; no chat was guessed.');
console.log(`MAX_TEST_CHAT_ID=${destination}`);

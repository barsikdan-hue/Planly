// Explicit owner-authorized one-shot connector test; never part of ordinary tests.
import {readFile} from 'node:fs/promises';
import {createMaxConnector} from '../lib/server/connectors/max.ts';
const token=(process.env.MAX_BOT_TOKEN??'').trim();
if(process.env.PLANLY_MAX_LIVE_TEST!=='confirmed-owner-channel'||!token)throw new Error('Explicit live-test opt-in and private token required.');
const destination='-78857616977254';
async function read(path){const response=await fetch('https://platform-api2.max.ru'+path,{headers:{authorization:token},redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`MAX validation HTTP ${response.status}`);return response.json();}
const bot=await read('/me');
if(bot.is_bot!==true||bot.username!=='se14310498_bot')throw new Error('Designated bot identity mismatch.');
const chat=await read(`/chats/${destination}`);
if(chat.link!=='https://max.ru/channel_danil_sochi_realty')throw new Error('Owner destination link mismatch.');
const connector=createMaxConnector({token});
const validated=await connector.validate(destination);
if(!validated.ok)throw new Error(`MAX validation failed: ${validated.code}`);
const photo={name:'photo.png',mimeType:'image/png',bytes:new Uint8Array(await readFile('artifacts/max-fixtures/photo.png'))};
const video={name:'video.mp4',mimeType:'video/mp4',bytes:new Uint8Array(await readFile('artifacts/max-fixtures/video.mp4'))};
for(const [label,text,media] of [
 ['text','[ТЕСТ PLANLY] MAX: отдельный текст ✅',[]],
 ['image','',[photo]],
 ['image-caption','[ТЕСТ PLANLY] Картинка с текстом ✅',[photo]],
 ['video','[ТЕСТ PLANLY] Видео с текстом ✅',[video]]
]){
 const result=await connector.publish({provider:'MAX',destinationId:destination,text,media});
 if(!result.ok)throw new Error(`MAX ${label}: ${result.code}; ${result.errorType}. Do not blindly resend.`);
 console.log(JSON.stringify({label,status:'confirmed',destination,remoteId:result.remoteId,remoteUrl:result.remoteUrl}));
 await new Promise(resolve=>setTimeout(resolve,1500));
}

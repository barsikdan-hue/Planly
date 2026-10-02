// Explicit owner-authorized one-shot connector test; never part of ordinary tests.
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
const result=await connector.publish({provider:'MAX',destinationId:destination,text:'[ТЕСТ PLANLY] MAX подключён ✅\nПроверка публикации текста. '+new Date().toISOString()});
if(!result.ok)throw new Error(`MAX send result: ${result.code}; ${result.errorType}. Do not blindly resend.`);
console.log(JSON.stringify({status:'confirmed',destination,remoteId:result.remoteId,remoteUrl:result.remoteUrl}));

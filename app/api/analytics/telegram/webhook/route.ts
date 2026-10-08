import {timingSafeEqual} from 'node:crypto';
import {PayloadLimitError,readBoundedJson} from '../../../../../lib/server/analytics/body.ts';
import {ingestTelegramReaction,parseReactionCountUpdate} from '../../../../../lib/server/analytics/telegram.ts';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export async function POST(request:Request):Promise<Response> {
  const expected=process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET;
  if(!expected||!/^[A-Za-z0-9_-]{1,256}$/.test(expected))return response({error:'Reaction collection is not configured'},503);
  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!supplied||!/^[A-Za-z0-9_-]{1,256}$/.test(supplied)||supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return response({error:'Unauthorized'},401);
  let update;
  try{update=parseReactionCountUpdate(await readBoundedJson(request.body,65536));}
  catch(error){return response({error:error instanceof PayloadLimitError?'Payload too large':'Invalid reaction update'},error instanceof PayloadLimitError?413:400);}
  if(update){try{await ingestTelegramReaction(update);}catch{return response({error:'Reaction collection unavailable'},503);}}
  return response({ok:true});
}

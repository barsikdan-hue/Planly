import { createHash } from 'node:crypto';
import { SocialConnectionError, connectionDenied } from './state.ts';
type Provider = 'TELEGRAM'|'MAX';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function socialConnectionConfig(provider:Provider) {
  if(provider!=='TELEGRAM' && provider!=='MAX') return connectionDenied();
  const token=process.env[`${provider}_BOT_TOKEN`]??'', appUrl=process.env[`${provider}_MINI_APP_URL`]??'';
  const tokenValid=provider==='TELEGRAM'?/^[1-9]\d*:[A-Za-z0-9_-]{20,}$/.test(token) && token.length<=4096:/^[\x21-\x7e]{16,4096}$/.test(token);
  const appValid=(provider==='TELEGRAM'?/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,63}$/:/^https:\/\/max\.ru\/[A-Za-z][A-Za-z0-9_-]{2,63}$/).test(appUrl);
  if(!tokenValid || !appValid) throw new SocialConnectionError('UNAVAILABLE');
  return {token,appUrl,revision:digest(JSON.stringify([provider,token,appUrl]))};
}

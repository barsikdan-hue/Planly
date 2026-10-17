import {createHash} from 'node:crypto';

// A recognizable shared label without sending a private Planly name to the WebView.
export const socialConnectionAccountHint=(accountId:string)=>`Planly • ${createHash('sha256').update(accountId).digest('hex').slice(0,10)}`;

import {createHash} from 'node:crypto';

// A recognizable shared label without sending a private Lentaro name to the WebView.
export const socialConnectionAccountHint=(accountId:string)=>`Lentaro • ${createHash('sha256').update(accountId).digest('hex').slice(0,10)}`;

import {receiptWindowResponse} from '../../../lib/server/vk/upload-window-document.ts';
export const dynamic='force-dynamic';
// Generic page only. Owner admission and the authenticated one-shot POST guard data.
export function GET():Response{return receiptWindowResponse();}

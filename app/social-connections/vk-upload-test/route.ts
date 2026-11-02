import {uploadWindowResponse} from '../../../lib/server/vk/upload-window-document.ts';
export const dynamic='force-dynamic';
// No private data or authorization is issued by this generic page. Existing
// owner admission and the authenticated POST remain the security boundary.
export function GET():Response{return uploadWindowResponse();}

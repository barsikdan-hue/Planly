import {userUploadWindowResponse} from '../../../lib/server/vk/user-upload-window-document.ts';
export const dynamic='force-dynamic';
// This generic document grants no access; GET admission and POST authenticate separately.
export function GET():Response{return userUploadWindowResponse();}

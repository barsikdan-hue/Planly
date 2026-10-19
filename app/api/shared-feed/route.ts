import {json} from '../../../lib/server/http.ts';
import {listSharedFeed} from '../../../lib/server/shared-feed.ts';
import {sharedLibraryApiError} from '../../../lib/server/shared-library.ts';
export async function GET(request:Request):Promise<Response>{
 try{return json({items:await listSharedFeed(request)});}catch(error){return sharedLibraryApiError(error);}
}

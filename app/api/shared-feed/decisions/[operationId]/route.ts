import {json} from '../../../../../lib/server/http.ts';
import {readSharedFeedDecision} from '../../../../../lib/server/shared-feed.ts';
import {sharedLibraryApiError} from '../../../../../lib/server/shared-library.ts';
export async function GET(request:Request,{params}:{params:Promise<{operationId:string}>}):Promise<Response>{
 try{return json(await readSharedFeedDecision(request,(await params).operationId));}catch(error){return sharedLibraryApiError(error);}
}

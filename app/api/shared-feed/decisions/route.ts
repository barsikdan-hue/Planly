import {requireApiOwner} from '../../../../lib/server/auth/owner.ts';
import {json,readJson} from '../../../../lib/server/http.ts';
import {commitSharedFeedDecision} from '../../../../lib/server/shared-feed.ts';
import {sharedLibraryApiError} from '../../../../lib/server/shared-library.ts';
export async function POST(request:Request):Promise<Response>{
 try{await requireApiOwner(request);return json(await commitSharedFeedDecision(request,await readJson(request)),201);}catch(error){return sharedLibraryApiError(error);}
}

import {cancelApprovalInputSchema} from '../contracts/planner.ts';
import {readBoundedJson} from './analytics/body.ts';
import {requireApiOwner,requestCookie} from './auth/owner.ts';
import {ForbiddenError} from './auth/access.ts';
import {SESSION_COOKIE_NAME} from './auth/session.ts';
import {cancelPublicationApproval} from './publication-approval-cancellation.ts';
import {requireSocialConnectionRequest,socialConnectionApiError,socialConnectionJson} from './social-connections/http.ts';

export async function cancelApprovalPost(request:Request,context:{params:Promise<{id:string;targetId:string}>}):Promise<Response> {
 try {
  await requireApiOwner(request);requireSocialConnectionRequest(request);
  for(const name of request.headers.keys())if(/^x-(?:planly-)?(?:destination|error|publication|target|binding)(?:-|$)/i.test(name))throw new ForbiddenError();
  const {id,targetId}=await context.params;
  let raw:unknown;
  try{raw=await readBoundedJson(request.body,2048);}catch(error){if(error instanceof TypeError)throw new SyntaxError('Malformed JSON');throw error;}
  const body=cancelApprovalInputSchema.parse(raw);
  return socialConnectionJson(await cancelPublicationApproval(requestCookie(request,SESSION_COOKIE_NAME)??'',id,targetId,body));
 }catch(error){return socialConnectionApiError(error);}
}

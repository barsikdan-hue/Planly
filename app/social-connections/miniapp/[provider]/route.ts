import {buildSocialConnectionMiniApp} from '../../../../lib/server/social-connections/documents.ts';
import {getSocialConnectionReadiness} from '../../../../lib/server/social-connections/service.ts';
import {socialConnectionJson} from '../../../../lib/server/social-connections/http.ts';
export async function GET(_request:Request,context:{params:Promise<{provider:string}>}):Promise<Response> {
 const {provider}=await context.params;
 if(provider!=='telegram' && provider!=='max')return socialConnectionJson({error:'Invalid connection input'},422);
 return buildSocialConnectionMiniApp(provider,getSocialConnectionReadiness(provider==='telegram'?'TELEGRAM':'MAX').available);
}

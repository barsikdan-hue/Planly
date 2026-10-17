import { connectionLifecycle } from '../../../../../../lib/server/social-connections/http.ts';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  return connectionLifecycle(request,context,'pause');
}

import { requireApiOwner } from '../../../../../lib/server/auth/owner.ts';
import { UnauthorizedError } from '../../../../../lib/server/auth/owner.ts';
import { completeVkOAuth } from '../../../../../lib/server/vk/oauth.ts';
import { validateVkCommunity } from '../../../../../lib/server/connectors/vk.ts';
import { vkApiError } from '../../../../../lib/server/vk/http.ts';

function feedback(connected: boolean): Response {
  try {
    const redirect = new URL(process.env.VK_REDIRECT_URI || '');
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password) return vkApiError(new Error());
    const destination = new URL(`/?vk=${connected ? 'connected' : 'reconnect'}#settings`, redirect.origin);
    return new Response(null, { status: 303, headers: { location: destination.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  } catch { return vkApiError(new Error()); }
}
export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const query = new URL(request.url).searchParams;
    await completeVkOAuth(owner.id, { state: query.get('state') || '', code: query.get('code') || '', deviceId: query.get('device_id') || '' },
      (token, communityId) => validateVkCommunity({ token, communityId }));
    return feedback(true);
  } catch (error) {
    if (error instanceof UnauthorizedError) return vkApiError(error);
    return feedback(false);
  }
}

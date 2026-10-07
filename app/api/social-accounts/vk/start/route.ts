import { z } from 'zod';
import { requireApiOwner } from '../../../../../lib/server/auth/owner.ts';
import { json, readJson } from '../../../../../lib/server/http.ts';
import { startVkOAuth } from '../../../../../lib/server/vk/oauth.ts';
import { requireVkSameOrigin, vkApiError } from '../../../../../lib/server/vk/http.ts';

const inputSchema = z.object({ accountId: z.string().min(1).max(128), communityId: z.string().regex(/^[1-9]\d{0,14}$/) }).strict();
export async function POST(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    requireVkSameOrigin(request);
    const input = inputSchema.parse(await readJson(request));
    const response = json(await startVkOAuth(owner.id, input.accountId, input.communityId));
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) { return vkApiError(error); }
}

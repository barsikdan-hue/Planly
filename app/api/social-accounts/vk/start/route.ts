import { z } from 'zod';
import { requireApiOwner } from '../../../../../lib/server/auth/owner.ts';
import { json, readJson } from '../../../../../lib/server/http.ts';
import { startVkOAuth } from '../../../../../lib/server/vk/oauth.ts';
import { requireVkSameOrigin, vkApiError } from '../../../../../lib/server/vk/http.ts';
import { getVkConfig } from '../../../../../lib/server/vk/config.ts';

const inputSchema = z.object({ accountId: z.string().min(1).max(128), communityId: z.string().regex(/^[1-9]\d{0,14}$/) }).strict();
export async function POST(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    // Next's listen URL uses 0.0.0.0 behind Render; only server config defines the public origin.
    requireVkSameOrigin(request, new URL(getVkConfig().redirectUri).origin);
    const input = inputSchema.parse(await readJson(request));
    const response = json(await startVkOAuth(owner.id, input.accountId, input.communityId));
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) { return vkApiError(error); }
}

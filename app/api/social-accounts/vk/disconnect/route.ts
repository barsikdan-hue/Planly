import { z } from 'zod';
import { requireApiOwner } from '../../../../../lib/server/auth/owner.ts';
import { json, readJson } from '../../../../../lib/server/http.ts';
import { listSocialAccounts } from '../../../../../lib/server/social-accounts.ts';
import { disconnectVkAccount } from '../../../../../lib/server/vk/oauth.ts';
import { requireVkSameOrigin, vkApiError } from '../../../../../lib/server/vk/http.ts';

const inputSchema = z.object({ accountId: z.string().min(1).max(128) }).strict();
export async function POST(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    requireVkSameOrigin(request);
    const { accountId } = inputSchema.parse(await readJson(request));
    await disconnectVkAccount(owner.id, accountId);
    return json((await listSocialAccounts(owner.id)).find(account => account.id === accountId));
  } catch (error) { return vkApiError(error); }
}

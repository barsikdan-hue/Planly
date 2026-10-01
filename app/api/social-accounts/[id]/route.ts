import { z } from 'zod';
import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../../lib/server/http.ts';
import { setSocialAccountEnabled } from '../../../../lib/server/social-accounts.ts';

const inputSchema = z.object({ enabled: z.boolean() });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    const input = inputSchema.parse(await readJson(request));
    return json(await setSocialAccountEnabled(owner.id, id, input.enabled));
  } catch (error) {
    return apiError(error);
  }
}

import { z } from 'zod';
import { requireApiOwner } from '../../../../lib/server/auth/owner.ts';
import { apiError, json, readJson } from '../../../../lib/server/http.ts';
import { connectSocialAccount, setSocialAccountEnabled } from '../../../../lib/server/social-accounts.ts';

const inputSchema = z.union([z.object({ enabled: z.boolean() }).strict(),z.object({destinationId:z.string().trim().regex(/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?[1-9]\d{0,15})$/)}).strict()]);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const { id } = await context.params;
    const input = inputSchema.parse(await readJson(request));
    if ('destinationId' in input) {
      const result = await connectSocialAccount(owner.id,id,input.destinationId);
      if ('ok' in result) return json({error:result.message},422);
      return json(result);
    }
    return json(await setSocialAccountEnabled(owner.id, id, input.enabled));
  } catch (error) {
    return apiError(error);
  }
}

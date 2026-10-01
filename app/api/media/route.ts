import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json } from '../../../lib/server/http.ts';
import { createMediaAsset, listMediaAssetsWithPreview } from '../../../lib/server/media.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    return json(await listMediaAssetsWithPreview(owner.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'A media file is required' }, 400);
    return json(await createMediaAsset(owner.id, file), 201);
  } catch (error) {
    if (error instanceof Error && /media|image|unsupported|20 MiB|signature|empty/i.test(error.message)) {
      return json({ error: error.message }, 422);
    }
    return apiError(error);
  }
}

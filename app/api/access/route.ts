import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { users } from '../../../db/schema.ts';
import { hasManualAccess } from '../../../lib/manual-access.ts';
import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json } from '../../../lib/server/http.ts';
export async function GET(request: Request) {
  try {
    const owner = await requireApiOwner(request);
    const [user] = await getDb().select().from(users).where(eq(users.id, owner.id));
    if (!user) return json({ error: 'Unauthorized' }, 401);
    return json({ expiresAt: user.accessExpiresAt?.toISOString() ?? null, canPublish: hasManualAccess(user) });
  } catch (error) { return apiError(error); }
}

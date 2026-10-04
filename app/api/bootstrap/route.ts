import { requireApiOwner } from '../../../lib/server/auth/owner.ts';
import { apiError, json } from '../../../lib/server/http.ts';
import { listMediaAssetsWithPreview } from '../../../lib/server/media.ts';
import { listPlannerPosts } from '../../../lib/server/posts.ts';
import { getProfile } from '../../../lib/server/profile.ts';
import { listSocialAccounts } from '../../../lib/server/social-accounts.ts';
import { listLibraryItems } from '../../../lib/server/library-items.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireApiOwner(request);
    const [profile, posts, media, socialAccounts, libraryItems] = await Promise.all([
      getProfile(owner.id),
      listPlannerPosts(owner.id),
      listMediaAssetsWithPreview(owner.id),
      listSocialAccounts(owner.id),
      listLibraryItems(owner.id),
    ]);
    return json({ profile, posts, media, socialAccounts, libraryItems });
  } catch (error) {
    return apiError(error);
  }
}

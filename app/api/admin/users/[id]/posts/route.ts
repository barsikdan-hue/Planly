import { z } from 'zod';
import { apiError, json, readJson } from '../../../../../../lib/server/http.ts';
import { withAdmin } from '../../../../../../lib/server/auth/admin.ts';
import { listPlannerPosts, updatePost } from '../../../../../../lib/server/posts.ts';
import { PostEditConflictError } from '../../../../../../lib/server/post-editability.ts';
import { managedPostView } from '../../../../../../lib/server/managed-post-view.ts';
import { and, eq, ne, sql } from 'drizzle-orm';
import { users } from '../../../../../../db/schema.ts';
import { getOwnerEmail } from '../../../../../../lib/server/env.ts';
import type { AuthTransaction } from '../../../../../../lib/server/auth/admin.ts';

const rescheduleSchema = z.object({
  postId: z.string().min(1),
  provider: z.enum(['telegram', 'max', 'vk']),
  scheduledAt: z.string().datetime({ offset: true }),
}).strict();

async function managedPosts(tx: AuthTransaction, id: string, adminId: string) {
  if (!id || id === adminId) throw new Error('Managed user not found');
  const [managed] = await tx.select({ id: users.id }).from(users).where(and(
    eq(users.id, id), eq(users.role, 'USER'), eq(users.authInitialized, true),
    ne(users.id, adminId), sql`lower(trim(${users.email})) <> ${getOwnerEmail()}`,
  )).limit(1);
  if (!managed) throw new Error('Managed user not found');
  return listPlannerPosts(id);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await withAdmin(request, async (tx, adminId) => {
      const posts = await managedPosts(tx, id, adminId);
      return { posts: posts.map(managedPostView).filter(post => post !== null) };
    }));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = rescheduleSchema.parse(await readJson(request));
    return json(await withAdmin(request, async (tx, adminId) => {
      const posts = await managedPosts(tx, id, adminId);
      const post = posts.find(candidate => candidate.id === input.postId);
      if (!post || !managedPostView(post)) throw new Error('Post not found');
      if (post.editBlockedReason) throw new PostEditConflictError(post.editBlockedReason);
      const target = post.targets.find(candidate => candidate.provider === input.provider);
      if (!target) throw new Error('Post target not found');
      const updated = await updatePost(id, post.id, { title: post.title, baseText: post.baseText, status: post.status, mediaIds: post.mediaIds, targets: post.targets.map(candidate => ({ provider: candidate.provider, textOverride: candidate.textOverride, scheduledAt: candidate.scheduledAt })) }, { rescheduleOnly: { provider: input.provider, scheduledAt: input.scheduledAt } });
      return managedPostView(updated);
    }));
  } catch (error) { return apiError(error); }
}

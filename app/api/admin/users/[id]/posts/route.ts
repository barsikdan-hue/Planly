import { z } from 'zod';
import { apiError, json, readJson } from '../../../../../../lib/server/http.ts';
import { withAdmin } from '../../../../../../lib/server/auth/admin.ts';
import { listPlannerPosts, updatePost } from '../../../../../../lib/server/posts.ts';
import { postEditBlockedReason } from '../../../../../../lib/server/post-editability.ts';

const rescheduleSchema = z.object({
  postId: z.string().min(1),
  provider: z.enum(['telegram', 'max', 'vk']),
  scheduledAt: z.string().datetime({ offset: true }),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await withAdmin(request, async (_tx, adminId) => {
      if (!id || id === adminId) throw new Error('Managed user not found');
      const posts = await listPlannerPosts(id);
      return { posts: posts.map(post => ({ ...post, targets: post.targets.map(target => ({
        id: target.id, provider: target.provider, scheduledAt: target.scheduledAt,
        publication: target.publication ? { status: target.publication.status, remoteId: target.publication.remoteId, remoteUrl: target.publication.remoteUrl, error: target.publication.error } : null,
      })) })) };
    }));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = rescheduleSchema.parse(await readJson(request));
    return json(await withAdmin(request, async (_tx, adminId) => {
      if (!id || id === adminId) throw new Error('Managed user not found');
      const posts = await listPlannerPosts(id);
      const post = posts.find(candidate => candidate.id === input.postId);
      if (!post) throw new Error('Post not found');
      const blocked = postEditBlockedReason(post.targets.flatMap(target => target.publication ? [{ status: target.publication.status }] : []));
      if (blocked) throw new Error('Post cannot be rescheduled after publication');
      const target = post.targets.find(candidate => candidate.provider === input.provider);
      if (!target) throw new Error('Post target not found');
      return updatePost(id, post.id, { title: post.title, baseText: post.baseText, status: post.status, mediaIds: post.mediaIds, targets: post.targets.map(candidate => ({ provider: candidate.provider, textOverride: candidate.textOverride, scheduledAt: candidate.provider === input.provider ? input.scheduledAt : candidate.scheduledAt })) });
    }));
  } catch (error) { return apiError(error); }
}

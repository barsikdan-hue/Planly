import type { PostDto } from '../contracts/planner.ts';

// ADMIN schedule permission does not grant access to the user's private drafts,
// account IDs, media IDs, overrides or provider diagnostics.
export function managedPostView(post: PostDto) {
  const targets = post.targets.filter(target => target.publication?.status === 'PUBLISHED' ||
    (post.status === 'READY' && target.scheduledAt !== null));
  if (!targets.length) return null;
  return {
    id: post.id, title: post.title, baseText: post.baseText, status: post.status,
    editBlockedReason: post.editBlockedReason,
    targets: targets.map(target => ({
      id: target.id, provider: target.provider, scheduledAt: target.scheduledAt,
      publication: target.publication ? { status: target.publication.status, remoteUrl: target.publication.remoteUrl } : null,
    })),
  };
}

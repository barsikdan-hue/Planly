import { and, asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, socialAccounts } from '../../db/schema.ts';
import {
  fromDbProvider,
  savePostInputSchema,
  toDbProvider,
  type PostDto,
  type SavePostInput,
} from '../contracts/planner.ts';
import { reconcilePostPublicationsInTx } from './publications.ts';

const providerOrder = { telegram: 0, max: 1 } as const;

async function readOwnedPost(userId: string, postId: string): Promise<PostDto> {
  const db = getDb();
  const [post] = await db.select().from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);
  if (!post) throw new Error('Post not found');

  const targetRows = await db.select({ target: postTargets, account: socialAccounts })
    .from(postTargets)
    .innerJoin(socialAccounts, eq(postTargets.socialAccountId, socialAccounts.id))
    .where(and(
      eq(postTargets.postId, postId),
      eq(postTargets.active, true),
      eq(socialAccounts.userId, userId),
    ));

  const mediaRows = await db.select({ mediaId: postMedia.mediaId, position: postMedia.position })
    .from(postMedia)
    .where(eq(postMedia.postId, postId))
    .orderBy(asc(postMedia.position));

  const targets = targetRows.map(({ target, account }) => ({
    id: target.id,
    socialAccountId: account.id,
    provider: fromDbProvider(account.provider),
    textOverride: target.textOverride,
    scheduledAt: target.scheduledAt?.toISOString() ?? null,
  })).sort((a, b) => providerOrder[a.provider] - providerOrder[b.provider]);

  return {
    id: post.id,
    title: post.title,
    baseText: post.baseText,
    status: post.status,
    targets,
    mediaIds: mediaRows.map(row => row.mediaId),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

async function validateRelations(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  userId: string,
  input: SavePostInput,
) {
  if (input.mediaIds.length) {
    const rows = await tx.select({ id: mediaAssets.id }).from(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.id, input.mediaIds)));
    if (rows.length !== input.mediaIds.length) throw new Error('Media not found for owner');
  }

  const providers = input.targets.map(target => toDbProvider(target.provider));
  if (!providers.length) return new Map<string, string>();
  const accounts = await tx.select().from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), inArray(socialAccounts.provider, providers)));
  if (accounts.length !== new Set(providers).size) throw new Error('Social account not found');
  return new Map(accounts.map(account => [account.provider, account.id]));
}

export async function listPlannerPosts(userId: string): Promise<PostDto[]> {
  const db = getDb();
  const rows = await db.select({ id: posts.id }).from(posts)
    .where(eq(posts.userId, userId))
    .orderBy(asc(posts.createdAt));
  return Promise.all(rows.map(row => readOwnedPost(userId, row.id)));
}

export async function createPost(userId: string, rawInput: SavePostInput): Promise<PostDto> {
  const input = savePostInputSchema.parse(rawInput);
  const postId = randomUUID();
  const db = getDb();

  await db.transaction(async tx => {
    const accounts = await validateRelations(tx, userId, input);
    const now = new Date();
    await tx.insert(posts).values({
      id: postId,
      userId,
      title: input.title ?? null,
      baseText: input.baseText,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });

    if (input.targets.length) {
      await tx.insert(postTargets).values(input.targets.map(target => ({
        id: randomUUID(),
        postId,
        socialAccountId: accounts.get(toDbProvider(target.provider))!,
        textOverride: target.textOverride,
        scheduledAt: target.scheduledAt ? new Date(target.scheduledAt) : null,
        active: true,
        createdAt: now,
        updatedAt: now,
      })));
    }

    if (input.mediaIds.length) {
      await tx.insert(postMedia).values(input.mediaIds.map((mediaId, position) => ({ postId, mediaId, position })));
    }

    await reconcilePostPublicationsInTx(tx, userId, postId);
  });

  return readOwnedPost(userId, postId);
}

export async function updatePost(
  userId: string,
  postId: string,
  rawInput: SavePostInput,
): Promise<PostDto> {
  const input = savePostInputSchema.parse(rawInput);
  const db = getDb();

  await db.transaction(async tx => {
    const accounts = await validateRelations(tx, userId, input);
    const [owned] = await tx.update(posts)
      .set({
        title: input.title ?? null,
        baseText: input.baseText,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .returning({ id: posts.id });
    if (!owned) throw new Error('Post not found');

    const now = new Date();
    const existingTargets = await tx.select().from(postTargets).where(eq(postTargets.postId, postId));
    const desiredByAccount = new Map(input.targets.map(target => [
      accounts.get(toDbProvider(target.provider))!,
      target,
    ]));

    for (const existing of existingTargets) {
      const desired = desiredByAccount.get(existing.socialAccountId);
      if (desired) {
        await tx.update(postTargets)
          .set({
            textOverride: desired.textOverride,
            scheduledAt: desired.scheduledAt ? new Date(desired.scheduledAt) : null,
            active: true,
            updatedAt: now,
          })
          .where(eq(postTargets.id, existing.id));
        desiredByAccount.delete(existing.socialAccountId);
      } else if (existing.active) {
        await tx.update(postTargets)
          .set({ active: false, updatedAt: now })
          .where(eq(postTargets.id, existing.id));
      }
    }

    for (const [socialAccountId, target] of desiredByAccount) {
      await tx.insert(postTargets).values({
        id: randomUUID(),
        postId,
        socialAccountId,
        textOverride: target.textOverride,
        scheduledAt: target.scheduledAt ? new Date(target.scheduledAt) : null,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx.delete(postMedia).where(eq(postMedia.postId, postId));
    if (input.mediaIds.length) {
      await tx.insert(postMedia).values(input.mediaIds.map((mediaId, position) => ({ postId, mediaId, position })));
    }

    await reconcilePostPublicationsInTx(tx, userId, postId);
  });

  return readOwnedPost(userId, postId);
}

export async function deletePost(userId: string, postId: string): Promise<void> {
  const db = getDb();
  const rows = await db.delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .returning({ id: posts.id });
  if (!rows.length) throw new Error('Post not found');
}

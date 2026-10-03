import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts } from '../../db/schema.ts';
import {
  fromDbProvider,
  savePostInputSchema,
  toDbProvider,
  type PostDto,
  type SavePostInput,
} from '../contracts/planner.ts';
import { reconcilePostPublicationsInTx, type PublicationQueueChange } from './publications.ts';
import { applyPublicationQueueChanges } from './scheduler/reconcile.ts';
import { PublicationContentError, validatePublicationContent, type PublicationMediaMetadata } from '../publication-content.ts';
import { CreationConflictError, creationInputHash, creationKeySchema } from './post-idempotency.ts';

const providerOrder = { telegram: 0, max: 1 } as const;

type PostPersistenceOptions = {
  mirrorQueue?: (changes: PublicationQueueChange[]) => Promise<void>;
  creationKey?: string;
};

async function mirrorQueueBestEffort(
  changes: PublicationQueueChange[],
  options: PostPersistenceOptions,
): Promise<void> {
  try {
    await (options.mirrorQueue ?? applyPublicationQueueChanges)(changes);
  } catch (error) {
    console.error('Publication queue mirror failed', error instanceof Error ? error.message : 'unknown error');
  }
}

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

  const publicationRows = await db.select().from(publications)
    .where(and(eq(publications.postId, postId), eq(publications.userId, userId)))
    .orderBy(desc(publications.createdAt), desc(publications.id));
  const latestByTarget = new Map<string, typeof publications.$inferSelect>();
  for (const row of publicationRows) if (!latestByTarget.has(row.postTargetId)) latestByTarget.set(row.postTargetId, row);

  const targets = targetRows.map(({ target, account }) => ({
    id: target.id,
    socialAccountId: account.id,
    publication: (() => {
      const row = latestByTarget.get(target.id);
      return row ? {status: row.status, remoteId: row.providerRemoteId, remoteUrl: row.providerUrl,
        error: row.providerErrorMessage} : null;
    })(),
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
  let media: PublicationMediaMetadata[] = [];
  if (input.mediaIds.length) {
    const rows = await tx.select({ id: mediaAssets.id, mimeType: mediaAssets.mimeType,
      byteSize: mediaAssets.byteSize, width: mediaAssets.width, height: mediaAssets.height }).from(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.id, input.mediaIds)));
    if (rows.length !== input.mediaIds.length) throw new Error('Media not found for owner');
    media = rows;
  }

  for (const target of input.targets) {
    if (!target.scheduledAt) continue;
    const issue = validatePublicationContent(toDbProvider(target.provider), target.textOverride ?? input.baseText, media);
    if (issue) throw new PublicationContentError(issue);
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

export async function createPost(
  userId: string,
  rawInput: SavePostInput,
  options: PostPersistenceOptions = {},
): Promise<PostDto> {
  const input = savePostInputSchema.parse(rawInput);
  const postId = randomUUID();
  const creationKey = options.creationKey === undefined ? null : creationKeySchema.parse(options.creationKey);
  const inputHash = creationKey ? creationInputHash(input) : null;
  const db = getDb();

  const result = await db.transaction(async tx => {
    const readExisting = async () => {
      const [existing] = await tx.select({ id: posts.id, inputHash: posts.creationInputHash }).from(posts)
        .where(and(eq(posts.userId, userId), eq(posts.creationKey, creationKey!))).limit(1);
      if (existing && existing.inputHash !== inputHash) throw new CreationConflictError();
      return existing;
    };
    if (creationKey) {
      const existing = await readExisting();
      if (existing) return { postId: existing.id, changes: [] as PublicationQueueChange[], created: false };
    }
    const accounts = await validateRelations(tx, userId, input);
    const now = new Date();
    const inserted = await tx.insert(posts).values({
      id: postId,
      userId,
      title: input.title ?? null,
      baseText: input.baseText,
      status: input.status,
      creationKey,
      creationInputHash: inputHash,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing({ target: [posts.userId, posts.creationKey] }).returning({ id: posts.id });
    if (!inserted.length) {
      const existing = await readExisting();
      if (!existing) throw new Error('Creation result unavailable');
      return { postId: existing.id, changes: [] as PublicationQueueChange[], created: false };
    }

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

    return { postId, changes: await reconcilePostPublicationsInTx(tx, userId, postId), created: true };
  });

  if (result.created) await mirrorQueueBestEffort(result.changes, options);
  return readOwnedPost(userId, result.postId);
}

export async function updatePost(
  userId: string,
  postId: string,
  rawInput: SavePostInput,
  options: PostPersistenceOptions = {},
): Promise<PostDto> {
  const input = savePostInputSchema.parse(rawInput);
  const db = getDb();

  const changes = await db.transaction(async tx => {
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

    return reconcilePostPublicationsInTx(tx, userId, postId);
  });

  await mirrorQueueBestEffort(changes, options);
  return readOwnedPost(userId, postId);
}

export async function deletePost(userId: string, postId: string): Promise<void> {
  const db = getDb();
  const rows = await db.delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .returning({ id: posts.id });
  if (!rows.length) throw new Error('Post not found');
}

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { getDb } from '../../db/index.ts';
import { libraryItems, postMedia, posts, postTargets, publications, socialAccounts } from '../../db/schema.ts';
import {
  fromDbProvider,
  createPostSourceSchema,
  savePostInputSchema,
  toDbProvider,
  type PostDto,
  type SavePostInput,
} from '../contracts/planner.ts';
import { reconcilePostPublicationsInTx, type PublicationQueueChange } from './publications.ts';
import { applyPublicationQueueChanges } from './scheduler/reconcile.ts';
import { validatePostRelations } from './post-relations.ts';
import { CreationConflictError, creationInputHash, creationKeySchema } from './post-idempotency.ts';
import { postEditBlockedReason, PostEditConflictError, samePostInput } from './post-editability.ts';
import { LibrarySourceConflictError } from './library-conversion-error.ts';
import { LibrarySourceStaleError, lockOwnerSchedule, occupiedSlotMinutes, PlannerSlotConflictError, requirePlannerAccounts } from './planner-slots.ts';
import { slotMinuteKey } from '../planner-slots.ts';

const providerOrder = { telegram: 0, max: 1, vk: 2 } as const;

type PostPersistenceOptions = {
  mirrorQueue?: (changes: PublicationQueueChange[]) => Promise<void>;
  creationKey?: string;
  sourceLibraryItemId?: string;
  sourceLibraryUpdatedAt?: string;
  requireFreeSlot?: boolean;
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
    editBlockedReason: postEditBlockedReason(publicationRows),
    title: post.title,
    baseText: post.baseText,
    status: post.status,
    targets,
    mediaIds: mediaRows.map(row => row.mediaId),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
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
  const { sourceLibraryItemId, sourceLibraryUpdatedAt, requireFreeSlot } = createPostSourceSchema.parse(options);
  const postId = randomUUID();
  const creationKey = options.creationKey === undefined ? null : creationKeySchema.parse(options.creationKey);
  const inputHash = creationKey ? creationInputHash(input, sourceLibraryItemId, { sourceLibraryUpdatedAt, requireFreeSlot }) : null;
  const db = getDb();

  const result = await db.transaction(async tx => {
    await lockOwnerSchedule(tx, userId);
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
    if (sourceLibraryItemId) {
      const [source] = await tx.select().from(libraryItems)
        .where(and(eq(libraryItems.id, sourceLibraryItemId), eq(libraryItems.userId, userId))).limit(1).for('update');
      // The key may have been bound to another Post while this source lock waited.
      if (creationKey) {
        const existing = await readExisting();
        if (existing) return { postId: existing.id, changes: [] as PublicationQueueChange[], created: false };
      }
      if (!source) {
        if (sourceLibraryUpdatedAt !== undefined) throw new LibrarySourceStaleError();
        throw new Error('Library item not found');
      }
      const [linked] = await tx.select({ id: posts.id }).from(posts)
        .where(and(eq(posts.sourceLibraryItemId, sourceLibraryItemId), eq(posts.userId, userId))).limit(1);
      // Returning a USED source is a lookup: preserve the canonical key/hash and
      // leave any fresh key unreserved, as decided by the owner.
      if (linked) return { postId: linked.id, changes: [] as PublicationQueueChange[], created: false };
      if (sourceLibraryUpdatedAt !== undefined && source.updatedAt.getTime() !== Date.parse(sourceLibraryUpdatedAt)) throw new LibrarySourceStaleError();
      if (source.status === 'ARCHIVED') throw new LibrarySourceConflictError('Archived library item cannot create a Post');
      if (source.status === 'USED') throw new LibrarySourceConflictError('Used library item cannot create another Post');
    }
    const schedules = input.targets.map(target => target.scheduledAt);
    if (requireFreeSlot && (input.status !== 'READY' || !schedules.length || schedules.some(value => value === null)
      || new Set(schedules.map(value => value === null ? null : Date.parse(value))).size !== 1)) {
      throw new ZodError([{ code: 'custom', path: ['targets'], message: 'Free-slot approval requires READY with identical nonnull target times' }]);
    }
    if (requireFreeSlot || (sourceLibraryUpdatedAt !== undefined && schedules.some(value => value !== null))) {
      await requirePlannerAccounts(tx, userId, input.targets.map(target => target.provider));
      if (schedules.some(value => value !== null && Date.parse(value) <= Date.now())) throw new PlannerSlotConflictError();
    }
    if (requireFreeSlot) {
      const occupied = await occupiedSlotMinutes(tx, userId, { providers: input.targets.map(target => target.provider) });
      if (occupied.has(slotMinuteKey(schedules[0]!))) throw new PlannerSlotConflictError();
    }
    const accounts = await validatePostRelations(tx, userId, input);
    const now = new Date();
    const inserted = await tx.insert(posts).values({
      id: postId,
      userId,
      title: input.title ?? null,
      baseText: input.baseText,
      status: input.status,
      creationKey,
      creationInputHash: inputHash,
      sourceLibraryItemId: sourceLibraryItemId ?? null,
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

    const changes = await reconcilePostPublicationsInTx(tx, userId, postId);
    if (sourceLibraryItemId) {
      await tx.update(libraryItems).set({ status: 'USED', updatedAt: now })
        .where(and(eq(libraryItems.id, sourceLibraryItemId), eq(libraryItems.userId, userId)));
    }
    return { postId, changes, created: true };
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

  const result = await db.transaction(async tx => {
    await lockOwnerSchedule(tx, userId);
    const [owned] = await tx.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1).for('update');
    if (!owned) throw new Error('Post not found');
    // Lock every publication before changing shared content. The processor claim
    // UPDATE uses these same rows, so the post cannot change after a claim wins.
    const history = await tx.select().from(publications)
      .where(and(eq(publications.postId, postId), eq(publications.userId, userId)))
      .orderBy(asc(publications.id)).for('update');
    const existingTargets = await tx.select({ target: postTargets, provider: socialAccounts.provider })
      .from(postTargets).innerJoin(socialAccounts, eq(postTargets.socialAccountId, socialAccounts.id))
      .where(and(eq(postTargets.postId, postId), eq(socialAccounts.userId, userId)));
    const existingMedia = await tx.select({ mediaId: postMedia.mediaId }).from(postMedia)
      .where(eq(postMedia.postId, postId)).orderBy(asc(postMedia.position));
    const current: SavePostInput = { title: owned.title, baseText: owned.baseText, status: owned.status,
      targets: existingTargets.filter(({ target }) => target.active).map(({ target, provider }) => ({
        provider: fromDbProvider(provider), textOverride: target.textOverride,
        scheduledAt: target.scheduledAt?.toISOString() ?? null,
      })), mediaIds: existingMedia.map(row => row.mediaId) };
    if (samePostInput(input, current)) return { changed: false, changes: [] as PublicationQueueChange[] };
    const blockedReason = postEditBlockedReason(history);
    if (blockedReason) throw new PostEditConflictError(blockedReason);
    const accounts = await validatePostRelations(tx, userId, input);
    await tx.update(posts)
      .set({
        title: input.title ?? null,
        baseText: input.baseText,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

    const now = new Date();
    const desiredByAccount = new Map(input.targets.map(target => [
      accounts.get(toDbProvider(target.provider))!,
      target,
    ]));

    for (const { target: existing } of existingTargets) {
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

    return { changed: true, changes: await reconcilePostPublicationsInTx(tx, userId, postId) };
  });

  if (result.changed) await mirrorQueueBestEffort(result.changes, options);
  return readOwnedPost(userId, postId);
}

export async function deletePost(userId: string, postId: string): Promise<void> {
  const db = getDb();
  const rows = await db.delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .returning({ id: posts.id });
  if (!rows.length) throw new Error('Post not found');
}

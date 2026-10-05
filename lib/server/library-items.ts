import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.ts';
import { libraryItemMedia, libraryItems, mediaAssets, posts } from '../../db/schema.ts';
import {
  createLibraryItemInputSchema,
  archiveLibraryItemInputSchema,
  updateLibraryItemInputSchema,
  type CreateLibraryItemInput,
  type LibraryItemDto,
  type UpdateLibraryItemInput,
} from '../contracts/library.ts';
import { LibrarySourceStaleError } from './planner-slots.ts';
import { LibrarySourceConflictError } from './library-conversion-error.ts';

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

async function readOwnedLibraryItem(userId: string, id: string): Promise<LibraryItemDto> {
  const db = getDb();
  const [item] = await db.select().from(libraryItems)
    .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId))).limit(1);
  if (!item) throw new Error('Library item not found');
  const media = await db.select({ mediaId: libraryItemMedia.mediaId }).from(libraryItemMedia)
    .innerJoin(mediaAssets, eq(libraryItemMedia.mediaId, mediaAssets.id))
    .where(and(eq(libraryItemMedia.libraryItemId, id), eq(mediaAssets.userId, userId)))
    .orderBy(asc(libraryItemMedia.position));
  const [sourcePost] = await db.select({ id: posts.id }).from(posts)
    .where(and(eq(posts.sourceLibraryItemId, id), eq(posts.userId, userId))).limit(1);
  return {
    id: item.id,
    title: item.title,
    text: item.bodyText,
    status: item.status,
    mediaIds: media.map(row => row.mediaId),
    sourcePostId: sourcePost?.id ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function validateMedia(tx: Transaction, userId: string, mediaIds: string[]): Promise<void> {
  if (!mediaIds.length) return;
  const rows = await tx.select({ id: mediaAssets.id }).from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.id, mediaIds)));
  if (rows.length !== mediaIds.length) throw new Error('Media not found for owner');
}

export async function listLibraryItems(userId: string): Promise<LibraryItemDto[]> {
  const rows = await getDb().select({ id: libraryItems.id }).from(libraryItems)
    .where(eq(libraryItems.userId, userId))
    .orderBy(desc(libraryItems.updatedAt), desc(libraryItems.id));
  return Promise.all(rows.map(row => readOwnedLibraryItem(userId, row.id)));
}

export async function createLibraryItem(userId: string, raw: CreateLibraryItemInput): Promise<LibraryItemDto> {
  const input = createLibraryItemInputSchema.parse(raw);
  const id = randomUUID();
  await getDb().transaction(async tx => {
    await validateMedia(tx, userId, input.mediaIds);
    const now = new Date();
    await tx.insert(libraryItems).values({
      id, userId, title: input.title ?? null, bodyText: input.text, status: 'READY', createdAt: now, updatedAt: now,
    });
    if (input.mediaIds.length) {
      await tx.insert(libraryItemMedia).values(input.mediaIds.map((mediaId, position) => ({ libraryItemId: id, mediaId, position })));
    }
  });
  return readOwnedLibraryItem(userId, id);
}

export async function updateLibraryItem(userId: string, id: string, raw: UpdateLibraryItemInput): Promise<LibraryItemDto> {
  const input = updateLibraryItemInputSchema.parse(raw);
  await getDb().transaction(async tx => {
    // Future source-Post creation must serialize on this same Library row.
    const [owned] = await tx.select().from(libraryItems)
      .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId))).limit(1).for('update');
    if (!owned) throw new Error('Library item not found');
    await validateMedia(tx, userId, input.mediaIds);
    await tx.update(libraryItems).set({
      title: input.title ?? null,
      bodyText: input.text,
      status: owned.status === 'USED' ? 'USED' : input.status,
      // updatedAt is the queue's revision token; even same-millisecond edits
      // must invalidate a displayed copy while holding the source row lock.
      updatedAt: new Date(Math.max(Date.now(), owned.updatedAt.getTime() + 1)),
    }).where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId)));
    await tx.delete(libraryItemMedia).where(eq(libraryItemMedia.libraryItemId, id));
    if (input.mediaIds.length) {
      await tx.insert(libraryItemMedia).values(input.mediaIds.map((mediaId, position) => ({ libraryItemId: id, mediaId, position })));
    }
  });
  return readOwnedLibraryItem(userId, id);
}

export async function deleteLibraryItem(userId: string, id: string): Promise<void> {
  await getDb().transaction(async tx => {
    const [owned] = await tx.select({ id: libraryItems.id }).from(libraryItems)
      .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId))).limit(1).for('update');
    if (!owned) throw new Error('Library item not found');
    await tx.delete(libraryItems).where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId)));
  });
}

export async function archiveLibraryItem(userId: string, id: string, expectedUpdatedAt: string): Promise<LibraryItemDto> {
  const input = archiveLibraryItemInputSchema.parse({ status: 'ARCHIVED', expectedUpdatedAt });
  await getDb().transaction(async tx => {
    const [owned] = await tx.select().from(libraryItems)
      .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId))).limit(1).for('update');
    if (!owned || owned.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt)) throw new LibrarySourceStaleError();
    if (owned.status !== 'READY') throw new LibrarySourceConflictError('Only READY library items can be rejected');
    const [linked] = await tx.select({ id: posts.id }).from(posts)
      .where(and(eq(posts.sourceLibraryItemId, id), eq(posts.userId, userId))).limit(1);
    if (linked) throw new LibrarySourceConflictError('Used library item cannot be rejected');
    await tx.update(libraryItems).set({ status: 'ARCHIVED', updatedAt: new Date(Math.max(Date.now(), owned.updatedAt.getTime() + 1)) })
      .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId)));
  });
  return readOwnedLibraryItem(userId, id);
}

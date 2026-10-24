import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { libraryItemMedia, mediaAssets, mediaUploadIntents, postMedia, users } from '../../db/schema.ts';
import type { MediaAssetDto } from '../contracts/planner.ts';
import { validateMediaUpload, type ValidatedMedia } from './media-validation.ts';
import { getObjectStorage, type ObjectStorage } from './storage.ts';

import { requireManualWrite } from './auth/manual-access.ts';
export type MediaWithPreview = MediaAssetDto & { previewUrl: string };

function toDto(row: typeof mediaAssets.$inferSelect): MediaAssetDto {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMediaAssets(userId: string): Promise<MediaAssetDto[]> {
  const rows = await getDb().select().from(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .orderBy(asc(mediaAssets.createdAt));
  return rows.map(toDto);
}

export async function listMediaAssetsWithPreview(
  userId: string,
  storage?: ObjectStorage,
): Promise<MediaWithPreview[]> {
  const rows = await getDb().select().from(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .orderBy(asc(mediaAssets.createdAt));
  if (!rows.length) return [];
  const objectStorage = storage ?? getObjectStorage();
  return Promise.all(rows.map(async row => ({
    ...toDto(row),
    previewUrl: await objectStorage.signedGetUrl(row.storageKey, 300),
  })));
}

function ownerPrefix(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}
function newStorageKey(userId: string, extension: string) {
  return `users/${ownerPrefix(userId)}/${randomUUID()}.${extension}`;
}

export async function putMediaObject(
  input: { userId: string; media: ValidatedMedia },
  storage: ObjectStorage = getObjectStorage(),
): Promise<{ key: string }> {
  const key = newStorageKey(input.userId, input.media.extension);
  await storage.put(key, input.media.bytes, input.media.mimeType);
  return { key };
}

export async function createMediaAsset(
  userId: string,
  file: File,
  storage: ObjectStorage = getObjectStorage(),
): Promise<MediaAssetDto> {
  const media = await validateMediaUpload(file);
  const id = randomUUID();
  const key = newStorageKey(userId, media.extension);
  await getDb().transaction(async tx => {
    await requireManualWrite(tx, userId);
    await tx.insert(mediaUploadIntents).values({ id, userId, storageKey: key });
  });
  // A thrown/unknown PUT leaves its intent held. Never blindly retry or clear it.
  await storage.put(key, media.bytes, media.mimeType);
  try {
    const row = await getDb().transaction(async tx => {
      await requireManualWrite(tx, userId);
      const [saved] = await tx.insert(mediaAssets).values({
      id,
      userId,
      storageKey: key,
      originalName: file.name.slice(0, 255) || 'upload',
      mimeType: media.mimeType,
      byteSize: media.byteSize,
      checksum: media.checksum,
      width: media.width,
      height: media.height,
      source: 'UPLOAD',
      }).returning();
      await tx.delete(mediaUploadIntents).where(eq(mediaUploadIntents.id, id));
      return saved;
    });
    return toDto(row);
  } catch (error) {
    // A rejected COMMIT can have committed successfully. Read back before any
    // destructive compensation; failure to establish the outcome stays HOLD.
    let recovery: { saved: typeof mediaAssets.$inferSelect | null; cleanup: boolean };
    try {
      recovery = await getDb().transaction(async tx => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        const [saved] = await tx.select().from(mediaAssets).where(eq(mediaAssets.storageKey, key)).for('update');
        if (saved) return { saved: saved.id === id && saved.userId === userId ? saved : null, cleanup: false };
        const [intent] = await tx.select().from(mediaUploadIntents).where(and(eq(mediaUploadIntents.id, id), eq(mediaUploadIntents.userId, userId), eq(mediaUploadIntents.storageKey, key))).for('update');
        if (!intent) return { saved: null, cleanup: false };
        await tx.update(mediaUploadIntents).set({ cleanupReady: true }).where(eq(mediaUploadIntents.id, id));
        return { saved: null, cleanup: true };
      });
    } catch { throw error; }
    if (recovery.saved) return toDto(recovery.saved);
    if (!recovery.cleanup) throw error;
    try {
      await storage.delete(key);
      await getDb().delete(mediaUploadIntents).where(eq(mediaUploadIntents.id, id));
    } catch {
      console.warn('Media upload compensation pending');
    }
    throw error;
  }
}

export async function processPendingMediaCleanup(storage?: ObjectStorage): Promise<number> {
  const pending = await getDb().select().from(mediaUploadIntents).where(eq(mediaUploadIntents.cleanupReady, true)).limit(20);
  let completed = 0;
  for (const item of pending) {
    try {
      await (storage ?? getObjectStorage()).delete(item.storageKey);
      await getDb().delete(mediaUploadIntents).where(and(eq(mediaUploadIntents.id, item.id), eq(mediaUploadIntents.cleanupReady, true)));
      completed++;
    } catch { console.warn('Media upload compensation pending'); }
  }
  return completed;
}

export async function deleteMediaAsset(
  userId: string,
  mediaId: string,
  storage: ObjectStorage = getObjectStorage(),
): Promise<void> {
  const db = getDb();
  const row = await db.transaction(async tx => {
    // FK attachment inserts lock this asset too. Check references only after
    // acquiring the lock so a concurrent attachment cannot be cascaded away.
    const [owned] = await tx.select().from(mediaAssets)
      .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.userId, userId)))
      .limit(1).for('update');
    if (!owned) throw new Error('Media not found');
    const [postAttachment] = await tx.select({ mediaId: postMedia.mediaId }).from(postMedia)
      .where(eq(postMedia.mediaId, mediaId)).limit(1);
    const [libraryAttachment] = await tx.select({ mediaId: libraryItemMedia.mediaId }).from(libraryItemMedia)
      .where(eq(libraryItemMedia.mediaId, mediaId)).limit(1);
    if (postAttachment || libraryAttachment) throw new Error('Media is attached to content');
    await tx.delete(mediaAssets).where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.userId, userId)));
    return owned;
  });
  try {
    await storage.delete(row.storageKey);
  } catch (error) {
    console.error('Orphaned media object after database deletion', error instanceof Error ? error.message : 'unknown error');
  }
}

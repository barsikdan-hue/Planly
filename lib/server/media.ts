import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { libraryItemMedia, mediaAssets, postMedia } from '../../db/schema.ts';
import type { MediaAssetDto } from '../contracts/planner.ts';
import { validateMediaUpload, type ValidatedMedia } from './media-validation.ts';
import { getObjectStorage, type ObjectStorage } from './storage.ts';

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

export async function putMediaObject(
  input: { userId: string; media: ValidatedMedia },
  storage: ObjectStorage = getObjectStorage(),
): Promise<{ key: string }> {
  const key = `users/${ownerPrefix(input.userId)}/${randomUUID()}.${input.media.extension}`;
  await storage.put(key, input.media.bytes, input.media.mimeType);
  return { key };
}

export async function createMediaAsset(
  userId: string,
  file: File,
  storage: ObjectStorage = getObjectStorage(),
): Promise<MediaAssetDto> {
  const media = await validateMediaUpload(file);
  const { key } = await putMediaObject({ userId, media }, storage);
  const id = randomUUID();
  try {
    const [row] = await getDb().insert(mediaAssets).values({
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
    return toDto(row);
  } catch (error) {
    try { await storage.delete(key); } catch (cleanupError) {
      console.error('Failed to compensate media object upload', cleanupError instanceof Error ? cleanupError.message : 'unknown error');
    }
    throw error;
  }
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

import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { mediaAssets } from '../../db/schema.ts';
import type { MediaAssetDto } from '../contracts/planner.ts';

export async function listMediaAssets(userId: string): Promise<MediaAssetDto[]> {
  const rows = await getDb().select().from(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .orderBy(asc(mediaAssets.createdAt));
  return rows.map(row => ({
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  }));
}

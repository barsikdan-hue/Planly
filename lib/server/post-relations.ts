import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { mediaAssets, socialAccounts } from '../../db/schema.ts';
import { toDbProvider, type SavePostInput } from '../contracts/planner.ts';
import { PublicationContentError, validatePublicationContent, type PublicationMediaMetadata } from '../publication-content.ts';

export async function validatePostRelations(
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


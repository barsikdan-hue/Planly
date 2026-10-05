import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts } from '../../../db/schema.ts';
import { resolveConnector as resolveRegisteredConnector } from '../connectors/registry.ts';
import { readMediaObjectBytes } from '../storage.ts';
import type { ConnectorResolver, PublicationErrorType, PublishInput } from '../connectors/types.ts';

export type ProcessPublicationResult = {
  status: 'SCHEDULED' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED' | 'REQUIRES_RECONNECT';
  skipped?: boolean;
  errorType?: PublicationErrorType;
  retryAfterMs?: number;
};

async function readPublication(publicationId: string) {
  const [row] = await getDb().select({
    publication: publications,
    target: postTargets,
    account: socialAccounts,
    post: posts,
  }).from(publications)
    .innerJoin(postTargets, eq(publications.postTargetId, postTargets.id))
    .innerJoin(socialAccounts, eq(postTargets.socialAccountId, socialAccounts.id))
    .innerJoin(posts, eq(publications.postId, posts.id))
    .where(eq(publications.id, publicationId))
    .limit(1);
  if (!row) throw new Error('Publication not found');
  return row;
}

async function markFailure(
  publicationId: string,
  errorType: PublicationErrorType,
  code: string | null,
  message: string,
  retryAfterMs?: number,
): Promise<ProcessPublicationResult> {
  const status = errorType === 'AUTH' ? 'REQUIRES_RECONNECT' : 'FAILED';
  await getDb().update(publications).set({
    status,
    normalizedErrorType: errorType,
    providerErrorCode: code,
    providerErrorMessage: message,
    nextRetryAt: null,
    updatedAt: new Date(),
  }).where(eq(publications.id, publicationId));
  if (errorType === 'AUTH') {
    const row = await readPublication(publicationId);
    await getDb().update(socialAccounts).set({connectionStatus:'ERROR',updatedAt:new Date()}).where(eq(socialAccounts.id,row.account.id));
  }
  return { status, errorType, retryAfterMs };
}

export async function processPublication(
  publicationId: string,
  resolveConnector: ConnectorResolver = resolveRegisteredConnector,
): Promise<ProcessPublicationResult> {
  const initial = await readPublication(publicationId);

  if (initial.publication.status === 'PUBLISHED') {
    return { status: 'PUBLISHED', skipped: true };
  }
  if (initial.publication.status === 'CANCELLED' || initial.publication.status === 'FAILED' || initial.publication.status === 'REQUIRES_RECONNECT') {
    return { status: initial.publication.status, skipped: true };
  }
  if (initial.publication.status === 'PUBLISHING') {
    return markFailure(
      publicationId,
      'PERMANENT',
      'AMBIGUOUS_DELIVERY',
      'Previous delivery outcome is unknown; refusing a blind retry.',
    );
  }

  const now = new Date();
  const [claimed] = await getDb().update(publications).set({
    status: 'PUBLISHING',
    attemptCount: sql`${publications.attemptCount} + 1`,
    lastAttemptAt: now,
    normalizedErrorType: null,
    providerErrorCode: null,
    providerErrorMessage: null,
    updatedAt: now,
  }).where(and(
    eq(publications.id, publicationId),
    inArray(publications.status, ['SCHEDULED', 'QUEUED']),
  )).returning({ id: publications.id });

  if (!claimed) {
    const latest = await readPublication(publicationId);
    return { status: latest.publication.status, skipped: true };
  }

  const row = await readPublication(publicationId);
  // Historical/queued rows may outlive a change back to a draft or archive.
  // Re-read after the claim; edit locking now prevents the post changing
  // between this check and provider handoff.
  if (row.post.status !== 'READY') {
    await getDb().update(publications).set({ status: 'CANCELLED', nextRetryAt: null, updatedAt: new Date() })
      .where(eq(publications.id, publicationId));
    return { status: 'CANCELLED', skipped: true };
  }
  const text = row.target.textOverride ?? row.post.baseText;
  const input: PublishInput = {
    publicationId,
    provider: row.publication.provider,
    destinationId: row.account.providerAccountId,
    text,
  };

  let handedOff = false;
  try {
    if (resolveConnector === resolveRegisteredConnector && ((row.publication.provider === 'TELEGRAM' && process.env.TELEGRAM_BOT_TOKEN) || (row.publication.provider === 'MAX' && process.env.MAX_BOT_TOKEN)) &&
      (!row.account.enabled || row.account.connectionStatus !== 'CONNECTED')) {
      return markFailure(publicationId,'AUTH',`${row.publication.provider}_DISCONNECTED`,'Reconnect and enable the destination before publishing.');
    }
    // Only implemented providers prepare media; an unconfigured MAX remains an honest unsupported result.
    if (row.publication.provider === 'TELEGRAM' || (row.publication.provider === 'MAX' && (process.env.MAX_BOT_TOKEN || resolveConnector !== resolveRegisteredConnector))) {
      const mediaRows = await getDb().select({asset:mediaAssets}).from(postMedia)
        .innerJoin(mediaAssets,eq(postMedia.mediaId,mediaAssets.id))
        .where(and(eq(postMedia.postId,row.post.id),eq(mediaAssets.userId,row.publication.userId)))
        .orderBy(asc(postMedia.position));
      const media: NonNullable<PublishInput['media']> = [];
      for (const {asset} of mediaRows) media.push({name:asset.originalName,mimeType:asset.mimeType,
        bytes:await readMediaObjectBytes(asset.storageKey,asset.byteSize),width:asset.width,height:asset.height});
      input.media = media;
    }
    const connector = resolveConnector(row.publication.provider);
    if (connector.provider !== row.publication.provider) {
      return markFailure(publicationId, 'PERMANENT', 'CONNECTOR_PROVIDER_MISMATCH', 'Connector provider mismatch.');
    }

    handedOff = true;
    const result = await connector.publish(input);
    if (!result.ok) {
      return markFailure(publicationId, result.errorType, result.code ?? null, result.message, result.retryAfterMs);
    }

    if (!result.remoteId.trim()) {
      return markFailure(publicationId, 'PERMANENT', 'MISSING_REMOTE_ID', 'Provider reported success without a remote ID.');
    }

    await getDb().update(publications).set({
      status: 'PUBLISHED',
      publishedAt: new Date(),
      providerRemoteId: result.remoteId,
      providerUrl: result.remoteUrl ?? null,
      nextRetryAt: null,
      normalizedErrorType: null,
      providerErrorCode: null,
      providerErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(publications.id, publicationId));
    return { status: 'PUBLISHED' };
  } catch {
    return markFailure(
      publicationId,
      handedOff ? 'PERMANENT' : 'TEMPORARY',
      handedOff ? 'AMBIGUOUS_DELIVERY' : 'MEDIA_PREPARATION_FAILED',
      handedOff ? 'Provider delivery outcome is unknown. Check the channel before sending again.' : 'Private media could not be prepared for publication.',
    );
  }
}

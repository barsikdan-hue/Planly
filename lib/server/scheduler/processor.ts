import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { mediaAssets, postMedia, posts, postTargets, publications, socialAccounts } from '../../../db/schema.ts';
import { resolveConnector as resolveRegisteredConnector } from '../connectors/registry.ts';
import { readMediaObjectBytes } from '../storage.ts';
import { hasOwnerProviderAccess } from '../auth/access.ts';
import type { ConnectorResolver, PublicationErrorType, PublishInput } from '../connectors/types.ts';

export type ProcessPublicationResult = {
  status: 'SCHEDULED' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED' | 'REQUIRES_RECONNECT';
  skipped?: boolean;
  errorType?: PublicationErrorType;
  retryAfterMs?: number;
};

type PublicationDb = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

async function readPublication(publicationId: string, db: PublicationDb = getDb()) {
  const [row] = await db.select({
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

async function readScopedMedia(row: Awaited<ReturnType<typeof readPublication>>, db: PublicationDb = getDb()) {
  const { publication, post, target, account } = row;
  if (publication.userId !== post.userId || publication.userId !== account.userId ||
      target.postId !== post.id || publication.provider !== account.provider) return null;
  // Do not filter foreign attachments away: the whole send must fail closed.
  const attached = await db.select({ asset: mediaAssets }).from(postMedia)
    .leftJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
    .where(eq(postMedia.postId, post.id)).orderBy(asc(postMedia.position));
  if (attached.some(({ asset }) => !asset || asset.userId !== publication.userId)) return null;
  return attached.map(({ asset }) => asset!);
}

async function markScopeFailure(
  publicationId: string,
  claimedAttempt?: number,
): Promise<ProcessPublicationResult> {
  if (claimedAttempt === undefined) {
    return getDb().transaction(async tx => {
      // Ordinary Post edits hold this row through attachment replacement.
      // Re-read the graph under the lock, rather than diagnosing stale media.
      await tx.select({ id: publications.id }).from(publications)
        .where(eq(publications.id, publicationId)).for('update');
      const current = await readPublication(publicationId, tx);
      if (!['SCHEDULED', 'QUEUED'].includes(current.publication.status) || await readScopedMedia(current, tx) !== null) {
        return { status: current.publication.status, skipped: true };
      }
      await tx.update(publications).set({
        status: 'FAILED', normalizedErrorType: 'PERMANENT',
        providerErrorCode: 'PUBLICATION_SCOPE_MISMATCH',
        providerErrorMessage: 'Publication relationships do not belong to one workspace.',
        nextRetryAt: null, updatedAt: new Date(),
      }).where(eq(publications.id, publicationId));
      return { status: 'FAILED', errorType: 'PERMANENT' };
    });
  }
  // Only diagnose our freshly acquired claim. Preserve a competing outcome.
  const [failed] = await getDb().update(publications).set({
    status: 'FAILED', normalizedErrorType: 'PERMANENT',
    providerErrorCode: 'PUBLICATION_SCOPE_MISMATCH',
    providerErrorMessage: 'Publication relationships do not belong to one workspace.',
    nextRetryAt: null, updatedAt: new Date(),
  }).where(and(eq(publications.id, publicationId),
    eq(publications.status, 'PUBLISHING'), eq(publications.attemptCount, claimedAttempt),
  )).returning({ id: publications.id });
  if (failed) return { status: 'FAILED', errorType: 'PERMANENT' };
  const latest = await readPublication(publicationId);
  return { status: latest.publication.status, skipped: true };
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

  if (await readScopedMedia(initial) === null) return markScopeFailure(publicationId);

  // P02 has no personal credential enrollment yet. Gate the real transport
  // before claim/media/connector resolution; injected test transports stay pure.
  if(resolveConnector===resolveRegisteredConnector && !await hasOwnerProviderAccess(initial.publication.userId)) {
    await getDb().update(publications).set({status:'REQUIRES_RECONNECT',normalizedErrorType:'AUTH',providerErrorCode:'PERSONAL_PROVIDER_SETUP_REQUIRED',providerErrorMessage:'Personal provider setup is required.',nextRetryAt:null,updatedAt:new Date()})
      .where(and(eq(publications.id,publicationId),inArray(publications.status,['SCHEDULED','QUEUED'])));
    const latest=await readPublication(publicationId);
    return {status:latest.publication.status,skipped:true};
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
  )).returning({ id: publications.id, attemptCount: publications.attemptCount });

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
    socialAccountId: row.account.id,
    provider: row.publication.provider,
    destinationId: row.account.providerAccountId,
    text,
  };

  let handedOff = false;
  try {
    const scopedMedia = await readScopedMedia(row);
    if (scopedMedia === null) return await markScopeFailure(publicationId, claimed.attemptCount);
    if (row.publication.provider === 'VK' && (!row.account.enabled || row.account.connectionStatus !== 'CONNECTED')) {
      return markFailure(publicationId, 'AUTH', 'VK_DISCONNECTED', 'Reconnect and enable the VK community before publishing.');
    }
    if (resolveConnector === resolveRegisteredConnector && ((row.publication.provider === 'TELEGRAM' && process.env.TELEGRAM_BOT_TOKEN) || (row.publication.provider === 'MAX' && process.env.MAX_BOT_TOKEN)) &&
      (!row.account.enabled || row.account.connectionStatus !== 'CONNECTED')) {
      return markFailure(publicationId,'AUTH',`${row.publication.provider}_DISCONNECTED`,'Reconnect and enable the destination before publishing.');
    }
    // Only implemented providers prepare media; an unconfigured MAX remains an honest unsupported result.
    if (row.publication.provider === 'VK' || row.publication.provider === 'TELEGRAM' || (row.publication.provider === 'MAX' && (process.env.MAX_BOT_TOKEN || resolveConnector !== resolveRegisteredConnector))) {
      const media: NonNullable<PublishInput['media']> = [];
      for (const asset of scopedMedia) media.push({name:asset.originalName,mimeType:asset.mimeType,
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
      ...((row.publication.provider === 'TELEGRAM' || row.publication.provider === 'MAX') && input.destinationId && /^-?[1-9]\d{0,15}$/.test(input.destinationId) && Number.isSafeInteger(Number(input.destinationId)) ? {analyticsDestinationId:input.destinationId} : {}),
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

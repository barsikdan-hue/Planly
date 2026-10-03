import type { SavePostInput } from '../contracts/planner.ts';

type PublicationHistory = { status: string; providerErrorCode?: string | null };

export function postEditBlockedReason(history: readonly PublicationHistory[]): string | null {
  return history.some(row => row.status === 'PUBLISHED' || row.status === 'PUBLISHING' ||
    row.status === 'REQUIRES_RECONNECT' || (row.status === 'FAILED' && row.providerErrorCode === 'AMBIGUOUS_DELIVERY'))
    ? 'Этот пост уже опубликован, отправляется или требует проверки результата. Для нового текста создай копию в черновиках.'
    : null;
}

export class PostEditConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'PostEditConflictError'; }
}

export function samePostInput(left: SavePostInput, right: SavePostInput): boolean {
  const canonical = (input: SavePostInput) => JSON.stringify({
    title: input.title ?? null, baseText: input.baseText, status: input.status,
    targets: input.targets.map(target => ({ provider: target.provider, textOverride: target.textOverride,
      scheduledAt: target.scheduledAt ? new Date(target.scheduledAt).toISOString() : null,
    })).sort((a, b) => a.provider.localeCompare(b.provider)),
    mediaIds: input.mediaIds,
  });
  return canonical(left) === canonical(right);
}

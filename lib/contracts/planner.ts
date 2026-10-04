import { z } from 'zod';

export const providerSchema = z.enum(['telegram', 'max']);
export type Provider = z.infer<typeof providerSchema>;

export const postStatusSchema = z.enum(['DRAFT', 'READY', 'ARCHIVED']);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const savePostInputSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  baseText: z.string().trim().max(20_000),
  status: postStatusSchema,
  targets: z.array(z.object({
    provider: providerSchema,
    textOverride: z.string().max(20_000).nullable().default(null),
    scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  })).max(2).refine(
    targets => new Set(targets.map(target => target.provider)).size === targets.length,
    'Duplicate provider target',
  ),
  mediaIds: z.array(z.string().min(1)).max(20).refine(
    ids => new Set(ids).size === ids.length,
    'Duplicate media id',
  ),
}).refine(input => input.baseText.length > 0 || input.mediaIds.length > 0 || input.targets.some(target => !!target.textOverride?.trim()), {
  message: 'Add text or media to the post',
  path: ['baseText'],
});
export type SavePostInput = z.infer<typeof savePostInputSchema>;

export const createPostSourceSchema = z.object({
  sourceLibraryItemId: z.string().min(1).max(200).optional(),
  sourceLibraryUpdatedAt: z.string().datetime({ offset: true }).optional(),
  requireFreeSlot: z.boolean().optional(),
}).refine(input => (!input.requireFreeSlot && input.sourceLibraryUpdatedAt === undefined) || !!input.sourceLibraryItemId, {
  message: 'Planner approval requires a library source', path: ['sourceLibraryItemId'],
});

export type PublicationDto = {
  status: 'SCHEDULED' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED' | 'REQUIRES_RECONNECT';
  remoteId: string | null;
  remoteUrl: string | null;
  error: string | null;
};

export type PostTargetDto = {
  id: string;
  socialAccountId: string;
  publication?: PublicationDto | null;
  provider: Provider;
  textOverride: string | null;
  scheduledAt: string | null;
};

export type PostDto = {
  id: string;
  editBlockedReason?: string | null;
  title: string | null;
  baseText: string;
  status: PostStatus;
  targets: PostTargetDto[];
  mediaIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MediaAssetDto = {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  source: 'UPLOAD' | 'AI_GENERATED';
  createdAt: string;
};

export type SocialConnectionStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';
export type SocialAccountDto = {
  id: string;
  provider: Provider;
  providerAccountId: string | null;
  displayName: string;
  enabled: boolean;
  connectionStatus: SocialConnectionStatus;
};

export const updateProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ProfileDto = { id: string; email: string; displayName: string };

export function toDbProvider(provider: Provider): 'TELEGRAM' | 'MAX' {
  return provider === 'telegram' ? 'TELEGRAM' : 'MAX';
}

export function fromDbProvider(provider: 'TELEGRAM' | 'MAX'): Provider {
  return provider === 'TELEGRAM' ? 'telegram' : 'max';
}

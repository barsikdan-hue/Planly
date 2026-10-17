import { z } from 'zod';

export const providerSchema = z.enum(['telegram', 'max', 'vk']);
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
  })).max(3).refine(
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
export const swipeReviewSchema = z.object({ inputMethod: z.enum(['button','gesture','keyboard']) }).strict();
export type SwipeReview = z.infer<typeof swipeReviewSchema>;

export const createPostSourceSchema = z.object({
  sourceLibraryItemId: z.string().min(1).max(200).optional(),
  sourceLibraryUpdatedAt: z.string().datetime({ offset: true }).optional(),
  requireFreeSlot: z.boolean().optional(),
  swipeReview: swipeReviewSchema.optional(),
}).refine(input => (!input.requireFreeSlot && input.sourceLibraryUpdatedAt === undefined) || !!input.sourceLibraryItemId, {
  message: 'Planner approval requires a library source', path: ['sourceLibraryItemId'],
}).refine(input => !input.swipeReview || !!input.sourceLibraryItemId && input.sourceLibraryUpdatedAt !== undefined && input.requireFreeSlot === true, {
  message: 'Swipe approval requires source revision and a free slot', path: ['swipeReview'],
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
  approvalCancelledAt?: string | null;
  cancelApproval?: CancelApprovalDto;
};

export const cancelApprovalInputSchema = z.object({
  expectedPublicationId: z.string().min(1).max(128),
  expectedPublicationUpdatedAt: z.string().datetime({offset:true}),
  expectedTargetUpdatedAt: z.string().datetime({offset:true}),
  expectedBindingRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
export type CancelApprovalInput = z.infer<typeof cancelApprovalInputSchema>;
export type CancelApprovalResult = {postId:string;targetId:string;publicationId:string;approvalCancelledAt:string;replayed:boolean};
export type CancelApprovalDto = {
  eligible:boolean;
  reason:'AVAILABLE'|'ALREADY_CANCELLED'|'UNSUPPORTED_HISTORY';
  expectedPublicationId:string|null;
  expectedPublicationUpdatedAt:string|null;
  expectedTargetUpdatedAt:string;
  expectedBindingRevision:number;
  historicalDestinationId:string|null;
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
export type SocialConnectionAction = 'begin' | 'enable' | 'pause' | 'release';
export type SocialConnectionMetadata = {
  mode: 'verified-user';
  ready: boolean;
  reason: 'SETUP_REQUIRED' | 'ACCESS_REQUIRED' | 'REVERIFY_REQUIRED' | null;
  state: 'unverified' | 'pending' | 'verified-disabled' | 'enabled' | 'stale';
  accountHint: string;
  bindingRevision: number;
  checkedAt: string | null;
  actions: SocialConnectionAction[];
};
export type SocialAccountDto = {
  id: string;
  provider: Provider;
  providerAccountId: string | null;
  displayName: string;
  enabled: boolean;
  connectionStatus: SocialConnectionStatus;
  connection?: SocialConnectionMetadata;
};

export function isSocialAccountUsable(account: SocialAccountDto): boolean {
  return account.enabled && account.connectionStatus === 'CONNECTED' &&
    (!account.connection || account.connection.state === 'enabled');
}

export const updateProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ProfileDto = { id: string; email: string; displayName: string };

export function toDbProvider(provider: Provider): 'TELEGRAM' | 'MAX' | 'VK' {
  return { telegram: 'TELEGRAM', max: 'MAX', vk: 'VK' }[provider] as 'TELEGRAM' | 'MAX' | 'VK';
}

export function fromDbProvider(provider: 'TELEGRAM' | 'MAX' | 'VK'): Provider {
  return { TELEGRAM: 'telegram', MAX: 'max', VK: 'vk' }[provider] as Provider;
}

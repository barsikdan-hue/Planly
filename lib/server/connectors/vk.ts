import type { PublicationErrorType, PublishInput, PublishResult, SocialConnector } from './types.ts';
import { validatePublicationContent } from '../../publication-content.ts';

type Failure = Extract<PublishResult, { ok: false }>;
type ApiResult = { ok: true; result: unknown } | Failure;
type Transport = { token: string; fetchImpl?: typeof fetch; apiVersion?: string };
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const failure = (errorType: PublicationErrorType, code: string, message: string): Failure => ({ ok: false, errorType, code, message });
const ambiguous = () => failure('PERMANENT', 'AMBIGUOUS_DELIVERY', 'VK delivery outcome is unknown. Check the community wall before sending again.');
const ambiguousPhotoSave = () => failure('PERMANENT', 'VK_PHOTO_SAVE_AMBIGUOUS', 'VK photo save outcome is unknown. Automatic photo save retry has been stopped.');
const unavailable = () => failure('TEMPORARY', 'VK_UNAVAILABLE', 'VK validation or photo preparation is temporarily unavailable.');
const validPositiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const validCommunity = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const validDestination = (value: unknown): value is string => typeof value === 'string' && value.startsWith('-') && validCommunity(value.slice(1));
const validToken = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/\s/.test(value);

// Only numeric, recognized API codes are reflected; provider messages/params never leave this module.
function apiFailure(code: unknown, mutation: boolean, unknownOutcome: () => Failure): Failure {
  if (typeof code !== 'number' || !Number.isSafeInteger(code)) return mutation ? unknownOutcome() : unavailable();
  if (code === 6 || code === 29) return { ...failure('TEMPORARY', `VK_${code}`, 'VK rate limit; retry later.'), retryAfterMs: 60_000 };
  if ([5, 7, 14, 15, 17, 20, 24, 25, 27, 28, 214, 704, 1117].includes(code)) return failure('AUTH', `VK_${code}`, 'VK credentials, community permissions or an account challenge require reconnecting.');
  if ([22, 100, 118, 121, 219, 220, 222, 224, 225].includes(code)) return failure('VALIDATION', `VK_${code}`, 'VK rejected the community, text or photo. Check the content and community settings.');
  if (code === 9) return failure('PERMANENT', 'VK_9', 'VK flood control rejected this publication. Review the community before trying again.');
  return mutation ? unknownOutcome() : unavailable();
}

function createApi(options: Transport) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiVersion = options.apiVersion ?? '5.199';
  return async (method: 'wall.post' | 'photos.getWallUploadServer' | 'photos.saveWallPhoto' | 'groups.getById', params: Record<string, string>, mutation = false): Promise<ApiResult> => {
    const unknownOutcome = method === 'photos.saveWallPhoto' ? ambiguousPhotoSave : ambiguous;
    if (!validToken(options.token)) return failure('AUTH', 'VK_RECONNECT_REQUIRED', 'Reconnect the VK account before publishing.');
    if (!/^5\.\d{1,3}$/.test(apiVersion)) return failure('PERMANENT', 'VK_API_VERSION', 'VK API version is not configured correctly on the server.');
    try {
      const body = new URLSearchParams({ ...params, access_token: options.token, v: apiVersion });
      const response = await fetchImpl(`https://api.vk.com/method/${method}`, {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
        signal: AbortSignal.timeout(30_000),
      });
      const payload = record(await response.json());
      if (payload?.error) return apiFailure(record(payload.error)?.error_code, mutation, unknownOutcome);
      if (response.ok && payload && Object.hasOwn(payload, 'response')) return { ok: true, result: payload.response };
      return mutation ? unknownOutcome() : unavailable();
    } catch {
      // Raw transport errors may contain credentials, request bodies or signed upload URLs.
      return mutation ? unknownOutcome() : unavailable();
    }
  };
}

export class VkCommunityValidationError extends Error {
  readonly code: string;
  readonly errorType: PublicationErrorType;
  constructor(result: Failure) {
    super(result.message);
    this.name = 'VkCommunityValidationError';
    this.code = result.code ?? 'VK_COMMUNITY';
    this.errorType = result.errorType;
  }
}

export async function validateVkCommunity(options: Transport & { communityId: string }): Promise<{ destinationId: string; displayName: string }> {
  if (!validCommunity(options.communityId)) throw new VkCommunityValidationError(failure('VALIDATION', 'VK_COMMUNITY', 'Use a positive numeric VK community ID.'));
  const result = await createApi(options)('groups.getById', { group_ids: options.communityId, fields: 'is_admin,admin_level' });
  if (!result.ok) throw new VkCommunityValidationError(result);
  const groups = record(result.result)?.groups;
  const group = Array.isArray(groups) && groups.length === 1 ? record(groups[0]) : null;
  if (!group || !validPositiveId(group.id) || String(group.id) !== options.communityId || !['group', 'page', 'event'].includes(String(group.type)) || group.deactivated !== undefined) {
    throw new VkCommunityValidationError(failure('VALIDATION', 'VK_COMMUNITY', 'VK did not confirm the selected active community.'));
  }
  if (group.is_admin !== 1 || (group.admin_level !== 2 && group.admin_level !== 3)) throw new VkCommunityValidationError(failure('AUTH', 'VK_POST_PERMISSION', 'VK requires editor or administrator authority in the selected community.'));
  // The account title is not a diagnostic, but an echoed token must not enter its public DTO either.
  const displayName = typeof group.name === 'string' && !group.name.includes(options.token) ? group.name.slice(0, 200) : 'VK';
  return { destinationId: `-${options.communityId}`, displayName };
}

function uploadDestination(value: unknown, token: string): URL | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    // Deliberately fail closed to the wall-photo upload family. New hosts need verified eligibility.
    if (url.protocol !== 'https:' || !/^pu\d*\.vk\.com$/.test(url.hostname) || url.port || url.username || url.password || url.hash) return null;
    const decoded = decodeURIComponent(url.toString());
    if (value.includes(token) || decoded.includes(token) || /[\r\n\0]/.test(decoded)) return null;
    for (const key of url.searchParams.keys()) if (/^(access_token|refresh_token|authorization)$/i.test(key)) return null;
    return url;
  } catch { return null; }
}

export function createVkConnector(options: { getAccessToken: (socialAccountId: string) => Promise<string>; fetchImpl?: typeof fetch; apiVersion?: string }): SocialConnector {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    provider: 'VK',
    async publish(input: PublishInput): Promise<PublishResult> {
      if (input.provider !== 'VK' || !validDestination(input.destinationId) || typeof input.socialAccountId !== 'string' || !input.socialAccountId.trim()) return failure('VALIDATION', 'VK_ACCOUNT', 'Use a connected VK account and its negative community wall ID.');
      if (typeof input.publicationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.publicationId)) return failure('VALIDATION', 'VK_PUBLICATION_ID', 'VK requires a valid durable publication ID.');
      const media = input.media ?? [];
      const issue = validatePublicationContent('VK', input.text, media.map(asset => ({ ...asset, byteSize: asset.bytes.length })));
      if (issue) return failure('VALIDATION', issue.code, issue.message);
      // Defence in depth until every caller uses the shared provider limits.
      if (media.some(asset => !['image/jpeg', 'image/png'].includes(asset.mimeType))) return failure('VALIDATION', 'VK_MEDIA_FORMAT', 'VK publication supports JPEG and PNG photos.');
      let token: string;
      try { token = await options.getAccessToken(input.socialAccountId); }
      catch { return failure('AUTH', 'VK_RECONNECT_REQUIRED', 'Reconnect the VK account before publishing.'); }
      if (!validToken(token)) return failure('AUTH', 'VK_RECONNECT_REQUIRED', 'Reconnect the VK account before publishing.');
      const call = createApi({ token, fetchImpl, apiVersion: options.apiVersion });
      const groupId = input.destinationId.slice(1);
      const attachments: string[] = [];
      for (const asset of media) {
        const prepared = await call('photos.getWallUploadServer', { group_id: groupId });
        if (!prepared.ok) return prepared;
        const server = record(prepared.result);
        const uploadUrl = uploadDestination(server?.upload_url, token);
        if (!uploadUrl) return failure('PERMANENT', 'VK_UPLOAD_URL', 'VK did not provide an allowed photo upload destination.');
        if (!Number.isSafeInteger(server?.album_id) || !validPositiveId(server?.user_id) ||
          (server?.group_id !== undefined && (!validPositiveId(server.group_id) || String(server.group_id) !== groupId))) return failure('PERMANENT', 'VK_UPLOAD_RESPONSE', 'VK did not confirm the photo upload community.');
        let uploaded: Record<string, unknown> | null;
        try {
          const bytes = new Uint8Array(asset.bytes.length);
          bytes.set(asset.bytes);
          const form = new FormData();
          // Official VK Java SDK photoWall uses multipart field photo; uploads carry no OAuth token.
          form.set('photo', new Blob([bytes.buffer], { type: asset.mimeType }), asset.mimeType === 'image/png' ? 'photo.png' : 'photo.jpg');
          const response = await fetchImpl(uploadUrl.toString(), { method: 'POST', redirect: 'error', body: form, signal: AbortSignal.timeout(30_000) });
          if (response.status >= 300 && response.status < 400) return failure('PERMANENT', 'VK_UPLOAD_REDIRECT', 'VK photo upload destination attempted a redirect.');
          if (!response.ok) return failure('TEMPORARY', 'VK_UPLOAD_FAILED', 'VK photo upload was not confirmed.');
          uploaded = record(await response.json());
        } catch { return failure('TEMPORARY', 'VK_UPLOAD_FAILED', 'VK photo upload was not confirmed.'); }
        if (!validPositiveId(uploaded?.server) || typeof uploaded?.photo !== 'string' || !uploaded.photo.trim() || uploaded.photo.trim() === '[]' || uploaded.photo.length > 1_048_576 || typeof uploaded.hash !== 'string' || !uploaded.hash.trim() || uploaded.hash.length > 8192) return failure('TEMPORARY', 'VK_UPLOAD_RESPONSE', 'VK photo upload response was incomplete.');
        const saved = await call('photos.saveWallPhoto', { group_id: groupId, server: String(uploaded.server), photo: uploaded.photo, hash: uploaded.hash }, true);
        if (!saved.ok) return saved;
        const items = Array.isArray(saved.result) ? saved.result : [];
        const item = items.length === 1 ? record(items[0]) : null;
        // Private access-key attachment semantics are outside the approved public community contract.
        if (!item || !validPositiveId(item.id) || item.owner_id !== Number(input.destinationId) || item.access_key !== undefined) return failure('PERMANENT', 'VK_PHOTO_RECEIPT', 'VK did not confirm the saved community photo.');
        const attachment = `photo${item.owner_id}_${item.id}`;
        if (attachments.includes(attachment)) return failure('PERMANENT', 'VK_PHOTO_RECEIPT', 'VK did not confirm distinct saved community photos.');
        attachments.push(attachment);
      }
      const result = await call('wall.post', {
        owner_id: input.destinationId, from_group: '1', message: input.text,
        ...(attachments.length ? { attachments: attachments.join(',') } : {}),
        // Advisory only: a guid never makes an unknown delivery safe to retry.
        guid: input.publicationId,
      }, true);
      if (!result.ok) return result;
      const receipt = record(result.result);
      if (!validPositiveId(receipt?.post_id) || (receipt?.owner_id !== undefined && receipt.owner_id !== Number(input.destinationId))) return ambiguous();
      const remoteId = `${input.destinationId}_${receipt.post_id}`;
      return { ok: true, remoteId, remoteUrl: `https://vk.com/wall${remoteId}` };
    },
  };
}

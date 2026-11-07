import type { PublicationErrorType, PublishInput, PublishResult, SocialConnector, VkPublicationDiagnostic } from './types.ts';
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
const photoReceiptReasons = ['RESPONSE_SHAPE', 'PHOTO_COUNT', 'PHOTO_ID_INVALID', 'PHOTO_OWNER_INVALID', 'PHOTO_OWNER_MISMATCH', 'PHOTO_ACCESS_KEY_PRESENT', 'DUPLICATE_ATTACHMENT'] as const;
type PhotoReceiptCheck = { ok: true; id: number; ownerId: number } | { ok: false; reason: NonNullable<VkPublicationDiagnostic['photoReceiptReason']> };

function checkSavedPhoto(value: unknown, destination: number, uploader: unknown): PhotoReceiptCheck {
  if (!Array.isArray(value)) return { ok: false, reason: 'RESPONSE_SHAPE' };
  if (value.length !== 1) return { ok: false, reason: 'PHOTO_COUNT' };
  const item = record(value[0]);
  if (!item || !validPositiveId(item.id)) return { ok: false, reason: 'PHOTO_ID_INVALID' };
  const owner = item.owner_id;
  if (typeof owner !== 'number' || !Number.isSafeInteger(owner) || owner === 0) return { ok: false, reason: 'PHOTO_OWNER_INVALID' };
  if (owner !== destination && owner !== uploader) return { ok: false, reason: 'PHOTO_OWNER_MISMATCH' };
  if (item.access_key !== undefined) return { ok: false, reason: 'PHOTO_ACCESS_KEY_PRESENT' };
  return { ok: true, id: item.id, ownerId: owner };
}

// Rebuild at the worker boundary: never serialize arbitrary connector properties.
export function sanitizeVkPublicationDiagnostic(value: unknown): VkPublicationDiagnostic | undefined {
  try {
  const candidate = record(value);
  if (!candidate) return;
  // Snapshot once so a mutable getter cannot change a value after validation.
  const { stage, method, vkErrorCode, uploadHttpStatus, uploadHostClass, uploadAttempt, networkErrorClass: networkClass, photoReceiptReason } = candidate;
  if (typeof stage !== 'string' || !['COMMUNITY_VALIDATION', 'GET_UPLOAD_SERVER', 'UPLOAD', 'UPLOAD_RESPONSE', 'SAVE_PHOTO', 'PHOTO_RECEIPT', 'WALL_POST'].includes(stage)) return;
  const safe: VkPublicationDiagnostic = { stage: stage as VkPublicationDiagnostic['stage'] };
  if (typeof method === 'string' && ['groups.getById', 'photos.getWallUploadServer', 'photos.saveWallPhoto', 'wall.post'].includes(method)) safe.method = method as VkPublicationDiagnostic['method'];
  if (typeof vkErrorCode === 'number' && Number.isSafeInteger(vkErrorCode) && vkErrorCode > 0 && vkErrorCode <= 9999) safe.vkErrorCode = vkErrorCode;
  if (typeof uploadHttpStatus === 'number' && Number.isInteger(uploadHttpStatus) && uploadHttpStatus >= 100 && uploadHttpStatus <= 599) safe.uploadHttpStatus = uploadHttpStatus;
  if (uploadHostClass === 'VK_RU_PHOTO_UPLOAD' || uploadHostClass === 'VK_COM_PHOTO_UPLOAD') safe.uploadHostClass = uploadHostClass;
  if (uploadAttempt === 'PRIMARY' || uploadAttempt === 'FALLBACK') safe.uploadAttempt = uploadAttempt;
  if (typeof networkClass === 'string' && ['TIMEOUT', 'DNS', 'CONNECTION', 'TLS', 'OTHER'].includes(networkClass)) safe.networkErrorClass = networkClass as VkPublicationDiagnostic['networkErrorClass'];
  const reason = typeof photoReceiptReason === 'string' ? photoReceiptReasons.find(value => value === photoReceiptReason) : undefined;
  if (stage === 'PHOTO_RECEIPT' && reason) safe.photoReceiptReason = reason;
  return safe;
  } catch { return undefined; }
}

function networkErrorClass(error: unknown): VkPublicationDiagnostic['networkErrorClass'] {
  const value = record(error), cause = record(value?.cause);
  if (value?.name === 'TimeoutError' || value?.name === 'AbortError' || cause?.code === 'UND_ERR_CONNECT_TIMEOUT') return 'TIMEOUT';
  const code = cause?.code ?? value?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return 'CONNECTION';
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'ERR_TLS_CERT_ALTNAME_INVALID') return 'TLS';
  return 'OTHER';
}

// Only numeric, recognized API codes are reflected; provider messages/params never leave this module.
function apiFailure(code: unknown, mutation: boolean, unknownOutcome: () => Failure): Failure {
  if (typeof code !== 'number' || !Number.isSafeInteger(code)) return mutation ? unknownOutcome() : unavailable();
  if (code === 1051) return failure('PERMANENT', 'VK_METHOD_PROFILE_DENIED', 'VK denied this method for the current profile or application. Confirm official API access before trying again.');
  if (code === 27) return failure('PERMANENT', 'VK_GROUP_TOKEN_METHOD_DENIED', 'VK denied this method for the supplied community authorization. Confirm an approved credential type before trying again.');
  if (code === 15) return failure('PERMANENT', 'VK_API_ACCESS_NOT_GRANTED', 'VK has not granted access to this method or resource. Confirm API permissions before trying again.');
  if (code === 6 || code === 29) return { ...failure('TEMPORARY', `VK_${code}`, 'VK rate limit; retry later.'), retryAfterMs: 60_000 };
  if ([5, 7, 14, 17, 20, 24, 25, 28, 214, 704, 1117].includes(code)) return failure('AUTH', `VK_${code}`, 'VK credentials, community permissions or an account challenge require reconnecting.');
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
    const stage: VkPublicationDiagnostic['stage'] = method === 'groups.getById' ? 'COMMUNITY_VALIDATION' : method === 'photos.getWallUploadServer' ? 'GET_UPLOAD_SERVER' : method === 'photos.saveWallPhoto' ? 'SAVE_PHOTO' : 'WALL_POST';
    const diagnose = (result: Failure, extra: Partial<VkPublicationDiagnostic> = {}): Failure => ({ ...result, vkDiagnostic: { stage, method, ...extra } });
    try {
      const body = new URLSearchParams({ ...params, access_token: options.token, v: apiVersion });
      const response = await fetchImpl(`https://api.vk.com/method/${method}`, {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
        signal: AbortSignal.timeout(30_000),
      });
      const payload = record(await response.json());
      if (payload?.error) {
        const code = record(payload.error)?.error_code;
        return diagnose(apiFailure(code, mutation, unknownOutcome), typeof code === 'number' && Number.isSafeInteger(code) && code > 0 && code <= 9999 ? { vkErrorCode: code } : {});
      }
      if (response.ok && payload && Object.hasOwn(payload, 'response')) return { ok: true, result: payload.response };
      return diagnose(mutation ? unknownOutcome() : unavailable());
    } catch (error) {
      // Raw transport errors may contain credentials, request bodies or signed upload URLs.
      return diagnose(mutation ? unknownOutcome() : unavailable(), { networkErrorClass: networkErrorClass(error) });
    }
  };
}

export class VkCommunityValidationError extends Error {
  readonly code: string;
  readonly errorType: PublicationErrorType;
  readonly vkDiagnostic?: VkPublicationDiagnostic;
  constructor(result: Failure) {
    super(result.message);
    this.name = 'VkCommunityValidationError';
    this.code = result.code ?? 'VK_COMMUNITY';
    this.errorType = result.errorType;
    this.vkDiagnostic = sanitizeVkPublicationDiagnostic(result.vkDiagnostic);
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

export function allowedVkPhotoUploadDestination(value: unknown, token: string): URL | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    // Deliberately fail closed to the wall-photo upload family. New hosts need verified eligibility.
    if (url.protocol !== 'https:' || !(url.hostname === 'pu.vk.ru' || /^pu\d*\.vk\.com$/.test(url.hostname)) || url.port || url.username || url.password || url.hash) return null;
    const decoded = decodeURIComponent(url.toString());
    if (value.includes(token) || decoded.includes(token) || /[\r\n\0]/.test(decoded)) return null;
    for (const key of url.searchParams.keys()) if (/^(access_token|refresh_token|authorization)$/i.test(key)) return null;
    return url;
  } catch { return null; }
}

// Shared native multipart path for publishing and the isolated owner upload test.
// The OAuth credential is deliberately not part of this transport's arguments.
export function uploadVkPhotoMultipart(options: {uploadUrl: URL; bytes: Uint8Array; mimeType: string; fetchImpl: typeof fetch; signal?: AbortSignal}): Promise<Response> {
  const bytes = new Uint8Array(options.bytes.length); bytes.set(options.bytes);
  const form = new FormData();
  form.set('photo', new Blob([bytes.buffer], {type: options.mimeType}), options.mimeType === 'image/png' ? 'photo.png' : 'photo.jpg');
  return options.fetchImpl(options.uploadUrl.toString(), {method: 'POST', redirect: 'error', body: form, signal: options.signal ?? AbortSignal.timeout(30_000)});
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
        const uploadUrl = allowedVkPhotoUploadDestination(server?.upload_url, token);
        if (!uploadUrl) return failure('PERMANENT', 'VK_UPLOAD_URL', 'VK did not provide an allowed photo upload destination.');
        if (!Number.isSafeInteger(server?.album_id) || !validPositiveId(server?.user_id) ||
          (server?.group_id !== undefined && (!validPositiveId(server.group_id) || String(server.group_id) !== groupId))) return failure('PERMANENT', 'VK_UPLOAD_RESPONSE', 'VK did not confirm the photo upload community.');
        const fallbackUrl = allowedVkPhotoUploadDestination(server?.fallback_upload_url, token);
        let currentUrl = uploadUrl;
        let attempt: 'PRIMARY' | 'FALLBACK' = 'PRIMARY';
        let response: Response;
        const uploadDiagnostic = (): VkPublicationDiagnostic => ({ stage: 'UPLOAD', uploadHostClass: currentUrl.hostname === 'pu.vk.ru' ? 'VK_RU_PHOTO_UPLOAD' : 'VK_COM_PHOTO_UPLOAD', uploadAttempt: attempt });
        // Only an explicit method rejection permits one fallback. An unknown upload
        // outcome, redirect or mutation failure never authorizes another endpoint.
        for (;;) {
          try { response = await uploadVkPhotoMultipart({uploadUrl: currentUrl, bytes: asset.bytes, mimeType: asset.mimeType, fetchImpl}); }
          catch (error) { return { ...failure('TEMPORARY', 'VK_UPLOAD_FAILED', 'VK photo upload was not confirmed.'), vkDiagnostic: { ...uploadDiagnostic(), networkErrorClass: networkErrorClass(error) } }; }
          if (response.status === 405 && attempt === 'PRIMARY' && fallbackUrl && fallbackUrl.href !== uploadUrl.href) {
            await response.body?.cancel().catch(() => {});
            currentUrl = fallbackUrl; attempt = 'FALLBACK'; continue;
          }
          break;
        }
        const diagnostic = { ...uploadDiagnostic(), uploadHttpStatus: response.status };
        if (response.status >= 300 && response.status < 400) return { ...failure('PERMANENT', 'VK_UPLOAD_REDIRECT', 'VK photo upload destination attempted a redirect.'), vkDiagnostic: diagnostic };
        if (response.status === 405) return { ...failure('PERMANENT', 'VK_UPLOAD_HTTP_405', 'VK photo upload endpoint rejected POST (HTTP 405).'), vkDiagnostic: diagnostic };
        if (!response.ok) return { ...failure('TEMPORARY', 'VK_UPLOAD_FAILED', 'VK photo upload was not confirmed.'), vkDiagnostic: diagnostic };
        let uploaded: Record<string, unknown> | null;
        try { uploaded = record(await response.json()); }
        catch { return { ...failure('TEMPORARY', 'VK_UPLOAD_RESPONSE', 'VK photo upload response was incomplete.'), vkDiagnostic: { ...diagnostic, stage: 'UPLOAD_RESPONSE' } }; }
        if (!validPositiveId(uploaded?.server) || typeof uploaded?.photo !== 'string' || !uploaded.photo.trim() || uploaded.photo.trim() === '[]' || uploaded.photo.length > 1_048_576 || typeof uploaded.hash !== 'string' || !uploaded.hash.trim() || uploaded.hash.length > 8192) return { ...failure('TEMPORARY', 'VK_UPLOAD_RESPONSE', 'VK photo upload response was incomplete.'), vkDiagnostic: { ...diagnostic, stage: 'UPLOAD_RESPONSE' } };
        const saved = await call('photos.saveWallPhoto', { group_id: groupId, server: String(uploaded.server), photo: uploaded.photo, hash: uploaded.hash }, true);
        if (!saved.ok) return saved;
        // Private access-key attachment semantics are outside the approved public community contract.
        // A photo may belong to the uploader while wall.post targets the community.
        // Trust only the owner tied to this authenticated upload preparation or wall.
        const checked = checkSavedPhoto(saved.result, Number(input.destinationId), server.user_id);
        if (!checked.ok) return { ...failure('PERMANENT', 'VK_PHOTO_RECEIPT', 'VK did not confirm the saved community photo.'), vkDiagnostic: { stage: 'PHOTO_RECEIPT', method: 'photos.saveWallPhoto', photoReceiptReason: checked.reason } };
        const attachment = `photo${checked.ownerId}_${checked.id}`;
        if (attachments.includes(attachment)) return { ...failure('PERMANENT', 'VK_PHOTO_RECEIPT', 'VK did not confirm distinct saved community photos.'), vkDiagnostic: { stage: 'PHOTO_RECEIPT', method: 'photos.saveWallPhoto', photoReceiptReason: 'DUPLICATE_ATTACHMENT' } };
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

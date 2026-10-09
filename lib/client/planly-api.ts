import type {
  MediaAssetDto,
  PostDto,
  ProfileDto,
  SocialAccountDto,
  UpdateProfileInput,
} from '../contracts/planner.ts';
import type { CreateLibraryItemInput, LibraryItemDto, UpdateLibraryItemInput } from '../contracts/library.ts';
import { libraryCreationKeySchema } from '../contracts/library.ts';
import type { ComposerPostInput } from '../planner.ts';
import type { SlotQuery } from '../contracts/swipe-planner.ts';
import type {AnalyticsQuery,AnalyticsDto,RefreshSummary} from '../contracts/analytics.ts';
import type {SchedulingPlanPreviewInput,SchedulingPlanPreview,SchedulingPlanCommitInput,SchedulingPlanCommitResult} from '../contracts/scheduling-plan.ts';

export type MediaAssetWithPreview = MediaAssetDto & { previewUrl: string };
export type PlannerSnapshot = {
  profile: ProfileDto;
  posts: PostDto[];
  media: MediaAssetWithPreview[];
  socialAccounts: SocialAccountDto[];
  libraryItems: LibraryItemDto[];
};

export class PlanlyApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'PlanlyApiError';
    this.status = status;
    this.body = body;
  }
}

function redirectUnauthorized(): void {
  if (typeof window !== 'undefined') window.location.assign('/login');
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

  if (!response.ok) {
    if (response.status === 401) redirectUnauthorized();
    const message = body && typeof body === 'object' && 'error' in body && typeof (body as {error?:unknown}).error === 'string'
      ? (body as {error:string}).error
      : `Request failed with status ${response.status}`;
    throw new PlanlyApiError(message, response.status, body);
  }
  return body as T;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function loadPlanner(): Promise<PlannerSnapshot> {
  return request('/api/bootstrap');
}

export function previewSchedulingPlanRequest(input:SchedulingPlanPreviewInput):Promise<SchedulingPlanPreview> {
  return request('/api/scheduling-plans/preview',{...jsonRequest('POST',input),headers:{'content-type':'application/json','X-Planly-Scheduling':'1'}});
}
export function commitSchedulingPlanRequest(input:SchedulingPlanCommitInput):Promise<SchedulingPlanCommitResult> {
  return request('/api/scheduling-plans/commit',{...jsonRequest('POST',input),headers:{'content-type':'application/json','X-Planly-Scheduling':'1'}});
}

export async function savePost(input: ComposerPostInput, id?: string, creationKey?: string): Promise<PostDto> {
  const { sourceLibraryItemId, ...content } = input;
  const body = !id && sourceLibraryItemId ? { ...content, sourceLibraryItemId } : content;
  const init = jsonRequest(id ? 'PATCH' : 'POST', body);
  if (!id && creationKey) init.headers = { ...init.headers, 'idempotency-key': creationKey };
  const saved = await request<PostDto>(id ? `/api/posts/${encodeURIComponent(id)}` : '/api/posts', init);
  if (!saved || typeof saved.id !== 'string' || !saved.id.trim()) {
    throw new PlanlyApiError('Сервер не подтвердил сохранение поста. Повтори сохранение, чтобы восстановить результат.', 502);
  }
  return saved;
}

export function removePost(id: string): Promise<void> {
  return request(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function loadLibraryItems(): Promise<LibraryItemDto[]> {
  return request('/api/library-items');
}

export function loadPlannerSlot(query: SlotQuery): Promise<{ scheduledAt: string | null }> {
  const params = new URLSearchParams({providers:query.providers.join(','),startDate:query.startDate,endDate:query.endDate,
    weekdays:query.weekdays.join(','),times:query.times.join(',')});
  return request(`/api/planner-slots?${params}`);
}
export function archiveLibraryItem(id: string, expectedUpdatedAt: string): Promise<LibraryItemDto> {
  return request(`/api/library-items/${encodeURIComponent(id)}`,jsonRequest('PATCH',{status:'ARCHIVED',expectedUpdatedAt}));
}

export async function createLibraryItem(input: CreateLibraryItemInput, creationKey: string): Promise<LibraryItemDto> {
  const key = libraryCreationKeySchema.parse(creationKey);
  const init = jsonRequest('POST', input);
  init.headers = { ...init.headers, 'idempotency-key': key };
  const saved = await request<LibraryItemDto>('/api/library-items', init);
  if (!saved || typeof saved.id !== 'string' || !saved.id.trim()) {
    throw new PlanlyApiError('Сервер не подтвердил сохранение заготовки. Повтори сохранение для проверки результата.', 502);
  }
  return saved;
}

export function updateLibraryItem(id: string, input: UpdateLibraryItemInput): Promise<LibraryItemDto> {
  return request(`/api/library-items/${encodeURIComponent(id)}`, jsonRequest('PATCH', input));
}

export function removeLibraryItem(id: string): Promise<void> {
  return request(`/api/library-items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function saveProfile(input: UpdateProfileInput): Promise<ProfileDto> {
  return request('/api/profile', jsonRequest('PATCH', input));
}

export function setAccountEnabled(id: string, enabled: boolean): Promise<SocialAccountDto> {
  return request(`/api/social-accounts/${encodeURIComponent(id)}`, jsonRequest('PATCH', { enabled }));
}

export function loadMedia(): Promise<MediaAssetWithPreview[]> {
  return request('/api/media');
}

export async function uploadMedia(file: File): Promise<MediaAssetWithPreview> {
  const form = new FormData();
  form.set('file', file);
  const created = await request<MediaAssetDto>('/api/media', { method: 'POST', body: form });
  const media = await loadMedia();
  const result = media.find(item => item.id === created.id);
  if (!result) throw new PlanlyApiError('Uploaded media was not returned by the server', 500);
  return result;
}

export function removeMedia(id: string): Promise<void> {
  return request(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
}


export function connectSocialAccount(id: string, destinationId: string): Promise<SocialAccountDto> {
  return request(`/api/social-accounts/${encodeURIComponent(id)}`,jsonRequest('PATCH',{destinationId}));
}

export const connectTelegramAccount = connectSocialAccount;

export function startVkConnection(accountId: string, communityId: string): Promise<{ authorizationUrl: string }> {
  return request('/api/social-accounts/vk/start', jsonRequest('POST', { accountId, communityId }));
}

export function disconnectVkConnection(accountId: string): Promise<SocialAccountDto> {
  return request('/api/social-accounts/vk/disconnect', jsonRequest('POST', { accountId }));
}
export function loadAnalytics(query:AnalyticsQuery,signal?:AbortSignal):Promise<AnalyticsDto> {
  return request(`/api/analytics?${new URLSearchParams({provider:query.provider,period:String(query.period),page:String(query.page)})}`,signal?{signal}:undefined);
}
export function refreshAnalytics(query:AnalyticsQuery,signal?:AbortSignal):Promise<RefreshSummary> {
  return request('/api/analytics/refresh',{...jsonRequest('POST',query),headers:{'content-type':'application/json','X-Planly-Analytics':'1'},...(signal?{signal}:{})});
}

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
import type {LibraryBatchPreviewInput,LibraryBatchPreview,LibraryBatchCommitInput,LibraryBatchCommitResult} from '../contracts/library-batch.ts';

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
// UI lifetime only. This never supplies identity to the server; cookies remain
// its sole authority. A departed request must not navigate a newer workspace.
let clientSessionLifetime = {};
export function invalidateClientSessionRequests(): void { clientSessionLifetime = {}; }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const lifetime=clientSessionLifetime;
  const response = await fetch(url, {...init,cache:'no-store'});
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

  if (!response.ok) {
    if (response.status === 401 && lifetime===clientSessionLifetime) redirectUnauthorized();
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
export function cancelPostTargetApproval(postId:string,targetId:string,input:import('../contracts/planner.ts').CancelApprovalInput):Promise<import('../contracts/planner.ts').CancelApprovalResult> {
  return request(`/api/posts/${encodeURIComponent(postId)}/targets/${encodeURIComponent(targetId)}/cancel-approval`,{
    ...jsonRequest('POST',input),headers:{'content-type':'application/json','X-Planly-Social-Connection':'1'},
  });
}
export function loadProfile(): Promise<ProfileDto> { return request('/api/profile'); }
export function logoutSession(): Promise<void> { return request('/api/auth/logout',{method:'POST'}); }
export function loadSchedulingDrafts():Promise<PostDto[]> {return request('/api/posts');}

export function loadLibraryBatchEligibility():Promise<{eligible:boolean}>{return request('/api/library/batch-consent/preview');}
export function previewLibraryBatchRequest(input:LibraryBatchPreviewInput):Promise<LibraryBatchPreview>{
  return request('/api/library/batch-consent/preview',{...jsonRequest('POST',input),headers:{'content-type':'application/json','X-Planly-Library-Batch':'1'}});
}
export function commitLibraryBatchRequest(input:LibraryBatchCommitInput):Promise<LibraryBatchCommitResult>{
  return request('/api/library/batch-consent/commit',{...jsonRequest('POST',input),headers:{'content-type':'application/json','X-Planly-Library-Batch':'1'}});
}
export function loadLibraryBatchOperation(operationId:string):Promise<LibraryBatchCommitResult>{
  return request(`/api/library/batch-consent/operations/${encodeURIComponent(operationId)}`);
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
  if(query.swipeReview !== undefined) params.set('swipeReview',String(query.swipeReview));
  return request(`/api/planner-slots?${params}`);
}
export async function archiveLibraryItem(id: string, expectedUpdatedAt: string, intent?: import('../contracts/swipe-feedback.ts').SwipeDislike): Promise<LibraryItemDto> {
  const init=jsonRequest('PATCH',{status:'ARCHIVED',expectedUpdatedAt,...(intent?{swipeReview:{inputMethod:intent.inputMethod}}:{})});
  if(intent) init.headers={...init.headers,'idempotency-key':intent.operationId};
  const saved=await request<LibraryItemDto>(`/api/library-items/${encodeURIComponent(id)}`,init);
  if(intent && (!saved || saved.id!==id || !['READY','ARCHIVED','USED'].includes(saved.status))) throw new PlanlyApiError('Сервер не подтвердил решение. Повтори сохранение.',502);
  return saved;
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

function socialConnectionRequest<T>(id:string,action:string,body:unknown):Promise<T> {
  return request(`/api/social-connections/accounts/${encodeURIComponent(id)}/${action}`,{
    ...jsonRequest('POST',body),headers:{'content-type':'application/json','X-Planly-Social-Connection':'1'},
  });
}
export function beginSocialConnection(id:string,destinationId:string):Promise<{launchUrl:string}> {
  return socialConnectionRequest(id,'start',{destinationId});
}
export function changeSocialConnection(id:string,action:'enable'|'pause'|'release',bindingRevision:number):Promise<{accountId:string;bindingRevision:number;enabled:boolean}> {
  return socialConnectionRequest(id,action,{bindingRevision});
}
export function validatedSocialConnectionLaunch(provider:string,value:string):string {
  const pattern=provider==='telegram'?/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,63}\?startapp=[A-Za-z0-9_-]{43}$/:provider==='max'?/^https:\/\/max\.ru\/[A-Za-z][A-Za-z0-9_-]{2,63}\?startapp=[A-Za-z0-9_-]{43}$/:null;
  if(typeof value!=='string' || !pattern?.test(value))throw new Error('Неподдерживаемый адрес Mini App. Начни подключение заново.');
  return value;
}

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

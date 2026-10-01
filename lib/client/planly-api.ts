import type {
  MediaAssetDto,
  PostDto,
  ProfileDto,
  SavePostInput,
  SocialAccountDto,
  UpdateProfileInput,
} from '../contracts/planner.ts';

export type MediaAssetWithPreview = MediaAssetDto & { previewUrl: string };
export type PlannerSnapshot = {
  profile: ProfileDto;
  posts: PostDto[];
  media: MediaAssetWithPreview[];
  socialAccounts: SocialAccountDto[];
};

export class PlanlyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'PlanlyApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

  if (!response.ok) {
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

export function savePost(input: SavePostInput, id?: string): Promise<PostDto> {
  return id
    ? request(`/api/posts/${encodeURIComponent(id)}`, jsonRequest('PATCH', input))
    : request('/api/posts', jsonRequest('POST', input));
}

export function removePost(id: string): Promise<void> {
  return request(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

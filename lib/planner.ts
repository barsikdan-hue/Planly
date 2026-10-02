import type { PostDto, SavePostInput } from './contracts/planner.ts';

export type Network = 'telegram' | 'max';
export type Status = 'draft' | 'scheduled' | 'published' | 'failed';
export type Media = {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
};
export type Post = {
  id: string;
  text: string;
  networks: Network[];
  date: string;
  time: string;
  status: Status;
  targets: {
    network: Network;
    status: Status;
    remoteUrl?: string | null;
    error?: string | null;
  }[];
  mediaIds: string[];
  overrides: Partial<Record<Network, string>>;
  theme?: number;
};

export const networkNames: Record<Network, string> = {
  telegram: 'Telegram',
  max: 'MAX',
};
export const statusNames: Record<Status, string> = {
  draft: 'Черновик',
  scheduled: 'Запланировано',
  published: 'Опубликовано',
  failed: 'Ошибка',
};

export function moscowDate(date: string, time: string) {
  return new Date(`${date}T${time}:00+03:00`);
}

export function validatePost(p: {
  text: string;
  networks: unknown[];
  date: string;
  time: string;
}, status: string, now = Date.now()): string | null {
  if (!p.text.trim()) return 'Добавь текст публикации.';
  if (status === 'draft') return null;
  if (!p.networks.length) return 'Выбери хотя бы одну соцсеть.';
  if (status === 'scheduled') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) {
      return 'Укажи корректные дату и время.';
    }
    const d = moscowDate(p.date, p.time);
    if (!Number.isFinite(d.getTime()) || d.getTime() <= now) return 'Выбери время в будущем (МСК).';
    if (d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }) !== p.date) return 'Укажи существующую дату.';
  }
  return null;
}

export function movePost<T extends { date: string; time: string }>(post: T, date: string, time: string): T {
  return { ...post, date, time };
}

export function day(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}

export function addDays(date: string, offset: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function blankPost(): Post {
  return {
    id: '',
    text: '',
    networks: ['telegram'],
    date: day(1),
    time: '10:00',
    status: 'draft',
    targets: [],
    mediaIds: [],
    overrides: {},
  };
}

function moscowParts(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function fromServerPost(input: PostDto): Post {
  const firstSchedule = input.targets.map(target => target.scheduledAt).find(Boolean) ?? null;
  const schedule = moscowParts(firstSchedule) ?? { date: day(1), time: '10:00' };
  const networks = input.targets.map(target => target.provider);
  const targets = input.targets.map(target => {
    const publication = target.publication;
    const status: Status = publication?.status === 'PUBLISHED' && publication.remoteId ? 'published'
      : publication?.status === 'FAILED' || publication?.status === 'REQUIRES_RECONNECT' ? 'failed'
      : publication?.status === 'CANCELLED' ? 'draft'
      : input.status === 'READY' ? 'scheduled' : 'draft';
    return { network: target.provider, status, remoteUrl: publication?.remoteUrl, error: publication?.error };
  });
  const status: Status = targets.some(target => target.status === 'failed') ? 'failed'
    : targets.length > 0 && targets.every(target => target.status === 'published') ? 'published'
    : targets.some(target => target.status === 'scheduled') ? 'scheduled' : 'draft';
  const overrides: Partial<Record<Network, string>> = {};
  for (const target of input.targets) {
    if (target.textOverride !== null) overrides[target.provider] = target.textOverride;
  }
  return {
    id: input.id,
    text: input.baseText,
    networks,
    date: schedule.date,
    time: schedule.time,
    status,
    targets,
    mediaIds: [...input.mediaIds],
    overrides,
  };
}

export function toSavePostInput(post: Post, status: 'draft' | 'scheduled'): SavePostInput {
  const scheduledAt = status === 'scheduled' ? moscowDate(post.date, post.time).toISOString() : null;
  return {
    baseText: post.text,
    status: status === 'scheduled' ? 'READY' : 'DRAFT',
    targets: post.networks.map(provider => ({
      provider,
      textOverride: post.overrides[provider] ?? null,
      scheduledAt,
    })),
    mediaIds: [...post.mediaIds],
  };
}

export function seedPosts(): Post[] {
  return [];
}


export function toPublishNowInput(post: Pick<Post,'text' | 'networks' | 'mediaIds' | 'overrides'>, now = Date.now()): SavePostInput {
  return {baseText:post.text,status:'READY',targets:post.networks.map(provider=>({provider,textOverride:post.overrides[provider] ?? null,
    scheduledAt:new Date(now).toISOString()})),mediaIds:[...post.mediaIds]};
}

export function hasPendingPublications(posts: Pick<Post,'targets'>[]): boolean {
  return posts.some(post=>post.targets.some(target=>target.status === 'scheduled'));
}

import type { AnalyticsError, MetricObservation } from './contracts/analytics.ts';

export const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const numericDestination = (v: string): boolean => /^-?[1-9]\d{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
export const validMaxMessageId = (v: string): boolean => /^[a-zA-Z0-9_-]{1,256}$/.test(v);

export function publicationWindow(period: 7 | 30, now: Date): { from: Date; through: Date } {
  const moscow = new Date(now.getTime() + 3 * 3600000);
  return { from: new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() - period + 1) - 3 * 3600000), through: now };
}
export function parseTelegramPrimaryId(remoteId: string): string | null {
  const ids = remoteId.split(',');
  return ids.length <= 10 && ids.every(id => /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id))) && new Set(ids).size === ids.length ? ids[0] : null;
}
export function legacyTelegramDestination(url: string | null, primaryId: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const match = /^\/c\/([1-9]\d*)\/([1-9]\d*)$/.exec(u.pathname);
    if (u.protocol !== 'https:' || u.hostname !== 't.me' || u.port || u.username || u.password || u.search || u.hash || !match || match[2] !== primaryId) return null;
    const destination = `-100${match[1]}`;
    return numericDestination(destination) ? destination : null;
  } catch { return null; }
}
export function summarizeObserved(values: readonly (number | null)[]): { observedCount: number; total: number | null; totalOverflow: boolean } {
  const available = values.filter((v): v is number => v !== null && isCount(v));
  const sum = available.reduce((a,b) => a + BigInt(b), 0n);
  const totalOverflow = sum > BigInt(Number.MAX_SAFE_INTEGER);
  return {observedCount:available.length, total:available.length && !totalOverflow ? Number(sum) : null, totalOverflow};
}
export type MaxMetricRead = {coverage: MetricObservation['coverage']; value: number | null; error: AnalyticsError | null};
export function parseMaxViews(message: unknown, expected: {destinationId:string;remoteId:string}): MaxMetricRead {
  const data = record(message);
  const invalid: MaxMetricRead = {coverage:'NO_DATA',value:null,error:'INVALID_RESPONSE'};
  const chatId = record(data?.recipient)?.chat_id;
  if (!validMaxMessageId(expected.remoteId) || !numericDestination(expected.destinationId) || !Number.isSafeInteger(chatId) || String(chatId) !== expected.destinationId || record(data?.body)?.mid !== expected.remoteId) return invalid;
  if (data?.stat === undefined || data.stat === null) return {coverage:'NO_DATA',value:null,error:null};
  const views = record(data.stat)?.views;
  return isCount(views) ? {coverage:'AVAILABLE',value:views,error:null} : invalid;
}

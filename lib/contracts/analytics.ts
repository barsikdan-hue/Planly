import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  provider: z.enum(['telegram', 'max']),
  period: z.union([z.literal(7), z.literal(30)]),
  page: z.number().int().min(0).max(10000),
}).strict();
export const analyticsRefreshSchema = analyticsQuerySchema;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsProvider = AnalyticsQuery['provider'];
export type AnalyticsMetric = 'views' | 'reactions';
export type AnalyticsError = 'ACCESS_DENIED' | 'NOT_FOUND_OR_INACCESSIBLE' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'INVALID_RESPONSE';
export type MetricObservation = {
  value: number | null; observedAt: string | null;
  coverage: 'AVAILABLE' | 'NO_DATA' | 'UNSUPPORTED' | 'IDENTITY_UNPROVEN';
  stale: boolean; collectionError: AnalyticsError | null;
};
export type AnalyticsRow = { publicationId: string; text: string; publishedAt: string; providerUrl: string | null; primaryMessageOnly: boolean; metric: MetricObservation };
export type AnalyticsDto = { provider: AnalyticsProvider; period: 7 | 30; page: number; pageSize: 20; eligibleCount: number; observedCount: number; total: number | null; totalOverflow: boolean; rows: AnalyticsRow[]; asOf: string };
export type RefreshSummary = { checked: number; observed: number; unavailable: number; skipped: number; busy: boolean; nextPage: number | null };

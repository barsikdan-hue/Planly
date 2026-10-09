import { z } from 'zod';
import { slotQuerySchema, type SlotQuery } from './swipe-planner.ts';
import type { PostDto, SocialAccountDto, MediaAssetDto } from './planner.ts';

const shape = slotQuerySchema.innerType().shape;
export const planSettingsSchema = z.object({startDate:shape.startDate,endDate:shape.endDate,weekdays:shape.weekdays,times:shape.times}).strict()
  .refine(settings => slotQuerySchema.safeParse({...settings,providers:['telegram']}).success, 'Invalid scheduling settings');
const postId = z.string().min(1).max(200);
const distinct = (ids: string[]) => new Set(ids).size === ids.length;
export const schedulingPlanPreviewInputSchema = z.object({postIds:z.array(postId).min(1).max(20).refine(distinct),settings:planSettingsSchema}).strict();
export const schedulingPlanCommitInputSchema = z.object({operationId:z.string().uuid(),settings:planSettingsSchema,
  rows:z.array(z.object({postId,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),scheduledAt:z.string().datetime({offset:true}),reviewed:z.literal(true)}).strict())
    .min(1).max(20).refine(rows=>distinct(rows.map(row=>row.postId))),
}).strict();
export const schedulingPlanReceiptSchema = z.object({operationId:z.string().uuid(),appliedAt:z.string().datetime({offset:true}),
  rows:z.array(z.object({postId,targetIds:z.array(postId).min(1).max(2).refine(distinct),scheduledAt:z.string().datetime({offset:true})}).strict()).min(1).max(20).refine(rows=>distinct(rows.map(row=>row.postId))),
}).strict();
export type PlanSettings = Pick<SlotQuery,'startDate'|'endDate'|'weekdays'|'times'>;
export type SchedulingPlanPreviewInput = z.infer<typeof schedulingPlanPreviewInputSchema>;
export type SchedulingPlanCommitInput = z.infer<typeof schedulingPlanCommitInputSchema>;
export type SchedulingPlanReceipt = z.infer<typeof schedulingPlanReceiptSchema>;
export type SchedulingPlanCommitResult = {receipt:SchedulingPlanReceipt;replayed:boolean};
export type SchedulingIssue = 'POST_INELIGIBLE'|'ACCOUNT_UNAVAILABLE'|'CONTENT_INVALID'|'NO_SLOT';
export type SchedulingPlanPreview = {complete:boolean;rows:{post:PostDto;accounts:SocialAccountDto[];fingerprint:string|null;scheduledAt:string|null;issue:SchedulingIssue|null}[];media:(MediaAssetDto & {previewUrl:string})[]};

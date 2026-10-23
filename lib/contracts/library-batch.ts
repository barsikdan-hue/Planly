import { z } from 'zod';
import { planSettingsSchema } from './scheduling-plan.ts';
import type { LibraryItemDto } from './library.ts';
import type { MediaAssetDto, SocialAccountDto } from './planner.ts';

const id = z.string().min(1).max(200);
export const libraryBatchHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const libraryBatchOperationIdSchema = z.string().uuid().refine(value => value === value.toLowerCase(), 'Canonical lowercase UUID required');
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const revision = z.string().datetime({offset:true}).refine(value => {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? '';
  return !/[1-9]/.test(fraction.slice(3)) && Number.isFinite(Date.parse(value));
}, 'Millisecond revision required');
const minute = z.string().datetime({offset:true}).refine(value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCSeconds() === 0 && !/[1-9]/.test(value.match(/\.(\d+)/)?.[1] ?? '');
}, 'Exact minute required');
const targetShape = {accountId:id,provider:z.enum(['TELEGRAM','MAX']),destinationId:id,scheduledAt:minute};
const targets = z.array(z.object(targetShape).strict()).min(1).max(2).refine(values =>
  unique(values.map(value=>value.accountId)) && unique(values.map(value=>value.provider)) &&
  values.every(value=>Date.parse(value.scheduledAt)===Date.parse(values[0].scheduledAt)), 'Distinct accounts/providers with one shared minute required');
const rowShape = {sourceId:id,sourceRevision:revision,contentHash:libraryBatchHashSchema,targets};
// Same reviewed destination set on every source; only the allocated time differs.
function commonTargets(rows: {targets:{accountId:string;provider:string;destinationId:string}[]}[]): boolean {
  const key = (values: typeof rows[number]['targets']) => JSON.stringify(values.map(value=>[value.provider,value.accountId,value.destinationId]).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0));
  return rows.every(row=>key(row.targets)===key(rows[0].targets));
}
export const libraryBatchPreviewInputSchema = z.object({
  sourceIds:z.array(id).min(1).max(20).refine(unique),
  accountIds:z.array(id).min(1).max(2).refine(unique),
  settings:planSettingsSchema,
}).strict();
export const libraryBatchIntentSchema = z.object({
  contractVersion:z.literal(1),kind:z.literal('LIBRARY_BATCH_FUTURE'),settings:planSettingsSchema,
  rows:z.array(z.object(rowShape).strict()).min(1).max(20)
    .refine(rows=>unique(rows.map(row=>row.sourceId)) && commonTargets(rows)),
}).strict();
export const libraryBatchCommitInputSchema = z.object({
  operationId:libraryBatchOperationIdSchema,intent:libraryBatchIntentSchema,
  snapshotFingerprint:libraryBatchHashSchema,previewProof:z.string().min(1).max(2048),
}).strict();
const receiptTargets = z.array(z.object({...targetShape,targetId:id,publicationId:id}).strict()).min(1).max(2)
  .refine(values=>unique(values.map(value=>value.accountId)) && unique(values.map(value=>value.provider)) && values.every(value=>Date.parse(value.scheduledAt)===Date.parse(values[0].scheduledAt)));
export const libraryBatchReceiptSchema = z.object({
  contractVersion:z.literal(1),kind:z.literal('LIBRARY_BATCH_FUTURE'),operationId:libraryBatchOperationIdSchema,
  requestHash:libraryBatchHashSchema,acceptedSnapshotFingerprint:libraryBatchHashSchema,confirmedAt:revision,
  rows:z.array(z.object({...rowShape,postId:id,targets:receiptTargets}).strict()).min(1).max(20).refine(rows=>
    unique(rows.map(row=>row.sourceId)) && unique(rows.map(row=>row.postId)) && commonTargets(rows) &&
    unique(rows.flatMap(row=>row.targets.map(target=>target.targetId))) && unique(rows.flatMap(row=>row.targets.map(target=>target.publicationId)))),
}).strict();
export type LibraryBatchIntent = z.infer<typeof libraryBatchIntentSchema>;
export type LibraryBatchPreviewInput = z.infer<typeof libraryBatchPreviewInputSchema>;
export type LibraryBatchCommitInput = z.infer<typeof libraryBatchCommitInputSchema>;
export type LibraryBatchReceipt = z.infer<typeof libraryBatchReceiptSchema>;
export type LibraryBatchCommitResult = {receipt:LibraryBatchReceipt;replayed:boolean};
export type LibraryBatchIssue = 'SOURCE_INELIGIBLE'|'ACCOUNT_UNAVAILABLE'|'CONTENT_INVALID'|'NO_SLOT';
export type LibraryBatchDescriptor = {intent:LibraryBatchIntent;requestHash:string;snapshotFingerprint:string;previewProof:string};
type PreviewDisplay = {rows:{item:LibraryItemDto;accounts:SocialAccountDto[];scheduledAt:string|null;issue:LibraryBatchIssue|null}[];media:(MediaAssetDto & {previewUrl:string})[]};
export type LibraryBatchPreview = PreviewDisplay & ({complete:true;descriptor:LibraryBatchDescriptor}|{complete:false;descriptor:null});

import {z} from 'zod';
const uuid=z.string().uuid().transform(value=>value.toLowerCase());
const revision=z.string().datetime({offset:true}).transform(value=>new Date(value).toISOString());
const minute=revision.refine(value=>Date.parse(value)%60_000===0,'Choose a whole minute');
const identity={operationId:uuid,shareId:uuid,sourceRevision:revision};
const intentIdentity={...identity,expectedActorId:z.string().min(1).max(200)};
export const sharedFeedDecisionInputSchema=z.discriminatedUnion('decision',[
 z.object({...intentIdentity,decision:z.literal('DISLIKE')}).strict(),
 z.object({...intentIdentity,decision:z.literal('LIKE'),approval:z.object({
  providers:z.array(z.enum(['telegram','max'])).min(1).max(2).refine(values=>new Set(values).size===values.length,'Duplicate provider'),
  scheduledAt:minute,inputMethod:z.enum(['button','gesture','keyboard']),
 }).strict()}).strict(),
]);
export type SharedFeedDecisionInput=z.infer<typeof sharedFeedDecisionInputSchema>;
export const sharedFeedDecisionReceiptSchema=z.discriminatedUnion('decision',[
 z.object({...identity,decision:z.literal('DISLIKE'),personalItemId:z.string().min(1).nullable(),postId:z.null(),scheduledAt:z.null()}).strict(),
 z.object({...identity,decision:z.literal('LIKE'),personalItemId:z.string().min(1),postId:z.string().min(1),scheduledAt:minute}).strict(),
]);
export type SharedFeedDecisionReceipt=z.infer<typeof sharedFeedDecisionReceiptSchema>;
export type SharedFeedDecisionResult={receipt:SharedFeedDecisionReceipt;replayed:boolean};

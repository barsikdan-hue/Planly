import { z } from 'zod';
export const swipeDislikeSchema=z.object({operationId:z.string().uuid().transform(v=>v.toLowerCase()),inputMethod:z.enum(['gesture','button','keyboard'])}).strict();
export type SwipeDislike=z.infer<typeof swipeDislikeSchema>;
export type SwipeDecisionMetadata={operationId:string;sourceId:string;sourceRevision:string;contentFingerprint:string;textLength:number;mediaTypes:string[];mediaCount:number;decision:'LIKE'|'DISLIKE';origin:'swipe-planner';inputMethod:SwipeDislike['inputMethod'];confirmedAt:string;providers:('telegram'|'max'|'vk')[];scheduledAt:string|null;resultPostId:string|null;sourceDeleted:boolean;resultDeleted:boolean};
export type SwipeFeedbackSnapshot={version:1;aggregate:{likes:number;dislikes:number;total:number;likeRatio:number|null};current:SwipeDecisionMetadata[];receipts:SwipeDecisionMetadata[]};

import type { ReviewInputMethod } from './swipe-motion.ts';
import type { LibraryItemDto } from '../contracts/library.ts';
import { savePostInputSchema, type Provider } from '../contracts/planner.ts';
import { blankPost, type ComposerPostInput } from '../planner.ts';
import { readPendingCreation, submitPendingCreation } from './pending-creation.ts';
import type { RecoveryStorage } from './editor-recovery.ts';
import {readPendingDislike} from './swipe-feedback.ts';
export type SwipeApproval = { mode: 'draft' | 'manual' | 'next'; providers: Provider[]; scheduledAt: string | null; inputMethod?: ReviewInputMethod };
export function buildSwipeApproval(item: LibraryItemDto, approval: SwipeApproval): ComposerPostInput {
  if (item.status !== 'READY' && item.status !== 'USED') throw new Error('Заготовка уже недоступна для одобрения. Обнови библиотеку.');
  if (approval.mode === 'draft' || !approval.providers.length || !approval.scheduledAt || !Number.isFinite(Date.parse(approval.scheduledAt)) || Date.parse(approval.scheduledAt) < Date.now()+60_000) throw new Error('Выбери площадку и время не раньше чем через минуту (МСК).');
  return { ...savePostInputSchema.parse({title:item.title,baseText:item.text,status:'READY',mediaIds:[...item.mediaIds],
    targets:approval.providers.map(provider=>({provider,textOverride:null,scheduledAt:approval.scheduledAt}))}),
    sourceLibraryItemId:item.id,sourceLibraryUpdatedAt:item.updatedAt,requireFreeSlot:true,swipeReview:{inputMethod:approval.inputMethod??'button'} };
}
export async function submitSwipeApproval(storage: RecoveryStorage, ownerId: string, item: LibraryItemDto, approval: SwipeApproval, isCurrent?: () => boolean) {
  if(readPendingCreation(storage,ownerId)||readPendingDislike(storage,ownerId)) throw new Error('Сначала восстанови предыдущее сохранение.');
  const input=buildSwipeApproval(item,approval);
  const editor={...blankPost(),text:item.text,sourceLibraryItemId:item.id,mediaIds:[...item.mediaIds],networks:[...approval.providers]};
  return submitPendingCreation(storage,ownerId,crypto.randomUUID(),editor,()=>input,'scheduled',{origin:'swipe-planner',isCurrent});
}
export async function retrySwipeApproval(storage: RecoveryStorage, ownerId: string, isCurrent?: () => boolean) {
  const pending=readPendingCreation(storage,ownerId);
  if(!pending || pending.origin!=='swipe-planner') throw new Error('Нет запроса Swipe Planner для восстановления.');
  return submitPendingCreation(storage,ownerId,pending.editorToken,pending.editor,()=>pending.input,pending.intent,{origin:'swipe-planner',isCurrent});
}

import type { LibraryItemDto } from '../contracts/library.ts';
import { savePostInputSchema, type Provider } from '../contracts/planner.ts';
import { blankPost, type ComposerPostInput } from '../planner.ts';
import { readPendingCreation, submitPendingCreation } from './pending-creation.ts';
import type { RecoveryStorage } from './editor-recovery.ts';
export type SwipeApproval = { mode: 'draft' | 'manual' | 'next'; providers: Provider[]; scheduledAt: string | null };
export function buildSwipeApproval(item: LibraryItemDto, approval: SwipeApproval): ComposerPostInput {
  if (item.status !== 'READY' || item.sourcePostId) throw new Error('Заготовка уже недоступна для одобрения. Обнови библиотеку.');
  const scheduled = approval.mode !== 'draft';
  if (scheduled && (!approval.providers.length || !approval.scheduledAt || !Number.isFinite(Date.parse(approval.scheduledAt)) || Date.parse(approval.scheduledAt) <= Date.now())) throw new Error('Выбери площадку и время в будущем (МСК).');
  return { ...savePostInputSchema.parse({title:item.title,baseText:item.text,status:scheduled?'READY':'DRAFT',mediaIds:[...item.mediaIds],
    targets:approval.providers.map(provider=>({provider,textOverride:null,scheduledAt:scheduled?approval.scheduledAt:null}))}),
    sourceLibraryItemId:item.id,sourceLibraryUpdatedAt:item.updatedAt,...(approval.mode==='next'?{requireFreeSlot:true}:{}) };
}
export async function submitSwipeApproval(storage: RecoveryStorage, ownerId: string, item: LibraryItemDto, approval: SwipeApproval) {
  if(readPendingCreation(storage,ownerId)) throw new Error('Сначала восстанови предыдущее сохранение.');
  const input=buildSwipeApproval(item,approval);
  const editor={...blankPost(),text:item.text,sourceLibraryItemId:item.id,mediaIds:[...item.mediaIds],networks:[...approval.providers]};
  return submitPendingCreation(storage,ownerId,crypto.randomUUID(),editor,()=>input,approval.mode==='draft'?'draft':'scheduled',{origin:'swipe-planner'});
}
export async function retrySwipeApproval(storage: RecoveryStorage, ownerId: string) {
  const pending=readPendingCreation(storage,ownerId);
  if(!pending || pending.origin!=='swipe-planner') throw new Error('Нет запроса Swipe Planner для восстановления.');
  return submitPendingCreation(storage,ownerId,pending.editorToken,pending.editor,()=>pending.input,pending.intent,{origin:'swipe-planner'});
}

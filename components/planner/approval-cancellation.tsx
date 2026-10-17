'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import type {Post} from '@/lib/planner';
import type {CancelApprovalInput} from '@/lib/contracts/planner';
import {PlanlyApiError} from '@/lib/client/planly-api';

export function ApprovalCancellation({target,isCurrent,onCancel}:{target:Post['targets'][number];isCurrent:()=>boolean;onCancel:(input:CancelApprovalInput)=>Promise<void>}) {
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const mounted=useRef(true),pending=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const preview=target.cancelApproval;
 if(!preview)return null;
 const available=preview.eligible && preview.reason==='AVAILABLE' && !!preview.expectedPublicationId && !!preview.expectedPublicationUpdatedAt && !!target.id;
 const cancelled=preview.reason==='ALREADY_CANCELLED' && !!target.approvalCancelledAt;
 if(!available && !cancelled && !error)return null;
 const run=async()=>{
  if(!available || pending.current || !isCurrent())return;
  pending.current=true;setBusy(true);setError('');
  try {
   await onCancel({expectedPublicationId:preview.expectedPublicationId!,expectedPublicationUpdatedAt:preview.expectedPublicationUpdatedAt!,expectedTargetUpdatedAt:preview.expectedTargetUpdatedAt,expectedBindingRevision:preview.expectedBindingRevision});
   if(mounted.current && isCurrent())setConfirm(false);
  }catch(e){if(mounted.current && isCurrent()){setConfirm(false);setError(e instanceof PlanlyApiError && e.status===409?'Данные изменились. Обновите публикацию и проверьте её состояние.':'Не удалось подтвердить отмену. Обновите публикацию перед повтором.');}}
  finally{pending.current=false;if(mounted.current && isCurrent())setBusy(false);}
 };
 return <section className="approval-cancellation" aria-label="Отмена согласования">
  <p>{preview.historicalDestinationId?`Историческое назначение: ${preview.historicalDestinationId}`:'Историческое назначение неизвестно.'}</p>
  {cancelled?<p role="status">Согласование отменено до отправки.</p>:available?<Button variant="outline" disabled={busy} onClick={()=>setConfirm(true)}>Отменить согласование</Button>:null}
  {cancelled && <p>Для новой публикации откройте копию, сохраните новый черновик и отдельно согласуйте отправку.</p>}
  {error && <p role="status">{error}</p>}
  <AlertDialog open={confirm} onOpenChange={value=>{if(!busy)setConfirm(value);}}><AlertDialogContent>
   <AlertDialogTitle>Отменить согласование для этого назначения?</AlertDialogTitle>
   <AlertDialogDescription>Будет отменено ожидающее согласование выбранного назначения. Текст, медиа и история сохранятся. Снятие резервирования выполняется отдельно в настройках.</AlertDialogDescription>
   <AlertDialogFooter><AlertDialogCancel disabled={busy}>Оставить согласование</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void run();}}>Отменить согласование</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </section>;
}

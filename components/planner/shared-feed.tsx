'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {SwipePlanner,type SwipeApproval} from './swipe-planner';
import type {LibraryItemDto} from '@/lib/contracts/library';
import type {SharedLibraryItemDto} from '@/lib/contracts/shared-library';
import type {SocialAccountDto} from '@/lib/contracts/planner';
import type {SlotQuery} from '@/lib/contracts/swipe-planner';
import {readSharedJournal,retrySharedDecision,submitSharedDecision,type SharedDecisionOutcome,type SharedJournalEntry} from '@/lib/client/shared-feed-recovery';
import type {SharedFeedDecisionInput} from '@/lib/contracts/shared-feed';
import type {Media} from '@/lib/planner';

type Owner={id:string;generation:object};
type Props={ownerContext:Owner;isOwnerCurrent:(owner:Owner)=>boolean;accounts:SocialAccountDto[];onPreview:(query:SlotQuery)=>Promise<{scheduledAt:string|null}>;onSaved:()=>Promise<void>;onClose:()=>void;onOpenPost:(id:string)=>void};
const feedSchema=z.object({items:z.array(z.object({id:z.string().uuid(),title:z.string().nullable(),text:z.string(),updatedAt:z.string().datetime({offset:true}),media:z.array(z.object({name:z.string(),mimeType:z.string(),previewUrl:z.string()}))}))});
const failure=(error:unknown)=>error instanceof Error?error.message:'Не удалось проверить результат. Повтори исходный запрос.';

export function SharedFeed({ownerContext,isOwnerCurrent,accounts,onPreview,onSaved,onClose,onOpenPost}:Props){
 const [initialJournal]=useState(()=>{try{return {pending:typeof window==='undefined'?[]:readSharedJournal(window.localStorage,ownerContext.id).pending,error:null};}catch(cause){return {pending:[],error:failure(cause)};}});
 const [items,setItems]=useState<SharedLibraryItemDto[]>([]),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[pending,setPending]=useState<SharedJournalEntry[]>(initialJournal.pending),[error,setError]=useState<string|null>(null),[journalError,setJournalError]=useState<string|null>(initialJournal.error),[notice,setNotice]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
 const mounted=useRef(false),locked=useRef(false);
 const current=useCallback(()=>mounted.current&&isOwnerCurrent(ownerContext),[isOwnerCurrent,ownerContext]);
 const readJournal=useCallback(()=>{
  if(!current())return;
  try{setPending(readSharedJournal(window.localStorage,ownerContext.id).pending);setJournalError(null);}catch(cause){setJournalError(failure(cause));}
 },[current,ownerContext.id]);
 useEffect(()=>{mounted.current=true;const changed=(event:StorageEvent)=>{if(event.storageArea===window.localStorage)readJournal();};window.addEventListener('storage',changed);return()=>{mounted.current=false;window.removeEventListener('storage',changed);};},[readJournal]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/shared-feed',{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error(response.status===401?'Сессия истекла. Войди снова.':'Не удалось загрузить готовые материалы.');
   const result=feedSchema.parse(await response.json());if(current()&&!controller.signal.aborted)setItems(result.items);
  }).catch(cause=>{if(current()&&!controller.signal.aborted)setError(failure(cause));}).finally(()=>{if(current()&&!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[current,refresh]);
 const cards=useMemo<LibraryItemDto[]>(()=>items.map(item=>({id:item.id,title:item.title,text:item.text,status:'READY',mediaIds:item.media.map((_,i)=>`${item.id}:${i}`),sourcePostId:null,createdAt:item.updatedAt,updatedAt:item.updatedAt})),[items]);
 const media=useMemo<Media[]>(()=>items.flatMap(item=>item.media.map((asset,i)=>({id:`${item.id}:${i}`,name:asset.name,url:asset.previewUrl,type:asset.mimeType,size:0}))),[items]);
 const finish=async(outcome:SharedDecisionOutcome)=>{
  if(!current())return {status:'stale'} as const;
  readJournal();
  if(outcome.status==='stale')return {status:'stale'} as const;
  if(outcome.status==='terminal'){setNotice('Результат предыдущего выбора удалён. Повторная копия не создана.');setRefresh(value=>value+1);return {status:'terminal'} as const;}
  setItems(values=>values.filter(value=>value.id!==outcome.receipt.shareId));
  setNotice(outcome.receipt.decision==='DISLIKE'?'Не нравится · скрыто только для тебя.':'Выбор подтверждён. Публикация в личном календаре.');
  try{await onSaved();}catch{if(current())setError('Выбор сохранён. Обнови страницу, чтобы перечитать календарь.');}
  if(!current())return {status:'stale'} as const;
  return outcome.receipt.postId?{id:outcome.receipt.postId,scheduledAt:outcome.receipt.scheduledAt,status:'confirmed' as const}:undefined;
 };
 const decide=async(item:LibraryItemDto,approval?:SwipeApproval)=>{
  if(!current())return {status:'stale'} as const;
  if(locked.current)throw Error('Проверяем предыдущий выбор.');
  const source=items.find(value=>value.id===item.id);if(!source)throw Error('Материал изменился. Обнови ленту.');
  let input:SharedFeedDecisionInput;
  if(approval){
   if(!approval.scheduledAt||approval.providers.some(provider=>provider!=='telegram'&&provider!=='max'))throw Error('Выбери Telegram или MAX и время публикации.');
   input={operationId:crypto.randomUUID(),shareId:source.id,sourceRevision:source.updatedAt,decision:'LIKE',approval:{providers:approval.providers as ('telegram'|'max')[],scheduledAt:approval.scheduledAt,inputMethod:approval.inputMethod??'button'}};
  }else input={operationId:crypto.randomUUID(),shareId:source.id,sourceRevision:source.updatedAt,decision:'DISLIKE'};
  locked.current=true;setWorking(true);setError(null);setNotice(null);
  try{return await finish(await submitSharedDecision(window.localStorage,ownerContext.id,input,current));}
  catch(cause){if(current()){setError(failure(cause));if([404,409].includes((cause as {status?:number}).status??0))setRefresh(value=>value+1);}throw cause;}
  finally{locked.current=false;if(current()){setWorking(false);readJournal();}}
 };
 const recover=async(entry:SharedJournalEntry)=>{
  if(!current()||locked.current)return;
  locked.current=true;setWorking(true);setError(null);
  try{await finish(await retrySharedDecision(window.localStorage,ownerContext.id,entry.input.operationId,current));}
  catch(cause){if(current())setError(failure(cause));}
  finally{locked.current=false;if(current()){setWorking(false);readJournal();}}
 };
 return <div className="shared-feed">
  {error&&<p className="notice error" role="alert">{error}</p>}
  {journalError&&<p className="notice error" role="alert">{journalError}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  {pending.map(entry=><div className="notice" key={entry.input.operationId}><p>Предыдущий выбор пока не подтверждён. Проверка использует сохранённый запрос.</p><Button disabled={working||!!journalError} onClick={()=>{void recover(entry);}}>Проверить результат выбора</Button></div>)}
  <Button variant="outline" disabled={working||loading} onClick={()=>{setError(null);setRefresh(value=>value+1);readJournal();}}>Обновить ленту</Button>
  {loading?<p role="status">Открываем готовый контент…</p>:<SwipePlanner origin="dashboard" items={cards} media={media} socialAccounts={accounts} providerOptions={['telegram','max']} editable={false} busy={working||!!journalError||!!error} pending={pending.length>0} presentation={{heading:'Готовый контент',description:'Материалы редакции для твоих соцсетей. «В календарь» создаст личную публикацию на выбранное время.',rejected:'Не нравится · скрыто только для тебя',empty:'Пока нет новых материалов редакции'}} onPreview={onPreview} onApprove={decide} onReject={item=>decide(item)} onEdit={()=>{}} onClose={onClose} onOpenPost={onOpenPost}/>}
 </div>;
}

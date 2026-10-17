'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {LibraryItemDto} from '@/lib/contracts/library';
import type {SocialAccountDto} from '@/lib/contracts/planner';
import type {LibraryBatchPreview,LibraryBatchCommitResult} from '@/lib/contracts/library-batch';
import {planSettingsSchema,type PlanSettings} from '@/lib/contracts/scheduling-plan';
import {loadLibraryBatchEligibility,previewLibraryBatchRequest,commitLibraryBatchRequest,loadLibraryBatchOperation,PlanlyApiError} from '@/lib/client/planly-api';
import {acceptLibraryBatchResult,makePendingLibraryBatch,readPendingLibraryBatch,resolveLibraryBatchError,submitLibraryBatch,validateLibraryBatchPreview,type LibraryBatchRecovery,type PendingLibraryBatch} from '@/lib/library-batch-recovery';
import {Button} from '@/components/ui/button';

type OwnerContext={id:string;generation:object};
type Props={ownerContext:OwnerContext;isOwnerCurrent:(owner:OwnerContext)=>boolean;items:LibraryItemDto[];accounts:SocialAccountDto[];onSaved:(result:LibraryBatchCommitResult)=>Promise<void>};
const defaults=():PlanSettings=>{const startDate=new Date(Date.now()+3*3600000).toISOString().slice(0,10);return {startDate,endDate:new Date(Date.parse(`${startDate}T12:00:00Z`)+6*86400000).toISOString().slice(0,10),weekdays:[1,2,3,4,5,6,7],times:['10:00']};};
const dateLabel=(value:string)=>new Date(value).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'});
const safeMessage=(error:unknown)=>error instanceof PlanlyApiError?'Не удалось подтвердить результат. Проверь исходное сохранение.':error instanceof Error?error.message:'Не удалось проверить набор.';

export function LibraryBatch({ownerContext,isOwnerCurrent,items,accounts,onSaved}:Props){
 const [expanded,setExpanded]=useState(false),[eligible,setEligible]=useState(false),[eligibilityError,setEligibilityError]=useState(false);
 const [recovery,setRecovery]=useState<LibraryBatchRecovery>({pending:null,blocked:true});
 const [sourceIds,setSourceIds]=useState<string[]>([]),[accountIds,setAccountIds]=useState<string[]>([]),[settings,setSettings]=useState(defaults),[times,setTimes]=useState('10:00');
 const [preview,setPreview]=useState<LibraryBatchPreview|null>(null),[previewSignature,setPreviewSignature]=useState(''),[previewToken,setPreviewToken]=useState(0),[previewing,setPreviewing]=useState(false),[busy,setBusy]=useState(false);
 const [previewDeadline,setPreviewDeadline]=useState(0);
 const [loaded,setLoaded]=useState<string[]>([]),[mediaError,setMediaError]=useState(false),[error,setError]=useState<string|null>(null),[result,setResult]=useState<LibraryBatchCommitResult|null>(null),[refreshError,setRefreshError]=useState(false),[lookupFailed,setLookupFailed]=useState(false);
 const mounted=useRef(false),mutex=useRef(false),revision=useRef(0),heading=useRef<HTMLHeadingElement>(null);
 const active=()=>mounted.current&&isOwnerCurrent(ownerContext);
 const signature=JSON.stringify({sourceIds,accountIds,settings,items:items.filter(i=>sourceIds.includes(i.id)),accounts:accounts.filter(a=>accountIds.includes(a.id))});
 const currentSignature=useRef(signature);
 useLayoutEffect(()=>{currentSignature.current=signature;},[signature]);
 const sync=()=>{if(!active())return {pending:null,blocked:true};let found:LibraryBatchRecovery;try{found=readPendingLibraryBatch(window.localStorage,ownerContext.id);}catch{found={pending:null,blocked:true};}setRecovery(found);return found;};
 useEffect(()=>{
  mounted.current=true;let live=true;
  Promise.resolve().then(()=>{if(live&&active())sync();});
  loadLibraryBatchEligibility().then(value=>{if(live&&active()){setEligible(value?.eligible===true);setEligibilityError(typeof value?.eligible!=='boolean');}}).catch(()=>{if(live&&active())setEligibilityError(true);});
  const storage=()=>{if(active()){revision.current++;setPreview(null);sync();}};window.addEventListener('storage',storage);
  return()=>{live=false;mounted.current=false;window.removeEventListener('storage',storage);};
  // The owner generation is remounted by App; every asynchronous result is fenced.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ownerContext,isOwnerCurrent]);
 useEffect(()=>{
  if(!previewToken||!previewDeadline)return;
  const timer=setTimeout(()=>{if(mounted.current&&isOwnerCurrent(ownerContext)&&revision.current===previewToken){revision.current++;setPreview(null);setError('Срок предпросмотра истёк. Обнови его перед подтверждением.');}},Math.max(0,previewDeadline-Date.now()));
  return()=>clearTimeout(timer);
 },[previewToken,previewDeadline,ownerContext,isOwnerCurrent]);
 const change=(action:()=>void)=>{if(!active()||mutex.current)return;revision.current++;setPreview(null);setPreviewing(false);setError(null);action();};
 const select=(id:string,checked:boolean)=>change(()=>setSourceIds(current=>checked?current.length<20?[...current,id]:current:current.filter(v=>v!==id)));
 const move=(id:string,offset:number)=>change(()=>setSourceIds(current=>{const next=[...current],i=next.indexOf(id),j=i+offset;if(i>=0&&j>=0&&j<next.length)[next[i],next[j]]=[next[j],next[i]];return next;}));
 const getPreview=async()=>{
  if(!active()||mutex.current||!eligible||sync().blocked)return;
  const parsed=planSettingsSchema.safeParse(settings);if(!parsed.success||!sourceIds.length||!accountIds.length){setError('Выбери 1–20 заготовок, 1–2 площадки и конечный период со временем HH:MM.');return;}
  const requestRevision=++revision.current,sentSignature=currentSignature.current,deadline=Date.now()+600_000,input={sourceIds:[...sourceIds],accountIds:[...accountIds],settings:parsed.data};setPreview(null);setPreviewing(true);setError(null);setMediaError(false);setLoaded([]);
  try{const raw=await previewLibraryBatchRequest(input);if(!active()||revision.current!==requestRevision||currentSignature.current!==sentSignature)return;
   if(!raw.complete){setError('Не все заготовки доступны или для них недостаточно слотов.');return;}
   const validated=await validateLibraryBatchPreview(raw,input);if(Date.now()>=deadline)throw Error('Срок предпросмотра истёк. Обнови его перед подтверждением.');if(active()&&revision.current===requestRevision&&currentSignature.current===sentSignature){setPreview(validated);setPreviewSignature(sentSignature);setPreviewToken(requestRevision);setPreviewDeadline(deadline);}
  }catch(failure){if(active()&&revision.current===requestRevision)setError(safeMessage(failure));}
  finally{if(active()&&revision.current===requestRevision)setPreviewing(false);}
 };
 const refresh=async(saved:LibraryBatchCommitResult)=>{if(!active())return;setRefreshError(false);try{await onSaved(saved);}catch{if(active())setRefreshError(true);}};
 const failure=(pending:PendingLibraryBatch,cause:unknown,fromCommit:boolean)=>{
  if(!active())return;let resolved='uncertain';try{if(cause instanceof PlanlyApiError)resolved=resolveLibraryBatchError(window.localStorage,pending,cause.status,cause.body,active,fromCommit);}catch{/* Unavailable recovery storage keeps the operation unresolved. */}
  setError(resolved==='no-commit'?'Сохранение не применено. Обнови предпросмотр и подтверди новый набор.':resolved==='deleted'?null:safeMessage(cause));setPreview(null);sync();
 };
 const send=async(pending:PendingLibraryBatch)=>{
  try{const saved=await submitLibraryBatch(window.localStorage,pending,async input=>{if(!active())throw Error('Окно больше не активно.');return commitLibraryBatchRequest(input);},active);if(active()){setResult(saved);setPreview(null);setSourceIds([]);sync();await refresh(saved);}}
  catch(cause){if(active())failure(pending,cause,true);}
  finally{mutex.current=false;if(active())setBusy(false);}
 };
 const requiredMedia=preview?.rows.flatMap(r=>r.item.mediaIds)??[];
 const canConfirm=eligible&&!recovery.blocked&&!busy&&!previewing&&preview?.complete===true&&previewSignature===signature&&!mediaError&&requiredMedia.every(id=>loaded.includes(id));
 const confirm=async()=>{if(!active()||mutex.current||!canConfirm||!preview?.complete||sync().blocked)return;if(Date.now()>=previewDeadline){revision.current++;setPreview(null);setError('Срок предпросмотра истёк. Обнови его перед подтверждением.');return;}mutex.current=true;setBusy(true);setError(null);await send(makePendingLibraryBatch(ownerContext.id,crypto.randomUUID(),preview.descriptor));};
 const lookup=async()=>{
  if(!active()||mutex.current)return;const pending=sync().pending;if(!pending||pending.terminal)return;mutex.current=true;setBusy(true);setLookupFailed(false);setError(null);
  try{const raw=await loadLibraryBatchOperation(pending.input.operationId);if(!active())return;const saved=await acceptLibraryBatchResult(window.localStorage,pending,raw,active);if(active()){setResult(saved);sync();await refresh(saved);}}
  catch(cause){if(active()){failure(pending,cause,false);setLookupFailed(true);}}
  finally{mutex.current=false;if(active())setBusy(false);}
 };
 const retry=async()=>{if(!active()||mutex.current)return;const pending=sync().pending;if(!pending||pending.terminal)return;mutex.current=true;setBusy(true);setError(null);await send(pending);};
 const open=()=>{if(!active())return;setExpanded(true);requestAnimationFrame(()=>{if(active())heading.current?.focus();});};
 if(!expanded)return eligible||recovery.blocked?<div className="library-batch-entry"><Button variant="outline" onClick={open}>{recovery.blocked?'Проверить набор':'Запланировать набор'}</Button></div>:eligibilityError?<p className="mini-note" role="status">Проверка доступности набора временно недоступна.</p>:null;
 const ownReady=items.filter(i=>i.status==='READY'&&!i.sourcePostId),usable=accounts.filter(a=>['telegram','max'].includes(a.provider)&&a.enabled&&a.connectionStatus==='CONNECTED'&&a.connection?.mode==='verified-user'&&a.connection.state==='enabled'&&a.connection.ready);
 return <section className="library-batch scheduling-plan" aria-label="Набор из библиотеки">
  <div className="page-heading"><h2 ref={heading} tabIndex={-1}>Набор из библиотеки</h2><Button variant="outline" disabled={busy} onClick={()=>{if(active()&&!mutex.current){revision.current++;setExpanded(false);setPreview(null);}}}>Закрыть набор</Button></div>
  <p>Один конечный набор из 1–20 личных готовых заготовок. Одинаковые выбранные площадки для всех постов. Время — Москва.</p>
  <p>Сохранено — не означает отправлено.</p><p className="mini-note">Бесплатный сервис может задержать публикацию. Новые заготовки не включаются автоматически. Если данные браузера очищены, сначала проверь календарь.</p>
  <p className="mini-note">Отмена — только для поста целиком через существующий редактор до любой попытки публикации. После начала или частичной отправки отмена не гарантируется; отмены отдельной площадки здесь нет.</p>
  {recovery.blocked&&<aside className="scheduling-warning" role="status"><strong>Сначала проверь исходное сохранение</strong>{recovery.pending?<><p>Новый ключ не создаётся. Исходный набор: {recovery.pending.input.intent.rows.length} постов.</p><ol>{recovery.pending.input.intent.rows.map(r=><li key={r.sourceId}>{r.sourceId} · {dateLabel(r.targets[0].scheduledAt)}{r.targets.map(t=><div key={t.accountId}>{t.provider} · {t.destinationId}</div>)}</li>)}</ol>{recovery.pending.terminal?<p>Исторический результат удалён. Повторное создание этого набора запрещено.</p>:<><Button disabled={busy} onClick={()=>void lookup()}>Проверить исходное сохранение</Button>{lookupFailed&&<Button variant="outline" disabled={busy} onClick={()=>void retry()}>Повторить исходное сохранение</Button>}</>}</>:<p>Данные восстановления повреждены или недоступны. Проверь календарь; новый набор заблокирован.</p>}</aside>}
  {result&&<aside className="scheduling-success" role="status"><strong>Набор сохранён: {result.receipt.rows.length} поста</strong><p>{result.replayed?'Это исторический результат; текущие посты могли измениться.':'Посты сохранены в календаре.'}</p><ul>{result.receipt.rows.map(r=><li key={r.postId}>{r.postId} · {dateLabel(r.targets[0].scheduledAt)}</li>)}</ul>{refreshError&&<p>Календарь не обновился; набор уже сохранён.</p>}<Button variant="outline" onClick={()=>void refresh(result)}>Обновить календарь</Button></aside>}
  {!eligible&&<p role="status">Новые наборы доступны только подходящему USER. Исторический результат можно проверить выше.</p>}
  {error&&<p role="alert">{error}</p>}
  <fieldset className="library-batch-controls" disabled={busy||recovery.blocked||!eligible}><legend>Состав и свободные слоты</legend>
   <div className="scheduling-discovery-list">{ownReady.map(item=><label key={item.id}><input aria-label={`Выбрать заготовку ${item.id}`} type="checkbox" checked={sourceIds.includes(item.id)} disabled={!sourceIds.includes(item.id)&&sourceIds.length>=20} onChange={e=>select(item.id,e.target.checked)}/>{item.title||item.text.slice(0,100)||item.id}</label>)}{!ownReady.length&&<p>Нет готовых личных заготовок без публикации.</p>}</div>
   <h3>Выбрано {sourceIds.length} из 20 · порядок публикации</h3><ol className="library-batch-order">{sourceIds.map((id,i)=><li key={id}><span>{items.find(item=>item.id===id)?.title||id}</span><Button variant="outline" disabled={i===0} aria-label={`Выше ${id}`} onClick={()=>move(id,-1)}>↑</Button><Button variant="outline" disabled={i===sourceIds.length-1} aria-label={`Ниже ${id}`} onClick={()=>move(id,1)}>↓</Button></li>)}</ol>
   <div className="scheduling-weekdays">{usable.map(a=><label key={a.id}><input aria-label={`Площадка ${a.displayName}`} type="checkbox" checked={accountIds.includes(a.id)} onChange={e=>change(()=>setAccountIds(current=>e.target.checked&&current.length<2?[...current,a.id]:current.filter(id=>id!==a.id)))}/>{a.displayName} · {a.providerAccountId}</label>)}{!usable.length&&<p>Подключи и включи собственные Telegram/MAX в настройках.</p>}</div>
   <div className="scheduling-settings"><label>С даты<input aria-label="Начало периода" type="date" value={settings.startDate} onChange={e=>change(()=>setSettings({...settings,startDate:e.target.value}))}/></label><label>По дату<input aria-label="Конец периода" type="date" value={settings.endDate} onChange={e=>change(()=>setSettings({...settings,endDate:e.target.value}))}/></label><label>Время через запятую<input aria-label="Время слотов" value={times} onChange={e=>change(()=>{setTimes(e.target.value);setSettings({...settings,times:e.target.value.split(',').map(t=>t.trim())});})}/></label><div className="scheduling-weekdays">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i)=><label key={d}><input type="checkbox" checked={settings.weekdays.includes(i+1)} onChange={e=>change(()=>setSettings({...settings,weekdays:e.target.checked?[...settings.weekdays,i+1]:settings.weekdays.filter(v=>v!==i+1)}))}/>{d}</label>)}</div></div>
   <Button disabled={previewing||!sourceIds.length||!accountIds.length} onClick={()=>void getPreview()}>{previewing?'Проверяем…':'Предпросмотр набора'}</Button>
  </fieldset>
  {preview&&<div className="library-batch-preview"><h3>Полный предпросмотр · {preview.rows.length} постов</h3>{preview.rows.map((row,i)=><article key={row.item.id}><h4>{i+1}. {row.item.title||'Без названия'}</h4><p>{row.scheduledAt?`${dateLabel(row.scheduledAt)} МСК`:'Свободный слот не найден'}</p><p className="library-batch-text">{row.item.text}</p><div className="library-batch-media">{row.item.mediaIds.map(id=>{const media=preview.media.find(m=>m.id===id);if(!media)return <p role="alert" key={id}>Медиа недоступны</p>;const ready=()=>{if(active()&&revision.current===previewToken&&currentSignature.current===previewSignature)setLoaded(current=>current.includes(id)?current:[...current,id]);};const failed=()=>{if(active()&&revision.current===previewToken&&currentSignature.current===previewSignature)setMediaError(true);};return media.mimeType.startsWith('video/')?<video key={id} src={media.previewUrl} controls preload="auto" onLoadedData={ready} onError={failed} aria-label={media.originalName}/>:<img key={id} src={media.previewUrl} alt={media.originalName} onLoad={ready} onError={failed}/>;})}</div><ul>{row.accounts.map(a=><li key={a.id}>{a.provider.toUpperCase()} · {a.displayName} · {a.providerAccountId} · {a.id}</li>)}</ul>{row.issue&&<p role="alert">Заготовка недоступна: {row.issue}</p>}</article>)}</div>}
  {mediaError&&<p role="alert">Медиа не загрузились. Обнови предпросмотр.</p>}
  <Button disabled={!canConfirm} onClick={()=>void confirm()}>Подтвердить и сохранить {preview?.rows.length??sourceIds.length} поста</Button>
 </section>;
}

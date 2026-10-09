'use client';
import {useEffect,useRef,useState} from 'react';
import type {PostDto} from '@/lib/contracts/planner';
import {planSettingsSchema,type PlanSettings,type SchedulingPlanCommitResult} from '@/lib/contracts/scheduling-plan';
import {loadSchedulingDrafts,previewSchedulingPlanRequest,commitSchedulingPlanRequest,type MediaAssetWithPreview} from '@/lib/client/planly-api';
import {initialSchedulingPlanState,reduceSchedulingPlan,canConfirmSchedulingPlan,type SchedulingPlanEvent,type SchedulingPlanState} from '@/lib/client/scheduling-plan-state';
import {readPendingSchedulingPlans,submitPendingSchedulingPlan,type PendingSchedulingPlan,type SchedulingRecoveryRead} from '@/lib/client/scheduling-plan-recovery';
import {slotPresets} from '@/lib/planner-slots';
import {Button} from '@/components/ui/button';

type OwnerContext={id:string;generation:object};
type Props={ownerContext:OwnerContext;isOwnerCurrent:(context:OwnerContext)=>boolean;media:MediaAssetWithPreview[];onSaved:(result:SchedulingPlanCommitResult)=>Promise<void>;onClose:()=>void};
const label=(iso:string)=>new Date(iso).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'});
const issueLabels={POST_INELIGIBLE:'Пост больше не является доступным черновиком',ACCOUNT_UNAVAILABLE:'Площадка отключена или требует подключения',CONTENT_INVALID:'Содержимое не подходит для выбранной площадки',NO_SLOT:'Недостаточно свободных слотов'};
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось проверить план. Обнови предпросмотр.';
const defaults=():PlanSettings=>{const startDate=new Date(Date.now()+3*3600000).toISOString().slice(0,10);return{startDate,endDate:new Date(Date.parse(`${startDate}T12:00:00Z`)+6*86400000).toISOString().slice(0,10),weekdays:[1,2,3,4,5,6,7],times:['10:00']};};

export function SchedulingPlan({ownerContext,isOwnerCurrent,onSaved,onClose}:Props) {
  const [state,setState]=useState<SchedulingPlanState>(()=>({...initialSchedulingPlanState(),settings:defaults()}));
  const stateRef=useRef(state);
  const [drafts,setDrafts]=useState<PostDto[]>([]);
  const [query,setQuery]=useState('');
  const [network,setNetwork]=useState('all');
  const [recovery,setRecovery]=useState<SchedulingRecoveryRead>({pending:[],blocked:false});
  const [refreshError,setRefreshError]=useState(false);
  const [refreshBusy,setRefreshBusy]=useState(false);
  const [timesText,setTimesText]=useState('10:00');
  const [settingsError,setSettingsError]=useState<string|null>(null);
  const mounted=useRef(false),locked=useRef(false);
  const active=()=>mounted.current&&isOwnerCurrent(ownerContext);
  const dispatch=(event:SchedulingPlanEvent)=>{const next=reduceSchedulingPlan(stateRef.current,event);stateRef.current=next;setState(next);return next;};
  const enumerate=()=>{
    if(!active())return {pending:[],blocked:true};
    let found:SchedulingRecoveryRead;
    try{found=readPendingSchedulingPlans(window.localStorage,ownerContext.id);}catch{found={pending:[],blocked:true};}
    setRecovery(found);dispatch({type:'RECOVERY',blocked:found.blocked});return found;
  };
  useEffect(()=>{
    mounted.current=true;let current=true;
    Promise.resolve().then(()=>{if(current&&active())enumerate();});
    loadSchedulingDrafts().then(items=>{if(current&&active())setDrafts(items);}).catch(error=>{if(current&&active())dispatch({type:'ERROR',message:message(error)});});
    const sync=()=>{if(active())enumerate();};window.addEventListener('storage',sync);
    return()=>{current=false;mounted.current=false;window.removeEventListener('storage',sync);};
    // A new owner generation remounts this panel through its App key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ownerContext,isOwnerCurrent]);
  const select=(id:string,checked:boolean)=>{
    if(!active()||locked.current)return;
    const ids=stateRef.current.postIds;
    if(checked&&!ids.includes(id)&&ids.length<20)dispatch({type:'SELECT',postIds:[...ids,id]});
    if(!checked)dispatch({type:'SELECT',postIds:ids.filter(v=>v!==id)});
  };
  const move=(id:string,direction:number)=>{if(!active()||locked.current)return;const ids=[...stateRef.current.postIds];const i=ids.indexOf(id),j=i+direction;if(i<0||j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];dispatch({type:'SELECT',postIds:ids});};
  const settings=(next:PlanSettings)=>{if(!active()||locked.current)return;dispatch({type:'SETTINGS',settings:next});};
  const getPreview=async()=>{
    if(!active()||locked.current||!stateRef.current.settings||!stateRef.current.postIds.length)return;
    const validated=planSettingsSchema.safeParse(stateRef.current.settings);
    if(!validated.success||settingsError){dispatch({type:'ERROR',message:'Проверь даты, дни недели и время (до 4 значений HH:MM).'});return;}
    const start=dispatch({type:'PREVIEW_START',revision:stateRef.current.revision});
    try{const preview=await previewSchedulingPlanRequest({postIds:start.postIds,settings:validated.data});if(active())dispatch({type:'PREVIEW_RECEIVED',revision:start.revision,preview});}
    catch(error){if(active()&&stateRef.current.requestRevision===start.revision)dispatch({type:'ERROR',message:message(error)});}
  };
  const refresh=async(result:SchedulingPlanCommitResult)=>{
    if(!active())return;setRefreshBusy(true);setRefreshError(false);
    try{await onSaved(result);if(active()){const items=await loadSchedulingDrafts();if(active())setDrafts(items);}}
    catch{if(active())setRefreshError(true);}
    finally{if(active())setRefreshBusy(false);}
  };
  const send=async(pending:PendingSchedulingPlan)=>{
    try{
      const result=await submitPendingSchedulingPlan(window.localStorage,pending,async input=>{
        if(!active())throw new Error('Окно больше не активно.');
        const response=await commitSchedulingPlanRequest(input);
        if(!active())throw new Error('Результат нужно проверить в исходном аккаунте.');
        return response;
      });
      if(active()){dispatch({type:'COMMITTED',result});enumerate();await refresh(result);}
    }catch(error){if(active()){dispatch({type:'ERROR',message:message(error)});enumerate();}}
    finally{locked.current=false;}
  };
  const confirm=async()=>{
    if(!active()||locked.current||!canConfirmSchedulingPlan(stateRef.current)||enumerate().blocked)return;
    const current=stateRef.current;if(!current.preview||!current.settings)return;
    locked.current=true;dispatch({type:'COMMIT_START'});
    const operationId=crypto.randomUUID();
    await send({version:1,ownerId:ownerContext.id,operationId,input:{operationId,settings:current.settings,rows:current.preview.rows.map(row=>({postId:row.post.id,fingerprint:row.fingerprint!,scheduledAt:row.scheduledAt!,reviewed:true}))}});
  };
  const retry=async(pending:PendingSchedulingPlan)=>{
    if(!active()||locked.current)return;
    const found=enumerate().pending.find(p=>p.operationId===pending.operationId);if(!found)return;
    locked.current=true;setState(current=>({...current,committing:true}));stateRef.current={...stateRef.current,committing:true};await send(found);
  };
  const closed=()=>{if(!active()||locked.current)return;mounted.current=false;onClose();};
  const currentSettings=state.settings!;
  const visible=drafts.filter(p=>p.status==='DRAFT'&&(network==='all'||p.targets.some(t=>t.provider===network))&&`${p.title??''} ${p.baseText}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="scheduling-plan" aria-label="Распределить по слотам">
    <div className="page-heading"><div><h1>Распределить по слотам</h1><p>Выбери существующие черновики Telegram/MAX и проверь каждый пост перед сохранением.</p></div><Button variant="outline" onClick={closed} disabled={state.committing}>Закрыть</Button></div>
    <p>Время — Москва. На бесплатном сервисе публикации могут задерживаться.</p>
    <p className="mini-note">Если данные браузера были очищены, сначала проверь календарь: сохранённый план мог уже примениться.</p>
    {recovery.blocked&&<aside role="status" className="scheduling-warning"><strong>Сначала проверь незавершённые сохранения</strong><p>Новый план заблокирован. Повтор ниже проверит исходный ключ и исходные посты.</p>{recovery.pending.map(p=><div key={p.operationId}><p>{p.operationId} · {p.input.rows.length} постов</p><ul>{p.input.rows.map(row=><li key={row.postId}>{row.postId} · {label(row.scheduledAt)}</li>)}</ul><Button disabled={state.committing} onClick={()=>retry(p)}>Проверить сохранение {p.operationId}</Button></div>)}{!recovery.pending.length&&<p>Данные восстановления недоступны. Проверь календарь; не создавай заменяющее сохранение.</p>}</aside>}
    {state.result&&<aside role="status" className="scheduling-success"><strong>{state.result.replayed ? 'Результат предыдущего сохранения' : 'План сохранён'}: {state.result.receipt.rows.length} постов</strong><p>Сохранено {label(state.result.receipt.appliedAt)}</p>{state.result.replayed && <p>Текущие посты могли быть изменены или удалены. Это результат предыдущей операции; проверь календарь.</p>}<ul>{state.result.receipt.rows.map(row=><li key={row.postId}>{row.postId} · {label(row.scheduledAt)}</li>)}</ul>{refreshError&&<p>Не удалось обновить календарь. План уже сохранён.</p>}<Button disabled={refreshBusy} onClick={()=>refresh(state.result!)}>Обновить календарь</Button></aside>}
    {state.error&&<p role="alert">{state.error} Обнови предпросмотр и проверь содержание снова.</p>}
    <fieldset disabled={state.committing||recovery.blocked} className="scheduling-settings"><legend>Свободные слоты</legend>
      <label>Пресет<select aria-label="Пресет слотов" defaultValue="daily10" onChange={e=>{const preset=slotPresets[e.target.value as keyof typeof slotPresets];if(preset){setTimesText(preset.times.join(', '));setSettingsError(null);settings({...currentSettings,...preset});}}}><option value="daily10">Ежедневно 10:00</option><option value="weekdays10">Будни 10:00</option><option value="daily10and18">Ежедневно 10:00 и 18:00</option></select></label>
      <label>С даты<input aria-label="Начало периода" type="date" value={currentSettings.startDate} onChange={e=>settings({...currentSettings,startDate:e.target.value})}/></label>
      <label>По дату<input aria-label="Конец периода" type="date" value={currentSettings.endDate} onChange={e=>settings({...currentSettings,endDate:e.target.value})}/></label>
      <label>Время через запятую<input aria-label="Время слотов" value={timesText} onChange={e=>{setTimesText(e.target.value);const times=e.target.value.split(',').map(t=>t.trim());const next={...currentSettings,times};setSettingsError(times.length>=1&&times.length<=4&&times.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))&&new Set(times).size===times.length?null:'Проверь время');settings(next);}}/></label>
      <div className="scheduling-weekdays">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day,i)=><label key={day}><input type="checkbox" checked={currentSettings.weekdays.includes(i+1)} onChange={e=>settings({...currentSettings,weekdays:e.target.checked?[...currentSettings.weekdays,i+1]:currentSettings.weekdays.filter(d=>d!==i+1)})}/>{day}</label>)}</div>
    </fieldset>
    <div className="scheduling-discovery"><label>Поиск<input aria-label="Поиск черновиков" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Площадка<select aria-label="Фильтр черновиков" value={network} onChange={e=>setNetwork(e.target.value)}><option value="all">Все</option><option value="telegram">Telegram</option><option value="max">MAX</option></select></label></div>
    <div className="scheduling-discovery-list">{visible.map(p=><label key={p.id}><input aria-label={`Выбрать ${p.id}`} type="checkbox" checked={state.postIds.includes(p.id)} disabled={state.committing||recovery.blocked||(!state.postIds.includes(p.id)&&state.postIds.length>=20)} onChange={e=>select(p.id,e.target.checked)}/>{p.title||p.baseText.slice(0,100)||p.id}</label>)}{!visible.length&&<p>Черновики не найдены. Фильтр не меняет выбранные посты.</p>}</div>
    <h2>Выбрано {state.postIds.length} из 20</h2>
    <ol className="scheduling-selection">{state.postIds.map((id,i)=><li key={id}>{drafts.find(p=>p.id===id)?.title||id}<Button variant="outline" disabled={state.committing||i===0} onClick={()=>move(id,-1)}>Выше {id}</Button><Button variant="outline" disabled={state.committing||i===state.postIds.length-1} onClick={()=>move(id,1)}>Ниже {id}</Button><Button variant="ghost" disabled={state.committing} onClick={()=>select(id,false)}>Убрать {id}</Button></li>)}</ol>
    <Button variant="outline" disabled={state.committing||state.previewBusy||recovery.blocked||!state.postIds.length} onClick={getPreview}>Обновить предпросмотр</Button>
    {state.previewBusy&&<p role="status">Проверяю слоты и черновики…</p>}
    <div className="scheduling-review">{state.preview?.rows.map(row=><article key={row.post.id} className="scheduling-review-row"><h2>{row.post.title||row.post.id}</h2><p className="scheduling-full-text">{row.post.baseText}</p>{row.post.targets.map(target=><section key={target.id}><h3>{target.provider==='telegram'?'Telegram':'MAX'} · {row.accounts.find(a=>a.id===target.socialAccountId)?.displayName}</h3><p>Адресат: {row.accounts.find(a=>a.id===target.socialAccountId)?.providerAccountId}</p><p className="scheduling-full-text">{target.textOverride??row.post.baseText}</p></section>)}<div className="scheduling-media">{row.post.mediaIds.map(id=>{const asset=state.preview?.media.find(m=>m.id===id);return asset?<figure key={id}>{asset.mimeType.startsWith('video/')?<video controls src={asset.previewUrl} onError={()=>dispatch({type:'ERROR',message:'Медиа недоступно. Обнови предпросмотр.'})}/>:<img src={asset.previewUrl} alt={asset.originalName} onError={()=>dispatch({type:'ERROR',message:'Медиа недоступно. Обнови предпросмотр.'})}/>}<figcaption>{asset.originalName}</figcaption></figure>:<p role="alert" key={id}>Медиа недоступно. Обнови предпросмотр.</p>;})}</div><p>{row.scheduledAt?label(row.scheduledAt):'Слот не назначен'}</p>{row.issue&&<p role="alert">{issueLabels[row.issue]}</p>}<label><input aria-label={`Содержание проверено ${row.post.id}`} type="checkbox" disabled={state.committing||!!row.issue||!row.scheduledAt||row.post.mediaIds.some(id=>!state.preview?.media.some(m=>m.id===id))} checked={!!row.fingerprint&&state.reviewed[row.post.id]===row.fingerprint} onChange={e=>{if(active()&&!locked.current)dispatch({type:'REVIEW',postId:row.post.id,checked:e.target.checked});}}/>Содержание проверено</label></article>)}</div>
    <Button className="action" disabled={!canConfirmSchedulingPlan(state)||!!settingsError} onClick={confirm}>Запланировать {state.postIds.length} постов</Button>
  </section>;
}

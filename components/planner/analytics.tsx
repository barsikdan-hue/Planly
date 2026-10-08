'use client';
import {useEffect,useRef,useState} from 'react';
import type {AnalyticsDto,AnalyticsProvider,AnalyticsRow} from '../../lib/contracts/analytics';
import {loadAnalytics,refreshAnalytics} from '../../lib/client/planly-api';
import {isAnalyticsSelectionCurrent,type AnalyticsOwnerContext,type AnalyticsSelection} from '../../lib/client/analytics-state';
import {safeAnalyticsUrl} from '../../lib/analytics';
import {AnalyticsSummary} from './analytics-summary';

const collectionErrors={ACCESS_DENIED:'нет доступа к публикации',NOT_FOUND_OR_INACCESSIBLE:'публикация не найдена или недоступна',RATE_LIMITED:'площадка временно ограничила запросы',UNAVAILABLE:'площадка временно недоступна',INVALID_RESPONSE:'площадка не подтвердила данные'};
const date=(value:string)=>new Date(value).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'});
function ResultRow({row,provider,asOf}:{row:AnalyticsRow;provider:AnalyticsProvider;asOf:string}) {
  const href=safeAnalyticsUrl(row.providerUrl,provider);
  return <tr><td>{href?<a href={href} target="_blank" rel="noopener noreferrer">{row.text||'Публикация'}</a>:row.text||'Публикация'}<small>{date(row.publishedAt)} · возраст: {Math.max(0,Math.floor((Date.parse(asOf)-Date.parse(row.publishedAt))/3600000))} ч</small>{row.primaryMessageOnly&&<small>реакции на основное сообщение</small>}</td>
    <td>{row.metric.value===null?'нет данных':row.metric.value.toLocaleString('ru-RU')}<small>{row.metric.observedAt?`Наблюдение: ${date(row.metric.observedAt)}`:row.metric.coverage==='UNSUPPORTED'?'Метрика доступна только для каналов':row.metric.coverage==='IDENTITY_UNPROVEN'?'Не подтверждён адрес этой публикации':'Наблюдений ещё нет'}</small>{row.metric.stale&&<small>Данные старше 24 часов</small>}{row.metric.collectionError&&<small>Обновление недоступно: {collectionErrors[row.metric.collectionError]}. Последнее значение сохранено.</small>}</td></tr>;
}
export function Analytics({ownerContext}:{ownerContext:AnalyticsOwnerContext}) {
  const [provider,setProvider]=useState<AnalyticsProvider>('max');const [period,setPeriod]=useState<7|30>(7);const [page,setPage]=useState(0);
  const [data,setData]=useState<AnalyticsDto|null>(null);const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const [nextPage,setNextPage]=useState<number|null>(null);
  const revision=useRef(0);const selection=useRef<AnalyticsSelection|null>(null);const autoOwner=useRef<object|null>(null);const controllerRef=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();controllerRef.current=controller;setData(null);setError(null);setBusy(false);setNextPage(null);
    if(!ownerContext){selection.current=null;setLoading(false);return ()=>controller.abort();}
    const captured:AnalyticsSelection={ownerId:ownerContext.id,generation:ownerContext.generation,provider,period,page,revision:++revision.current};selection.current=captured;setLoading(true);
    const current=()=>isAnalyticsSelectionCurrent(captured,selection.current);
    void (async()=>{
      try {
        const result=await loadAnalytics({provider,period,page},controller.signal);if(!current())return;setData(result);setLoading(false);
        if(provider==='max'&&autoOwner.current!==ownerContext.generation){
          autoOwner.current=ownerContext.generation;setBusy(true);
          const refreshed=await refreshAnalytics({provider,period,page:0},controller.signal);if(!current())return;setNextPage(refreshed.nextPage);if(refreshed.busy)setError('Статистика уже обновляется. Повтори позже.');
          const updated=await loadAnalytics({provider,period,page},controller.signal);if(current())setData(updated);
        }
      }catch{if(current())setError('Не удалось обновить статистику. Последние наблюдения сохранены.');}
      finally{if(current()){setLoading(false);setBusy(false);}}
    })();
    return ()=>{if(selection.current===captured)selection.current=null;controller.abort();};
  },[ownerContext?.id,ownerContext?.generation,provider,period,page]);
  async function refresh(collectionPage:number){
    const captured=selection.current;if(!captured||busy)return;setBusy(true);setError(null);
    try{const result=await refreshAnalytics({provider,period,page:collectionPage},controllerRef.current?.signal);if(!isAnalyticsSelectionCurrent(captured,selection.current))return;setNextPage(result.nextPage);if(result.busy)setError('Статистика уже обновляется. Повтори позже.');const updated=await loadAnalytics({provider,period,page},controllerRef.current?.signal);if(isAnalyticsSelectionCurrent(captured,selection.current))setData(updated);}
    catch{if(isAnalyticsSelectionCurrent(captured,selection.current))setError('Не удалось обновить статистику. Последние наблюдения сохранены.');}
    finally{if(isAnalyticsSelectionCurrent(captured,selection.current))setBusy(false);}
  }
  return <><div className="page-heading"><div><div className="eyebrow">ОТ КОНТЕНТА К РЕЗУЛЬТАТУ</div><h1>Аналитика</h1><p>Сравнивай посты внутри одной площадки.</p></div></div>
    <div className="analytics-controls"><div role="group" aria-label="Площадка">{(['max','telegram'] as const).map(value=><button key={value} aria-pressed={provider===value} onClick={()=>{setProvider(value);setPage(0);}}>{value==='max'?'MAX':'Telegram'}</button>)}</div><div role="group" aria-label="Период публикаций">{([7,30] as const).map(value=><button key={value} aria-pressed={period===value} onClick={()=>{setPeriod(value);setPage(0);}}>{value===7?'7 дней':'30 дней'}</button>)}</div></div>
    <p className="notice">Посты, опубликованные за {period} дней по Москве. Накопительные значения за всё время жизни поста; просмотры и реакции могли появиться раньше выбранного периода.</p>
    <AnalyticsSummary provider={provider} data={data} loading={loading} error={error}/>
    {provider==='max'&&<div className="analytics-controls"><button disabled={busy||loading||!ownerContext} onClick={()=>{void refresh(0);}}>Обновить просмотры</button>{nextPage!==null&&<button disabled={busy||loading} onClick={()=>{void refresh(nextPage);}}>Обновить следующие 20 постов</button>}{busy&&<span role="status">Обновляем до 20 постов…</span>}</div>}
    {data&&data.eligibleCount===0&&<p>Опубликованных постов за выбранный период пока нет.</p>}
    {data&&data.rows.length>0&&<div className="analytics-table-wrap"><table className="analytics-results"><caption>По накопительным {provider==='max'?'просмотрам MAX':'реакциям Telegram'}. Сравнивай с учётом возраста поста.</caption><thead><tr><th scope="col">Пост</th><th scope="col">{provider==='max'?'Просмотры':'Реакции'}</th></tr></thead><tbody>{data.rows.filter(r=>r.metric.value!==null).map(row=><ResultRow key={row.publicationId} row={row} provider={provider} asOf={data.asOf}/>)}</tbody>{data.rows.some(r=>r.metric.value===null)&&<tbody><tr><th colSpan={2}>Без подтверждённых данных — вне рейтинга</th></tr>{data.rows.filter(r=>r.metric.value===null).map(row=><ResultRow key={row.publicationId} row={row} provider={provider} asOf={data.asOf}/>)}</tbody>}</table></div>}
    {data&&<div className="analytics-controls"><button disabled={page===0||loading} onClick={()=>setPage(page-1)}>Назад</button><span>Страница {page+1}</span><button disabled={(page+1)*20>=data.eligibleCount||loading} onClick={()=>setPage(page+1)}>Далее</button></div>}
  </>;
}

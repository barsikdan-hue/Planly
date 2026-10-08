'use client';
import {useEffect,useState} from 'react';
import type {AnalyticsDto,AnalyticsProvider} from '../../lib/contracts/analytics';
import type {AnalyticsOwnerContext} from '../../lib/client/analytics-state';
import {loadAnalytics} from '../../lib/client/planly-api';
export function AnalyticsSummary({data,loading,error,provider='max'}:{provider?:AnalyticsProvider;data:AnalyticsDto|null;loading:boolean;error:string|null}) {
  return <section className="analytics-real-summary" aria-live="polite"><p>{(data?.provider??provider)==='telegram'?'Реакции Telegram':'Просмотры MAX'} · накопительно</p>
    {loading&&<p role="status">Загрузка статистики…</p>}{error&&<p role="alert">{error}</p>}
    <strong>{data?.total!==null&&data?.total!==undefined?data.total.toLocaleString('ru-RU'):'нет данных'}</strong>
    {data&&<p>Данные: {data.observedCount} из {data.eligibleCount} постов</p>}
    {data?.totalOverflow&&<p>Сумма превышает точность счётчика; смотри значения отдельных постов.</p>}
    {data?.provider==='telegram'&&data.observedCount===0&&<p>сбор реакций ещё не дал данных</p>}
  </section>;
}
export function DashboardAnalytics({ownerContext}:{ownerContext:AnalyticsOwnerContext}) {
  const [observation,setObservation]=useState<{ownerId:string;generation:object;max:AnalyticsDto|null;telegram:AnalyticsDto|null;error:string|null}|null>(null);
  const ownerId=ownerContext?.id;const generation=ownerContext?.generation;
  const visible=observation?.ownerId===ownerId&&observation?.generation===generation?observation:null;
  const loading=!!ownerContext&&!visible;
  useEffect(()=>{
    const controller=new AbortController();let current=true;
    if(!ownerId||!generation)return ()=>controller.abort();
    void Promise.allSettled([loadAnalytics({provider:'max',period:7,page:0},controller.signal),loadAnalytics({provider:'telegram',period:7,page:0},controller.signal)]).then(results=>{
      if(!current)return;
      setObservation({ownerId,generation,max:results[0].status==='fulfilled'?results[0].value:null,telegram:results[1].status==='fulfilled'?results[1].value:null,error:results.some(r=>r.status==='rejected')?'Не удалось загрузить часть статистики.':null});
    });
    return ()=>{current=false;controller.abort();};
  },[ownerId,generation]);
  return <div className="analytics-provider-summary"><div><h3>MAX</h3><AnalyticsSummary provider="max" data={visible?.max??null} loading={loading} error={visible?.error??null}/></div><div><h3>Telegram</h3><AnalyticsSummary provider="telegram" data={visible?.telegram??null} loading={loading} error={visible?.error??null}/></div></div>;
}

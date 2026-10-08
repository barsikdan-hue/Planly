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
  const [values,setValues]=useState<{max:AnalyticsDto|null;telegram:AnalyticsDto|null}>({max:null,telegram:null});
  const [loading,setLoading]=useState(false);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();let current=true;setValues({max:null,telegram:null});setError(null);
    if(!ownerContext){setLoading(false);return ()=>controller.abort();}
    setLoading(true);
    void Promise.allSettled([loadAnalytics({provider:'max',period:7,page:0},controller.signal),loadAnalytics({provider:'telegram',period:7,page:0},controller.signal)]).then(results=>{
      if(!current)return;
      setValues({max:results[0].status==='fulfilled'?results[0].value:null,telegram:results[1].status==='fulfilled'?results[1].value:null});
      setError(results.some(r=>r.status==='rejected')?'Не удалось загрузить часть статистики.':null);setLoading(false);
    });
    return ()=>{current=false;controller.abort();};
  },[ownerContext?.id,ownerContext?.generation]);
  return <div className="analytics-provider-summary"><div><h3>MAX</h3><AnalyticsSummary provider="max" data={values.max} loading={loading} error={error}/></div><div><h3>Telegram</h3><AnalyticsSummary provider="telegram" data={values.telegram} loading={loading} error={error}/></div></div>;
}

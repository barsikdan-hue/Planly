'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {downloadSwipeFeedback,loadSwipeFeedback} from '@/lib/client/swipe-feedback';
import type {SwipeFeedbackSnapshot} from '@/lib/contracts/swipe-feedback';
export function SwipePreferences({isCurrent}:{isCurrent:()=>boolean}){
 const [snapshot,setSnapshot]=useState<SwipeFeedbackSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const mounted=useRef(true),locked=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const current=()=>mounted.current&&isCurrent();
 const run=async(exporting:boolean)=>{
  if(!current()||locked.current)return;locked.current=true;setBusy(true);setError(null);
  try{if(exporting)await downloadSwipeFeedback(current);else{const value=await loadSwipeFeedback(current);if(current()&&value)setSnapshot(value);}}
  catch(cause){if(current())setError(cause instanceof Error?cause.message:'Не удалось загрузить оценки.');}
  finally{if(current()){locked.current=false;setBusy(false);}}
 };
 return <div className="swipe-preferences"><Button variant="outline" disabled={busy} onClick={()=>void run(false)}>Мои оценки</Button>{snapshot&&<div role="region" aria-label="Мои оценки"><p>Последние подтверждённые оценки по заготовкам, включая удалённые.</p><p>Нравится: {snapshot.aggregate.likes} · Не нравится: {snapshot.aggregate.dislikes} · Всего: {snapshot.aggregate.total} · Доля LIKE: {snapshot.aggregate.likeRatio===null?'нет данных':`${Math.round(snapshot.aggregate.likeRatio*100)}%`}</p><p>Темы не определяются. Тексты, названия и ссылки на медиа в экспорт не входят.</p><Button disabled={busy} onClick={()=>void run(true)}>Скачать JSON</Button></div>}{error&&<p role="alert">{error}</p>}</div>;
}

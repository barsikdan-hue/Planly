'use client';
import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Socials, dateLabel } from './common';
import { day, addDays, type Post } from '@/lib/planner';
export function Calendar({ posts, openPost, createPost, reschedule }: {
    posts: Post[];
    openPost: (p: Post) => void;
    createPost: (date: string, time: string) => void;
    reschedule: (p: Post, date: string, time: string) => void;
}) {
    const [anchor, setAnchor] = useState(day());
    const [mode, setMode] = useState('week');
    const scroll = useRef<HTMLDivElement>(null);
    const dayNumber = new Date(`${anchor}T12:00:00Z`).getUTCDay();
    const start = addDays(anchor, -((dayNumber + 6) % 7));
    const dates = mode === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const monthStart = anchor.slice(0, 7) + '-01';
    const firstDay = new Date(`${monthStart}T12:00Z`).getUTCDay();
    const monthGridStart = addDays(monthStart, -((firstDay + 6) % 7));
    const monthDates = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));
    const visible = posts.filter(p => p.status !== 'draft');
    useEffect(() => { if (scroll.current)
        scroll.current.scrollTop = 8 * 56; }, [mode]);
    const shift = (direction: number) => { if (mode === 'month') {
        const d = new Date(`${anchor}T12:00Z`);
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + direction);
        setAnchor(d.toISOString().slice(0, 10));
    }
    else
        setAnchor(addDays(anchor, direction * (mode === 'week' ? 7 : 1))); };
    const drop = (e: React.DragEvent, date: string, time: string) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); const p = posts.find(x => x.id === id); if (p && p.status === 'scheduled')
        reschedule(p, date, time); };
    const event = (p: Post) => <button key={p.id} draggable={p.status === 'scheduled'} onDragStart={e => e.dataTransfer.setData('text/plain', p.id)} className={`calendar-event ${p.networks[0]} ${p.status}`} onClick={e => { e.stopPropagation(); openPost(p); }}><div><b>{p.time}</b><Socials networks={p.networks}/></div><strong>{p.text.split('\n')[0]}</strong><small>{p.status === 'published' ? 'Опубликовано' : p.status === 'failed' ? 'Ошибка' : 'Запланировано'}</small></button>;
    return <><div className="page-heading"><div><div className="eyebrow">ПЛАНИРУЙ БЕЗ СУЕТЫ</div><h1>Календарь</h1><p>Твой контент-план — день за днём.</p></div><Button className="action" onClick={() => createPost(anchor, '10:00')}><Plus size={17}/>Новый пост</Button></div><div className="calendar-shell"><div className="calendar-toolbar"><div><Button variant="outline" size="icon" aria-label="Предыдущий период" onClick={() => shift(-1)}><ChevronLeft size={17}/></Button><Button variant="outline" size="icon" aria-label="Следующий период" onClick={() => shift(1)}><ChevronRight size={17}/></Button><h2>{mode === 'week' ? `${dateLabel(start)} — ${dateLabel(addDays(start, 6))}` : mode === 'day' ? dateLabel(anchor) : new Date(`${anchor}T12:00Z`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2><Button variant="ghost" onClick={() => setAnchor(day())}>Сегодня</Button></div><Tabs value={mode} onValueChange={setMode}><TabsList><TabsTrigger value="day">День</TabsTrigger><TabsTrigger value="week">Неделя</TabsTrigger><TabsTrigger value="month">Месяц</TabsTrigger></TabsList></Tabs></div>{mode === 'month' ? <div className="month-calendar"><div className="month-weekdays">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <span key={d}>{d}</span>)}</div><div className="month-grid">{monthDates.map(date => <div className={`month-day ${date.slice(0, 7) !== anchor.slice(0, 7) ? 'other-month' : ''} ${date === day() ? 'is-today' : ''}`} key={date} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, date, '10:00')}><button className="month-number" onClick={() => createPost(date, '10:00')}>{Number(date.slice(-2))}</button>{visible.filter(p => p.date === date).map(event)}</div>)}</div></div> : <div className={`time-calendar mode-${mode}`}><div className="week-head" style={{ gridTemplateColumns: `54px repeat(${dates.length},minmax(110px,1fr))` }}><span className="timezone">МСК</span>{dates.map(date => <div className={date === day() ? 'is-today' : ''} key={date}><span>{new Date(`${date}T12:00Z`).toLocaleDateString('ru-RU', { weekday: 'short' })}</span><b>{Number(date.slice(-2))}</b></div>)}</div><div className="week-scroll" ref={scroll}><div className="week-grid" style={{ gridTemplateColumns: `54px repeat(${dates.length},minmax(110px,1fr))` }}><div className="hour-labels">{Array.from({ length: 24 }, (_, i) => <span key={i}>{String(i).padStart(2, '0')}:00</span>)}</div>{dates.map(date => <div className={`day-column ${date === day() ? 'is-today' : ''}`} key={date}>{Array.from({ length: 24 }, (_, hour) => <button className="hour-slot" key={hour} aria-label={`Новый пост ${date}, ${hour}:00`} onClick={() => createPost(date, `${String(hour).padStart(2, '0')}:00`)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, date, `${String(hour).padStart(2, '0')}:00`)}/>)}{visible.filter(p => p.date === date).map((p, index, arr) => { const minute = (q: Post) => Number(q.time.slice(0, 2)) * 60 + Number(q.time.slice(3)); const siblings = arr.filter(q => Math.abs(minute(q) - minute(p)) < 60); const slot = siblings.indexOf(p); return <div key={p.id} className="positioned-event" style={{ top: Number(p.time.slice(0, 2)) * 56 + Number(p.time.slice(3)) * 56 / 60, left: `calc(${slot / siblings.length * 100}% + 4px)`, width: `calc(${100 / siblings.length}% - 8px)` }}>{event(p)}</div>; })}</div>)}</div></div></div>}<div className="calendar-footer"><span><i className="legend-dot telegram"/>Telegram</span><span><i className="legend-dot vk"/>VK</span><span><i className="legend-dot instagram"/>Instagram</span><small>Перетащи запланированный пост, чтобы изменить время. На телефоне — через редактор.</small></div></div></>;
}

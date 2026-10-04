'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { LibraryItemDto } from '@/lib/contracts/library';
import type { Provider, SocialAccountDto } from '@/lib/contracts/planner';
import { slotQuerySchema, type SlotQuery } from '@/lib/contracts/swipe-planner';
import { slotPresets } from '@/lib/planner-slots';
import { moscowDate, networkNames, type Media } from '@/lib/planner';
import { orderedPostMedia } from '@/lib/post-media';

export type SwipeApproval = { mode: 'draft' | 'manual' | 'next'; providers: Provider[]; scheduledAt: string | null };
export type SwipePlannerProps = {
    items: LibraryItemDto[];
    media: Media[];
    socialAccounts: SocialAccountDto[];
    busy?: boolean;
    pending?: boolean;
    onPreview: (query: SlotQuery) => Promise<{ scheduledAt: string | null }>;
    onApprove: (item: LibraryItemDto, approval: SwipeApproval) => Promise<{ id: string; scheduledAt?: string | null } | void>;
    onReject: (item: LibraryItemDto) => Promise<unknown>;
    onEdit: (item: LibraryItemDto) => void;
    onClose: () => void;
    onOpenPost?: (id: string) => void;
};
type Preset = keyof typeof slotPresets | 'custom';
type Preview = { key: string; scheduledAt: string | null; error?: string };
const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const providers: Provider[] = ['telegram', 'max'];
const todayMoscow = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const endDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + (days - 1) * 86400000).toISOString().slice(0, 10);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить решение. Попробуй снова.';
const interactive = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('button, input, textarea, select, a, video, audio, img, [contenteditable], [data-swipe-ignore]');
const scheduleLabel = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' });

export function SwipePlanner({ items, media, socialAccounts, busy = false, pending = false, onPreview, onApprove, onReject, onEdit, onClose, onOpenPost }: SwipePlannerProps) {
    const [now, setNow] = useState(Date.now);
    const [mode, setMode] = useState<SwipeApproval['mode']>('draft');
    const [selected, setSelected] = useState<Provider[]>([]);
    const [preset, setPreset] = useState<Preset>('daily10');
    const [days, setDays] = useState(7);
    const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
    const [times, setTimes] = useState<string[]>(['10:00']);
    const [date, setDate] = useState(todayMoscow);
    const [time, setTime] = useState('10:00');
    const [skipped, setSkipped] = useState<string[]>([]);
    const [finished, setFinished] = useState<string[]>([]);
    const [approved, setApproved] = useState(0);
    const [rejected, setRejected] = useState(0);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ id: string; scheduledAt?: string | null } | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [refresh, setRefresh] = useState(0);
    const mounted = useRef(true);
    const locked = useRef(false);
    const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
    const previewCallback = useRef(onPreview);
    useEffect(() => { previewCallback.current = onPreview; }, [onPreview]);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
    const blocked = busy || pending || working;
    const ready = items.filter(item => item.status === 'READY' && !item.sourcePostId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const [initialCount] = useState(() => ready.length);
    const current = ready.find(item => !skipped.includes(item.id) && !finished.includes(item.id));
    const available = providers.filter(provider => socialAccounts.some(account => account.provider === provider && account.enabled && account.connectionStatus === 'CONNECTED'));
    const chosen = selected.filter(provider => available.includes(provider));
    const startDate = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
    const schedule = preset === 'custom' ? { weekdays, times } : slotPresets[preset];
    const rawQuery = { providers: chosen, startDate, endDate: endDate(startDate, days), weekdays: schedule.weekdays, times: schedule.times };
    const queryKey = mode === 'next' && slotQuerySchema.safeParse(rawQuery).success ? JSON.stringify(rawQuery) : '';
    const hasQuery = !!queryKey;
    useEffect(() => {
        if (!queryKey || pending || busy) return;
        let cancelled = false;
        void previewCallback.current(JSON.parse(queryKey) as SlotQuery).then(value => {
            if (!cancelled && mounted.current) setPreview({ key: queryKey, scheduledAt: value.scheduledAt });
        }).catch(cause => {
            if (!cancelled && mounted.current) setPreview({ key: queryKey, scheduledAt: null, error: errorMessage(cause) });
        });
        return () => { cancelled = true; };
    }, [queryKey, refresh, pending, busy]);
    const previewReady = !!queryKey && preview?.key === queryKey;
    const manualDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? moscowDate(date, time) : null;
    const manualValid = manualDate && Number.isFinite(manualDate.getTime()) && new Date(manualDate.getTime() + 3 * 3600000).toISOString().slice(0, 10) === date && manualDate.getTime() > now;
    const scheduledAt = mode === 'draft' ? null : mode === 'manual' ? manualValid ? manualDate!.toISOString() : null : previewReady ? preview!.scheduledAt : null;
    const canApprove = !!current && !blocked && (mode === 'draft' || chosen.length > 0 && !!scheduledAt && Date.parse(scheduledAt) > now);
    const decide = async (action: 'approve' | 'reject') => {
        if (!current || blocked || locked.current || action === 'approve' && !canApprove) return;
        locked.current = true; setWorking(true); setError(null); gesture.current = null;
        try {
            if (action === 'approve') {
                const saved = await onApprove(current, { mode, providers: [...chosen], scheduledAt });
                if (mounted.current) { setApproved(value => value + 1); if (saved) setResult(saved); }
            } else {
                await onReject(current);
                if (mounted.current) setRejected(value => value + 1);
            }
            if (mounted.current) { setFinished(value => [...value, current.id]); if (mode === 'next') { setPreview(null); setRefresh(value => value + 1); } }
        } catch (cause) {
            if (mounted.current) { setError(errorMessage(cause)); if (mode === 'next') { setPreview(null); setRefresh(value => value + 1); } }
        } finally {
            locked.current = false;
            if (mounted.current) setWorking(false);
        }
    };
    const skip = () => { if (!current || blocked || locked.current) return; setSkipped(value => [...value, current.id]); setError(null); gesture.current = null; };
    const pointerDown = (event: PointerEvent<HTMLElement>) => {
        gesture.current = null;
        if (blocked || locked.current || event.button !== 0 || event.isPrimary === false || interactive(event.target)) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget?.setPointerCapture?.(event.pointerId);
    };
    const pointerUp = async (event: PointerEvent<HTMLElement>) => {
        const start = gesture.current; gesture.current = null;
        if (!start || start.id !== event.pointerId || interactive(event.target)) return;
        const dx = event.clientX - start.x; const dy = event.clientY - start.y;
        if (Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy)) await decide(dx > 0 ? 'approve' : 'reject');
    };
    const keyDown = async (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || blocked) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); await decide(event.key === 'ArrowRight' ? 'approve' : 'reject'); }
    };
    return <section className="swipe-planner" aria-label="Разбор заготовок">
        <div className="page-heading"><div><div className="eyebrow">SMART CONTENT QUEUE</div><h1>Разбор заготовок</h1><p>Каждую публикацию одобряешь отдельно.</p></div><Button variant="outline" disabled={working || busy} onClick={onClose}>Закрыть разбор</Button></div>
        <div className="swipe-progress" role="status">Одобрено: {approved} · Отклонено: {rejected} · Пропущено: {skipped.length} · Осталось: {ready.filter(item => !skipped.includes(item.id) && !finished.includes(item.id)).length}</div>
        {pending && <p className="notice" role="alert">Предыдущее создание ещё не подтверждено. Закрой разбор и повтори исходный запрос в уведомлении восстановления.</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {result && <p className="notice" role="status">Публикация создана{result.scheduledAt ? ` · ${scheduleLabel(result.scheduledAt)} МСК` : ''}. {onOpenPost && <Button variant="outline" disabled={blocked} onClick={() => onOpenPost(result.id)}>Открыть публикацию</Button>}</p>}
        {current ? <div className="swipe-layout">
            <div className="swipe-settings planner-card">
                <h2>Куда отправить</h2><p className="mini-note">Время — московское (МСК). Настройки действуют в этом разборе.</p>
                <label htmlFor="swipe-mode">Режим одобрения</label><select id="swipe-mode" aria-label="Режим одобрения" className="form-input" value={mode} disabled={blocked} onChange={event => { setPreview(null); setMode(event.target.value as SwipeApproval['mode']); setError(null); }}><option value="draft">Черновик</option><option value="manual">Вручную</option><option value="next">Следующий слот</option></select>
                <div className="network-choices" role="group" aria-label="Соцсети публикации">{providers.map(provider => <Button key={provider} variant={chosen.includes(provider) ? 'default' : 'outline'} aria-pressed={chosen.includes(provider)} disabled={blocked || !available.includes(provider)} onClick={() => { if (blocked || locked.current) return; setPreview(null); setSelected(value => value.includes(provider) ? value.filter(p => p !== provider) : [...value, provider]); }}>{networkNames[provider]}</Button>)}</div>
                {chosen.length === 0 && <p className="mini-note">{mode === 'draft' ? 'Черновик можно сохранить без соцсетей.' : 'Выбери хотя бы одну подключённую соцсеть.'}</p>}
                {available.length < 2 && <p className="mini-note">Недоступные сети подключи и включи в настройках.</p>}
                {mode === 'manual' && <div className="date-inputs"><label>Дата публикации<input type="date" aria-label="Дата публикации" value={date} disabled={blocked} onChange={event => setDate(event.target.value)}/></label><label>Время публикации<input type="time" aria-label="Время публикации" value={time} disabled={blocked} onChange={event => setTime(event.target.value)}/></label></div>}
                {mode === 'next' && <>
                    <label htmlFor="swipe-preset">Расписание</label><select id="swipe-preset" className="form-input" aria-label="Расписание" value={preset} disabled={blocked} onChange={event => { setPreview(null); setPreset(event.target.value as Preset); }}><option value="daily10">Ежедневно в 10:00</option><option value="weekdays10">Будни в 10:00</option><option value="daily10and18">Ежедневно в 10:00 и 18:00</option><option value="custom">Своё расписание</option></select>
                    {preset === 'custom' && <><div className="swipe-weekdays" role="group" aria-label="Дни недели">{weekdayNames.map((label, index) => <Button key={label} variant={weekdays.includes(index + 1) ? 'default' : 'outline'} aria-pressed={weekdays.includes(index + 1)} disabled={blocked} onClick={() => { setPreview(null); setWeekdays(value => value.includes(index + 1) ? value.filter(day => day !== index + 1) : [...value, index + 1].sort((a, b) => a - b)); }}>{label}</Button>)}</div><div className="swipe-times">{times.map((value, index) => <label key={index}>Время слота {index + 1}<input type="time" aria-label={`Время слота ${index + 1}`} value={value} disabled={blocked} onChange={event => { setPreview(null); setTimes(current => current.map((time, i) => i === index ? event.target.value : time)); }}/>{times.length > 1 && <Button variant="ghost" disabled={blocked} aria-label={`Убрать время ${index + 1}`} onClick={() => { setPreview(null); setTimes(current => current.filter((_, i) => i !== index)); }}>Убрать</Button>}</label>)}</div><Button variant="outline" disabled={blocked || times.length >= 4} onClick={() => { setPreview(null); setTimes(value => [...value, '']); }}>Добавить время</Button></>}
                    <label htmlFor="swipe-horizon">Горизонт планирования</label><select id="swipe-horizon" className="form-input" aria-label="Горизонт планирования" value={days} disabled={blocked} onChange={event => { setPreview(null); setDays(Number(event.target.value)); }}><option value="7">7 дней, включая сегодня</option><option value="30">30 дней, включая сегодня</option></select>
                    <p className="mini-note">{!hasQuery ? 'Выбери сеть, дни недели и 1–4 разных времени.' : !previewReady ? 'Ищем свободный слот…' : preview?.error ? preview.error : !scheduledAt ? 'Свободных слотов нет. Измени расписание или выбери вручную / черновик.' : 'Слот проверится ещё раз при одобрении.'}</p>
                    <Button variant="outline" disabled={blocked || !hasQuery} onClick={() => { setPreview(null); setRefresh(value => value + 1); }}>Обновить слот</Button>
                </>}
                <p className="swipe-destination" aria-live="polite">{mode === 'draft' ? 'Черновик · без расписания' : scheduledAt ? `${scheduleLabel(scheduledAt)} МСК` : 'Дата и время пока не выбраны'}{chosen.length > 0 ? ` · ${chosen.map(provider => networkNames[provider]).join(', ')}` : ''}</p>
            </div>
            <div className="swipe-review">
                <article className="content-card swipe-card" tabIndex={0} aria-label={`Заготовка: ${current.title || 'Без названия'}`} aria-describedby="swipe-instructions" aria-busy={working} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }} onPointerMove={event => { const start = gesture.current; if (start && Math.abs(event.clientY - start.y) > 12 && Math.abs(event.clientY - start.y) >= Math.abs(event.clientX - start.x)) gesture.current = null; }} onKeyDown={keyDown}>
                    {current.mediaIds.length > 0 && <div className="library-media-preview" data-swipe-ignore>{orderedPostMedia(current.mediaIds, media).map(asset => asset.type.startsWith('video/') ? <video key={asset.id} src={asset.url} controls playsInline aria-label={asset.name}/> : <img key={asset.id} src={asset.url} alt={asset.name}/>)}</div>}
                    <div className="content-card-body"><span className="pill library-status-ready">Готово</span><h2>{current.title || current.text.split('\n')[0] || 'Без названия'}</h2><p className="swipe-text">{current.text || 'Заготовка с медиа'}</p><Button variant="outline" disabled={blocked} onClick={() => { if (!blocked && !locked.current) onEdit(current); }}>Открыть редактор</Button></div>
                </article>
                <p id="swipe-instructions" className="mini-note">Свайп вправо — одобрить, влево — отклонить. Стрелки работают, когда выбрана карточка.</p>
                <div className="swipe-actions"><Button variant="outline" disabled={blocked} onClick={() => decide('reject')}>Отклонить</Button><Button variant="outline" disabled={blocked} onClick={skip}>Пропустить</Button><Button disabled={!canApprove} onClick={() => decide('approve')}>Одобрить</Button></div>
                {working && <p role="status" className="mini-note">Сохраняем решение…</p>}
            </div>
        </div> : <div className="planner-card empty-state"><h2>{initialCount === 0 && finished.length === 0 && skipped.length === 0 ? 'Нет готовых заготовок' : 'Разбор завершён'}</h2><p>Пропущенные заготовки появятся в следующем разборе. Отклонённые можно вернуть из архива библиотеки.</p></div>}
    </section>;
}



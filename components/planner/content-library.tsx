'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Card, Empty } from './common';
import { orderedPostMedia } from '@/lib/post-media';
import type { Media, Post } from '@/lib/planner';
import type { CreateLibraryItemInput, LibraryItemDto } from '@/lib/contracts/library';

type EditableContent = CreateLibraryItemInput & { status?: 'READY' | 'ARCHIVED' };
type Editor = { id?: string; title: string; text: string; mediaIds: string[]; status: 'READY' | 'ARCHIVED' };
const statuses = { READY: 'Готово', USED: 'Использовано', ARCHIVED: 'В архиве' };
const itemContent = (item: LibraryItemDto): EditableContent => ({ title: item.title, text: item.text, mediaIds: [...item.mediaIds], status: item.status === 'ARCHIVED' ? 'ARCHIVED' : 'READY' });
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось обновить библиотеку. Попробуй снова.';

function MediaPreview({ item }: { item: Media }) {
    return item.type.startsWith('video/') ? <video src={item.url} controls aria-label={item.name}/> : <img src={item.url} alt={item.name}/>;
}

export function ContentLibrary({ items, media, posts, activeTab, onTabChange, upload, saveItem, deleteItem, createPublication, openPublication, startReview, children }: {
    items: LibraryItemDto[];
    media: Media[];
    posts: Pick<Post, 'id'>[];
    activeTab?: 'prepared' | 'publications';
    onTabChange?: (tab: 'prepared' | 'publications') => void;
    upload: (files: FileList | File[]) => Promise<Media[]>;
    saveItem: (input: EditableContent, id?: string) => Promise<void>;
    deleteItem: (id: string) => Promise<void>;
    createPublication: (item: LibraryItemDto) => void;
    openPublication: (id: string) => void;
    startReview?: () => void;
    children: ReactNode;
}) {
    const [localTab, setLocalTab] = useState<'prepared' | 'publications'>('prepared');
    const tab = activeTab ?? localTab;
    const setTab = onTabChange ?? setLocalTab;
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [editor, setEditor] = useState<Editor | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState<LibraryItemDto | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const lock = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const perform = async (action: () => Promise<void>) => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError(null);
        try { await action(); }
        catch (failure) { if (mounted.current) setError(message(failure)); }
        finally { lock.current = false; if (mounted.current) setBusy(false); }
    };
    const edit = (item?: LibraryItemDto) => {
        setError(null);
        setEditor(item ? { id: item.id, title: item.title ?? '', text: item.text, mediaIds: [...item.mediaIds], status: item.status === 'ARCHIVED' ? 'ARCHIVED' : 'READY' }
            : { title: '', text: '', mediaIds: [], status: 'READY' });
    };
    const submit = async () => {
        if (!editor) return;
        const title = editor.title.trim(); const text = editor.text.trim();
        if (!text && !editor.mediaIds.length) { setError('Добавь текст заготовки или медиа.'); return; }
        if (title.length > 200 || text.length > 20000 || editor.mediaIds.length > 20) { setError('Максимум: 200 символов в названии, 20 000 в тексте и 20 файлов.'); return; }
        await perform(async () => {
            await saveItem({ title: title || null, text, mediaIds: [...editor.mediaIds], ...(editor.id ? { status: editor.status } : {}) }, editor.id);
            if (mounted.current) setEditor(null);
        });
    };
    const selectMedia = (id: string) => {
        if (!editor || busy) return;
        if (!editor.mediaIds.includes(id) && editor.mediaIds.length >= 20) { setError('К заготовке можно добавить до 20 файлов.'); return; }
        setError(null);
        setEditor(current => current && ({ ...current, mediaIds: current.mediaIds.includes(id) ? current.mediaIds.filter(value => value !== id) : [...current.mediaIds, id] }));
    };
    const addFiles = async (files: FileList | File[]) => {
        if (!editor) return;
        if (editor.mediaIds.length + files.length > 20) { setError('К заготовке можно добавить до 20 файлов.'); return; }
        await perform(async () => {
            const added = await upload(files);
            if (mounted.current) setEditor(current => current && ({ ...current, mediaIds: [...new Set([...current.mediaIds, ...added.map(item => item.id)])].slice(0, 20) }));
        });
    };
    const filtered = items.filter(item => (filter === 'all' || item.status === filter) && [item.title, item.text, ...orderedPostMedia(item.mediaIds, media).map(asset => asset.name)].join(' ').toLowerCase().includes(query.toLowerCase()));
    return <div className="content-library">
        <div className="library-tabs" role="tablist" aria-label="Библиотека">
            <Button role="tab" id="prepared-tab" aria-controls="prepared-panel" aria-selected={tab === 'prepared'} variant={tab === 'prepared' ? 'default' : 'outline'} disabled={busy} onClick={() => setTab('prepared')}>Заготовки</Button>
            <Button role="tab" id="publications-tab" aria-controls="publications-panel" aria-selected={tab === 'publications'} variant={tab === 'publications' ? 'default' : 'outline'} disabled={busy} onClick={() => setTab('publications')}>Публикации</Button>
        </div>
        {tab === 'publications' ? <section role="tabpanel" id="publications-panel" aria-labelledby="publications-tab">{children}</section> : <section role="tabpanel" id="prepared-panel" aria-labelledby="prepared-tab">
            <div className="page-heading library-heading"><div><div className="eyebrow">ОТ ИДЕИ К ПУБЛИКАЦИИ</div><h1>Библиотека</h1><p>Подготовь текст и медиа для будущих публикаций.</p></div>{!editor && <Button className="action" disabled={busy} onClick={() => edit()}><Plus size={17}/>Новая заготовка</Button>}</div>
            {error && <p className="notice error" role="alert">{error}</p>}
            {editor ? <Card className="library-editor" title={editor.id ? 'Редактировать заготовку' : 'Новая заготовка'}>
                <label htmlFor="library-title">Название <span className="muted">(необязательно)</span></label>
                <input id="library-title" aria-label="Название заготовки" className="form-input" value={editor.title} maxLength={200} disabled={busy} onChange={event => setEditor(current => current && ({ ...current, title: event.target.value }))}/>
                <label htmlFor="library-text">Текст заготовки</label>
                <textarea id="library-text" aria-label="Текст заготовки" className="editor-text" value={editor.text} maxLength={20000} disabled={busy} onChange={event => setEditor(current => current && ({ ...current, text: event.target.value }))}/>
                <div className="row-between"><h3>Медиа · {editor.mediaIds.length} / 20</h3><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/>Загрузить медиа</Button></div>
                <input ref={input} type="file" hidden multiple aria-label="Загрузить медиа заготовки" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy} onChange={async event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) await addFiles(files); }}/>
                {editor.mediaIds.length > 0 && <div className="attachment-chips">{orderedPostMedia(editor.mediaIds, media).map(asset => <span key={asset.id}>{asset.name}<button disabled={busy} aria-label={`Убрать ${asset.name}`} onClick={() => selectMedia(asset.id)}><X size={13}/></button></span>)}</div>}
                <p className="mini-note">Выбери файлы из медиатеки в нужном порядке или загрузи новые.</p>
                {media.length ? <div className="media-picker-grid library-media-picker">{media.map(asset => <button key={asset.id} className={editor.mediaIds.includes(asset.id) ? 'active' : ''} disabled={busy} aria-pressed={editor.mediaIds.includes(asset.id)} onClick={() => selectMedia(asset.id)}>{asset.type.startsWith('video/') ? <video src={asset.url} muted/> : <img src={asset.url} alt=""/>}<span>{asset.name}</span></button>)}</div> : <p className="mini-note">Медиатека пока пуста.</p>}
                <div className="library-editor-actions"><Button disabled={busy} onClick={() => { void submit(); }}>Сохранить</Button><Button disabled={busy} variant="outline" onClick={() => { setEditor(null); setError(null); }}>Отмена</Button>{busy && <span role="status">Сохранение / загрузка…</span>}</div>
            </Card> : <>
                {startReview && <Button variant="outline" disabled={busy} onClick={startReview}>Разобрать заготовки</Button>}<div className="content-toolbar"><div className="library-status-filters" role="group" aria-label="Статус заготовок">{[['all', 'Все'], ['READY', 'Готовые'], ['USED', 'Использованные'], ['ARCHIVED', 'Архив']].map(([value, label]) => <Button key={value} aria-pressed={filter === value} variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}</div><div className="search-field"><Search size={16}/><input aria-label="Поиск заготовок" placeholder="Название, текст или файл…" value={query} onChange={event => setQuery(event.target.value)}/></div></div>
                {filtered.length ? <div className="content-grid library-grid">{filtered.map(item => <article key={item.id} className="content-card library-card">
                    {item.mediaIds.length > 0 && <div className="library-media-preview">{orderedPostMedia(item.mediaIds, media).map(asset => <MediaPreview key={asset.id} item={asset}/>)}</div>}
                    <div className="content-card-body"><span className={`pill library-status-${item.status.toLowerCase()}`}>{statuses[item.status]}</span><h2>{item.title || item.text.split('\n')[0] || 'Без названия'}</h2><p className="library-text-preview">{item.text || 'Заготовка с медиа'}</p><time dateTime={item.updatedAt}>Обновлено {new Date(item.updatedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</time>
                    <div className="library-card-actions">
                        {item.status === 'READY' && <Button disabled={busy} onClick={() => createPublication(item)}>Создать публикацию</Button>}
                        {item.status === 'USED' && item.sourcePostId && posts.some(post => post.id === item.sourcePostId) && <Button disabled={busy} onClick={() => openPublication(item.sourcePostId!)}>Открыть публикацию</Button>}
                        <Button variant="outline" disabled={busy} onClick={() => edit(item)}>Редактировать</Button>
                        {item.status === 'READY' && <Button variant="outline" disabled={busy} onClick={() => { void perform(() => saveItem({ ...itemContent(item), status: 'ARCHIVED' }, item.id)); }}>Архивировать</Button>}
                        {item.status === 'ARCHIVED' && <Button variant="outline" disabled={busy} onClick={() => { void perform(() => saveItem({ ...itemContent(item), status: 'READY' }, item.id)); }}>Вернуть из архива</Button>}
                        <Button variant="ghost" disabled={busy} className="delete-button" onClick={() => { setDeleting(item); setError(null); }}>Удалить</Button>
                    </div></div>
                </article>)}</div> : <Card><Empty title="Заготовки не найдены" description={query || filter !== 'all' ? 'Измени запрос или статус.' : 'Создай первую заготовку с текстом или медиа.'}/></Card>}
                <p className="list-count">Показано {filtered.length} из {items.length} заготовок</p>
            </>}
        </section>}
        {deleting && <AlertDialog open onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogTitle>Удалить заготовку?</AlertDialogTitle><AlertDialogDescription>«{deleting.title || 'Без названия'}» будет удалена. Медиа и созданная публикация останутся.</AlertDialogDescription>{error && <p role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><Button disabled={busy} className="destructive-action" onClick={() => { void perform(async () => { await deleteItem(deleting.id); if (mounted.current) setDeleting(null); }); }}>Подтвердить удаление</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    </div>;
}

'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Home, PlusCircle, CalendarDays, FileText, ImageIcon, Share2, BarChart3, Settings as SettingsIcon, Search, Bell, ChevronDown, Plus, Send, Pencil, Trash2, Clock, Check, Info, Layers, Loader2, PanelLeftClose } from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Dashboard } from './dashboard';
import { Composer } from './composer';
import { Calendar } from './calendar';
import { Content, MediaLibrary } from './library';
import { SocialAccounts, Settings, Analytics } from './settings';
import { SocialIcon, Poster, StatusBadge, Action, dateLabel } from './common';
import { seedPosts, blankPost, validatePost, movePost, networkNames, type Post, type Media, type Network, type Status } from '@/lib/planner';
import { readStore, writeStore, type Store } from '@/lib/browser-store';
const navigation = [{ id: 'dashboard', label: 'Главная', icon: Home }, { id: 'create', label: 'Создать пост', icon: PlusCircle }, { id: 'calendar', label: 'Календарь', icon: CalendarDays }, { id: 'content', label: 'Контент', icon: FileText }, { id: 'media', label: 'Медиа', icon: ImageIcon }, { id: 'socials', label: 'Соцсети', icon: Share2 }, { id: 'analytics', label: 'Аналитика', icon: BarChart3 }, { id: 'settings', label: 'Настройки', icon: SettingsIcon }];
const initial: Store = { posts: [], media: [], name: 'Данил', accounts: { telegram: true, vk: true, instagram: true } };
function Navigation({ view, navigate, posts }: {
    view: string;
    navigate: (v: string) => void;
    posts: Post[];
}) { const { setOpen, setOpenMobile, state } = useSidebar(); useEffect(() => { const resize = () => setOpen(window.innerWidth >= 1200); resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, [setOpen]); return <Sidebar collapsible="icon" className="planner-sidebar"><SidebarHeader className="brand-header"><button className="brand" onClick={() => navigate('dashboard')} aria-label="Personal Planner — главная"><span className="brand-icon"><Layers size={23}/></span><span className="brand-name">personal<span>planner</span></span></button></SidebarHeader><SidebarContent className="nav-content"><div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div><SidebarMenu>{navigation.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton className="nav-item" isActive={view === item.id} tooltip={item.label} onClick={() => { navigate(item.id); setOpenMobile(false); }}><item.icon size={20}/><span>{item.label}</span>{item.id === 'content' && <b className="nav-count">{posts.length}</b>}{item.id === 'analytics' && <span className="demo-nav">демо</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="planner-sidebar-footer">{state === 'expanded' && <div className="prototype-note"><span><span className="prototype-light"/>Режим прототипа</span><p>Планируй, пробуй, создавай.<br />Твой контент остаётся с тобой.</p><button onClick={() => navigate('settings')}>О проекте <Info size={13}/></button></div>}<div className="sidebar-bottom"><span>Личное пространство</span><SidebarTrigger /></div></SidebarFooter></Sidebar>; }
export default function PlannerApp() {
    const [data, setData] = useState<Store>(initial);
    const dataRef = useRef(data);
    const [ready, setReady] = useState(false);
    const [view, setView] = useState('dashboard');
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<Post>(blankPost);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<{
        type: 'post' | 'media';
        id: string;
        label: string;
    } | null>(null);
    const [storageError, setStorageError] = useState(false);
    const saving = useRef(Promise.resolve());
    const saveLock = useRef(false);
    const [saveBusy, setSaveBusy] = useState(false);
    useEffect(() => { let active = true; readStore().then(stored => { if (!active)
        return; const loaded = stored && Array.isArray(stored.posts) && Array.isArray(stored.media) && stored.accounts ? stored : { ...initial, posts: seedPosts() }; dataRef.current = loaded; setData(loaded); setReady(true); }).catch(() => { if (!active)
        return; const loaded = { ...initial, posts: seedPosts() }; dataRef.current = loaded; setData(loaded); setReady(true); setStorageError(true); toast.warning('Хранилище браузера недоступно. Изменения сохранятся только до закрытия страницы.'); }); return () => { active = false; }; }, []);
    useEffect(() => { const sync = () => { const hash = window.location.hash.slice(1); setView(navigation.some(n => n.id === hash) ? hash : 'dashboard'); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
    const navigate = useCallback((v: string) => { if (!navigation.some(n => n.id === v))
        return; setView(v); window.location.hash = v; window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
    const mutate = useCallback((fn: (data: Store) => Store) => { const next = fn(dataRef.current); dataRef.current = next; setData(next); let persisted = true; saving.current = saving.current.then(() => writeStore(next)).then(() => { setStorageError(false); }).catch(() => { persisted = false; setStorageError(true); toast.error('Не удалось сохранить данные в браузере. Освободи место и повтори действие.'); }); return saving.current.then(() => persisted); }, []);
    const save = async (post: Post, status: Status) => { if (saveLock.current)
        return; const error = validatePost(post, status); if (error) {
        toast.error(error);
        return;
    } saveLock.current = true; setSaveBusy(true); const next: Post = { ...post, id: post.id || crypto.randomUUID(), status, targets: post.networks.map(network => ({ network, status })) }; const result = mutate(s => ({ ...s, posts: s.posts.some(p => p.id === next.id) ? s.posts.map(p => p.id === next.id ? next : p) : [next, ...s.posts] })); setDraft(blankPost()); if (view !== 'dashboard')
        navigate('content'); const persisted = await result; saveLock.current = false; setSaveBusy(false); if (persisted)
        toast.success(status === 'draft' ? 'Черновик сохранён' : status === 'scheduled' ? 'Пост добавлен в деморасписание' : 'Демопубликация выполнена. В соцсети ничего не отправлено.'); };
    const editPost = (p: Post) => { setDraft({ ...p, mediaIds: [...p.mediaIds], networks: [...p.networks], overrides: { ...p.overrides } }); setDetailId(null); navigate('create'); };
    const createPost = (date?: string, time?: string) => { setDraft({ ...blankPost(), ...(date ? { date } : {}), ...(time ? { time } : {}) }); navigate('create'); };
    const reschedule = (p: Post, date: string, time: string) => { const next = movePost(p, date, time); const error = validatePost(next, 'scheduled'); if (error) {
        toast.error(error);
        return;
    } mutate(s => ({ ...s, posts: s.posts.map(x => x.id === p.id ? next : x) })); toast.success(`Пост перенесён на ${dateLabel(date)}, ${time}`); };
    const upload = async (files: FileList | File[]): Promise<Media[]> => { const added: Media[] = []; for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type)) {
            toast.error(`${file.name}: этот формат не поддерживается.`);
            continue;
        }
        if (file.size === 0 || file.size > 20 * 1024 * 1024) {
            toast.error(`${file.name}: нужен непустой файл до 20 МБ.`);
            continue;
        }
        if (dataRef.current.media.reduce((n, m) => n + m.size, 0) + added.reduce((n, m) => n + m.size, 0) + file.size > 80 * 1024 * 1024) {
            toast.error('Для демомедиатеки доступно 80 МБ. Удали лишние файлы.');
            break;
        }
        try {
            const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
            const text = String.fromCharCode(...bytes);
            const matches = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : file.type === 'image/png' ? bytes[0] === 137 && text.slice(1, 4) === 'PNG' : file.type === 'image/webp' ? text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP' : file.type === 'video/mp4' ? text.slice(4, 8) === 'ftyp' : bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
            if (!matches) {
                toast.error(`${file.name}: содержимое не совпадает с форматом.`);
                continue;
            }
            const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
            added.push({ id: crypto.randomUUID(), name: file.name, url, type: file.type, size: file.size });
        }
        catch {
            toast.error(`${file.name}: не удалось прочитать файл.`);
        }
    } if (added.length) {
        mutate(s => ({ ...s, media: [...s.media, ...added] }));
        toast.success(`Добавлено файлов: ${added.length}`);
    } return added; };
    useEffect(() => { const context = (document as Document & {
        modelContext?: {
            registerTool: (tool: unknown, options: {
                signal: AbortSignal;
            }) => void | Promise<void>;
        };
    }).modelContext; if (!context?.registerTool)
        return; const life = new AbortController(); const register = (tool: unknown) => { try {
        Promise.resolve(context.registerTool(tool, { signal: life.signal })).catch(() => { });
    }
    catch { } }; register({ name: 'list_demo_posts', title: 'Список демопубликаций', description: 'Прочитать публикации локального прототипа. Реальной отправки в соцсети нет.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ posts: dataRef.current.posts.map(p => ({ id: p.id, text: p.text, status: p.status, date: p.date, time: p.time, targets: p.targets })) }) }); register({ name: 'start_post_creation', title: 'Открыть редактор поста', description: 'Подготовить новый демопост и открыть редактор без сохранения и отправки.', inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 20000 } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Нужен объект.'); const value = input as Record<string, unknown>; if (Object.keys(value).some(k => k !== 'text') || (value.text !== undefined && (typeof value.text !== 'string' || value.text.length > 20000)))
            throw new Error('Некорректный текст.'); setDraft({ ...blankPost(), text: (value.text as string | undefined) ?? '' }); navigate('create'); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return { screen: 'create', saved: false }; } }); return () => life.abort(); }, [navigate]);
    const details = data.posts.find(p => p.id === detailId);
    const composer = { draft, setDraft, media: data.media, upload, save, saving: saveBusy, accounts: data.accounts };
    return <SidebarProvider style={{ '--sidebar-width': '228px', '--sidebar-width-icon': '72px' } as CSSProperties}><Navigation view={view} navigate={navigate} posts={data.posts}/><div className="app-main"><header className="topbar"><div className="topbar-left"><SidebarTrigger className="mobile-menu"/><div className="global-search"><Search size={18}/><input placeholder="Поиск по постам, медиа, хештегам…" aria-label="Поиск по постам, медиа, хештегам" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter')
        navigate('content'); }}/><kbd>↵</kbd></div></div><div className="topbar-right"><span className="demo-pill">Демо</span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="notifications" aria-label="Уведомления"><Bell size={19}/>{data.posts.some(p => p.status === 'failed') && <i />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="notification-menu"><DropdownMenuLabel>Уведомления</DropdownMenuLabel><DropdownMenuSeparator />{data.posts.some(p => p.status === 'failed') ? <DropdownMenuItem onClick={() => { navigate('content'); setQuery('Новый обзор'); }}><Info size={17}/>В демопубликации есть ошибка</DropdownMenuItem> : <DropdownMenuItem>Новых уведомлений нет</DropdownMenuItem>}<DropdownMenuItem onClick={() => navigate('calendar')}><Clock size={16}/>{data.posts.filter(p => p.status === 'scheduled').length} поста в деморасписании</DropdownMenuItem></DropdownMenuContent></DropdownMenu><span className="topbar-divider"/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="profile-button"><span className="user-avatar">{data.name.slice(0, 1).toUpperCase()}</span><span>{data.name}</span><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => navigate('settings')}><SettingsIcon size={16}/>Настройки профиля</DropdownMenuItem><DropdownMenuItem onClick={() => navigate('socials')}><Share2 size={16}/>Мои соцсети</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header><main className={`workspace view-${view}`} id="workspace">{storageError && <div className="notice error"><Info size={18}/><p>Изменения пока не сохранены. Проверь доступ к хранилищу браузера.</p></div>}{!ready ? <div className="loading-state"><Loader2 className="animate-spin"/><p>Открываем твоё пространство…</p></div> : <>{view === 'dashboard' && <Dashboard posts={data.posts} media={data.media} accounts={data.accounts} navigate={navigate} openPost={p => setDetailId(p.id)} composer={composer} name={data.name}/>} {view === 'create' && <><div className="page-heading"><div><div className="eyebrow">ОТ ИДЕИ К ПУБЛИКАЦИИ</div><h1>{draft.id ? 'Редактировать пост' : 'Создать пост'}</h1><p>Текст, медиа и площадки — всё на одном экране.</p></div><span className="pill neutral">Деморежим</span></div><Composer {...composer}/></>}{view === 'calendar' && <Calendar posts={data.posts} openPost={p => setDetailId(p.id)} createPost={createPost} reschedule={reschedule}/>} {view === 'content' && <Content posts={data.posts} media={data.media} query={query} setQuery={setQuery} openPost={p => setDetailId(p.id)} editPost={editPost} create={() => createPost()} deletePost={p => setConfirm({ type: 'post', id: p.id, label: p.text.split('\n')[0] })} duplicatePost={p => { setDraft({ ...p, id: '', status: 'draft', targets: [] }); navigate('create'); toast.info('Копия открыта в редакторе. Сохрани её как новый пост.'); }}/>}{view === 'media' && <MediaLibrary media={data.media} upload={upload} remove={m => setConfirm({ type: 'media', id: m.id, label: m.name })} useMedia={m => { setDraft({ ...blankPost(), mediaIds: [m.id] }); navigate('create'); }}/>}{view === 'socials' && <SocialAccounts accounts={data.accounts} toggle={(n, value) => { mutate(s => ({ ...s, accounts: { ...s.accounts, [n]: value } })); toast.success(value ? 'Демоаккаунт включён' : 'Демоаккаунт отключён'); }}/>}{view === 'analytics' && <Analytics posts={data.posts}/>} {view === 'settings' && <Settings name={data.name} saveName={name => { mutate(s => ({ ...s, name })); toast.success('Имя сохранено'); }}/>}</>}</main></div><Sheet open={!!details} onOpenChange={open => { if (!open)
        setDetailId(null); }}><SheetContent className="post-sheet">{details && <><SheetTitle>Публикация</SheetTitle><SheetDescription>{dateLabel(details.date)} · {details.time} МСК</SheetDescription><StatusBadge status={details.status}/><Poster post={details} media={data.media}/><p className="detail-text">{details.text}</p><div className="target-statuses"><h3>Статус по каждой соцсети</h3>{details.targets.map(t => <div key={t.network}><SocialIcon network={t.network} small/><span>{networkNames[t.network]}</span><StatusBadge status={t.status}/></div>)}</div>{details.status === 'failed' && <div className="notice error"><Info size={16}/><p>Демопример: срок действия Instagram-токена истёк. Публикация в VK завершилась отдельно.</p></div>}<div className="detail-actions"><Action secondary onClick={() => editPost(details)}><Pencil size={16}/>Редактировать / перенести</Action>{details.status !== 'published' && <Action onClick={() => { if (details.networks.some(n => !data.accounts[n])) {
        toast.error('Включи выбранные демоаккаунты.');
        return;
    } mutate(s => ({ ...s, posts: s.posts.map(p => p.id === details.id ? { ...p, status: 'published', targets: p.networks.map(network => ({ network, status: 'published' })) } : p) })); toast.success('Демопубликация выполнена. Реальной отправки нет.'); }}><Send size={16}/>Опубликовать сейчас (демо)</Action>}<Button variant="ghost" className="delete-button" onClick={() => setConfirm({ type: 'post', id: details.id, label: details.text.split('\n')[0] })}><Trash2 size={16}/>Удалить пост</Button></div></>}</SheetContent></Sheet><AlertDialog open={!!confirm} onOpenChange={open => { if (!open)
        setConfirm(null); }}><AlertDialogContent><AlertDialogTitle>{confirm?.type === 'media' ? 'Удалить файл?' : 'Удалить публикацию?'}</AlertDialogTitle><AlertDialogDescription>«{confirm?.label}» будет удалён из этого браузера.{confirm?.type === 'media' ? ' Файл также будет убран из всех демопубликаций.' : ' Это действие нельзя отменить.'}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction className="destructive-action" onClick={() => { if (!confirm)
        return; const selected = confirm; mutate(s => selected.type === 'post' ? { ...s, posts: s.posts.filter(p => p.id !== selected.id) } : { ...s, media: s.media.filter(m => m.id !== selected.id), posts: s.posts.map(p => ({ ...p, mediaIds: p.mediaIds.filter(id => id !== selected.id) })) }); if (selected.type === 'post')
        setDetailId(null);
    else
        setDraft(p => ({ ...p, mediaIds: p.mediaIds.filter(id => id !== selected.id) })); setConfirm(null); toast.success('Удалено'); }}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster position="bottom-right" richColors theme="light"/></SidebarProvider>;
}

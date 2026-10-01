'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Home, PlusCircle, CalendarDays, FileText, ImageIcon, Share2, BarChart3, Settings as SettingsIcon, Search, Bell, ChevronDown, Pencil, Trash2, Clock, Info, Layers, Loader2 } from 'lucide-react';
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
import { blankPost, validatePost, movePost, networkNames, fromServerPost, toSavePostInput, type Post, type Media, type Network, type Status } from '@/lib/planner';
import type { SocialAccountDto } from '@/lib/contracts/planner';
import {
    loadPlanner,
    savePost as savePostApi,
    removePost as removePostApi,
    saveProfile as saveProfileApi,
    setAccountEnabled as setAccountEnabledApi,
    uploadMedia as uploadMediaApi,
    removeMedia as removeMediaApi,
    type MediaAssetWithPreview,
} from '@/lib/client/planly-api';

const navigation = [{ id: 'dashboard', label: 'Главная', icon: Home }, { id: 'create', label: 'Создать пост', icon: PlusCircle }, { id: 'calendar', label: 'Календарь', icon: CalendarDays }, { id: 'content', label: 'Контент', icon: FileText }, { id: 'media', label: 'Медиа', icon: ImageIcon }, { id: 'socials', label: 'Соцсети', icon: Share2 }, { id: 'analytics', label: 'Аналитика', icon: BarChart3 }, { id: 'settings', label: 'Настройки', icon: SettingsIcon }];

type PlannerData = {
    posts: Post[];
    media: Media[];
    name: string;
    socialAccounts: SocialAccountDto[];
};

const initial: PlannerData = { posts: [], media: [], name: 'Данил', socialAccounts: [] };

function toUiMedia(item: MediaAssetWithPreview): Media {
    return { id: item.id, name: item.originalName, url: item.previewUrl, type: item.mimeType, size: item.byteSize };
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function Navigation({ view, navigate, posts }: {
    view: string;
    navigate: (v: string) => void;
    posts: Post[];
}) { const { setOpen, setOpenMobile, state } = useSidebar(); useEffect(() => { const resize = () => setOpen(window.innerWidth >= 1200); resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, [setOpen]); return <Sidebar collapsible="icon" className="planner-sidebar"><SidebarHeader className="brand-header"><button className="brand" onClick={() => navigate('dashboard')} aria-label="Personal Planner — главная"><span className="brand-icon"><Layers size={23}/></span><span className="brand-name">personal<span>planner</span></span></button></SidebarHeader><SidebarContent className="nav-content"><div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div><SidebarMenu>{navigation.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton className="nav-item" isActive={view === item.id} tooltip={item.label} onClick={() => { navigate(item.id); setOpenMobile(false); }}><item.icon size={20}/><span>{item.label}</span>{item.id === 'content' && <b className="nav-count">{posts.length}</b>}{item.id === 'analytics' && <span className="demo-nav">демо</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="planner-sidebar-footer">{state === 'expanded' && <div className="prototype-note"><span><span className="prototype-light"/>Content Core</span><p>Черновики и расписание<br />хранятся на сервере.</p><button onClick={() => navigate('settings')}>О проекте <Info size={13}/></button></div>}<div className="sidebar-bottom"><span>Личное пространство</span><SidebarTrigger /></div></SidebarFooter></Sidebar>; }

export default function PlannerApp() {
    const [data, setData] = useState<PlannerData>(initial);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [view, setView] = useState('dashboard');
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<Post>(blankPost);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<{ type: 'post' | 'media'; id: string; label: string } | null>(null);
    const saveLock = useRef(false);
    const [saveBusy, setSaveBusy] = useState(false);

    useEffect(() => {
        let active = true;
        loadPlanner().then(snapshot => {
            if (!active) return;
            setData({
                posts: snapshot.posts.map(fromServerPost),
                media: snapshot.media.map(toUiMedia),
                name: snapshot.profile.displayName,
                socialAccounts: snapshot.socialAccounts,
            });
            setLoadError(false);
        }).catch(error => {
            if (!active) return;
            setLoadError(true);
            toast.error(errorMessage(error, 'Не удалось загрузить данные Planly.'));
        }).finally(() => { if (active) setReady(true); });
        return () => { active = false; };
    }, []);

    useEffect(() => { const sync = () => { const hash = window.location.hash.slice(1); setView(navigation.some(n => n.id === hash) ? hash : 'dashboard'); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
    const navigate = useCallback((v: string) => { if (!navigation.some(n => n.id === v)) return; setView(v); window.location.hash = v; window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

    const accounts = useMemo(() => {
        const result: Record<Network, boolean> = { telegram: false, max: false };
        for (const account of data.socialAccounts) {
            result[account.provider] = account.enabled && account.connectionStatus === 'CONNECTED';
        }
        return result;
    }, [data.socialAccounts]);

    const save = async (post: Post, status: Status) => {
        if (saveLock.current) return;
        if (status !== 'draft' && status !== 'scheduled') return;
        const error = validatePost(post, status);
        if (error) { toast.error(error); return; }
        saveLock.current = true;
        setSaveBusy(true);
        try {
            const saved = fromServerPost(await savePostApi(toSavePostInput(post, status), post.id || undefined));
            setData(current => ({ ...current, posts: current.posts.some(item => item.id === saved.id) ? current.posts.map(item => item.id === saved.id ? saved : item) : [saved, ...current.posts] }));
            setDraft(blankPost());
            if (view !== 'dashboard') navigate('content');
            toast.success(status === 'draft' ? 'Черновик сохранён' : 'Расписание сохранено');
        } catch (error) {
            toast.error(errorMessage(error, 'Не удалось сохранить пост. Текст остался в редакторе.'));
        } finally {
            saveLock.current = false;
            setSaveBusy(false);
        }
    };

    const editPost = (post: Post) => { setDraft({ ...post, mediaIds: [...post.mediaIds], networks: [...post.networks], overrides: { ...post.overrides } }); setDetailId(null); navigate('create'); };
    const createPost = (date?: string, time?: string) => { setDraft({ ...blankPost(), ...(date ? { date } : {}), ...(time ? { time } : {}) }); navigate('create'); };

    const reschedule = async (post: Post, date: string, time: string) => {
        const next = movePost(post, date, time);
        const validation = validatePost(next, 'scheduled');
        if (validation) { toast.error(validation); return; }
        try {
            const saved = fromServerPost(await savePostApi(toSavePostInput(next, 'scheduled'), post.id));
            setData(current => ({ ...current, posts: current.posts.map(item => item.id === post.id ? saved : item) }));
            toast.success(`Пост перенесён на ${dateLabel(date)}, ${time}`);
        } catch (error) {
            toast.error(errorMessage(error, 'Не удалось перенести публикацию.'));
        }
    };

    const upload = async (files: FileList | File[]): Promise<Media[]> => {
        const added: Media[] = [];
        for (const file of Array.from(files)) {
            try {
                const item = toUiMedia(await uploadMediaApi(file));
                added.push(item);
                setData(current => ({ ...current, media: [...current.media.filter(media => media.id !== item.id), item] }));
            } catch (error) {
                toast.error(`${file.name}: ${errorMessage(error, 'не удалось загрузить файл')}`);
            }
        }
        if (added.length) toast.success(`Добавлено файлов: ${added.length}`);
        return added;
    };

    const details = data.posts.find(p => p.id === detailId);
    const composer = { draft, setDraft, media: data.media, upload, save, saving: saveBusy, accounts };

    const updateAccount = async (id: string, enabled: boolean) => {
        try {
            const saved = await setAccountEnabledApi(id, enabled);
            setData(current => ({ ...current, socialAccounts: current.socialAccounts.map(account => account.id === saved.id ? saved : account) }));
            toast.success(enabled ? 'Площадка включена' : 'Площадка отключена');
        } catch (error) {
            toast.error(errorMessage(error, 'Не удалось изменить площадку.'));
        }
    };

    const updateName = async (name: string) => {
        try {
            const saved = await saveProfileApi({ displayName: name });
            setData(current => ({ ...current, name: saved.displayName }));
            toast.success('Имя сохранено');
        } catch (error) {
            toast.error(errorMessage(error, 'Не удалось сохранить имя.'));
        }
    };

    const confirmDelete = async () => {
        if (!confirm) return;
        const selected = confirm;
        try {
            if (selected.type === 'post') {
                await removePostApi(selected.id);
                setData(current => ({ ...current, posts: current.posts.filter(post => post.id !== selected.id) }));
                setDetailId(null);
            } else {
                await removeMediaApi(selected.id);
                setData(current => ({ ...current, media: current.media.filter(media => media.id !== selected.id) }));
                setDraft(current => ({ ...current, mediaIds: current.mediaIds.filter(id => id !== selected.id) }));
            }
            setConfirm(null);
            toast.success('Удалено');
        } catch (error) {
            toast.error(errorMessage(error, 'Не удалось удалить.'));
        }
    };

    return <SidebarProvider style={{ '--sidebar-width': '228px', '--sidebar-width-icon': '72px' } as CSSProperties}><Navigation view={view} navigate={navigate} posts={data.posts}/><div className="app-main"><header className="topbar"><div className="topbar-left"><SidebarTrigger className="mobile-menu"/><div className="global-search"><Search size={18}/><input placeholder="Поиск по постам, медиа, хештегам…" aria-label="Поиск по постам, медиа, хештегам" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') navigate('content'); }}/><kbd>↵</kbd></div></div><div className="topbar-right"><span className="demo-pill">MVP</span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="notifications" aria-label="Уведомления"><Bell size={19}/>{data.posts.some(p => p.status === 'failed') && <i />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="notification-menu"><DropdownMenuLabel>Уведомления</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate('calendar')}><Clock size={16}/>{data.posts.filter(p => p.status === 'scheduled').length} поста в расписании</DropdownMenuItem></DropdownMenuContent></DropdownMenu><span className="topbar-divider"/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="profile-button"><span className="user-avatar">{data.name.slice(0, 1).toUpperCase()}</span><span>{data.name}</span><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => navigate('settings')}><SettingsIcon size={16}/>Настройки профиля</DropdownMenuItem><DropdownMenuItem onClick={() => navigate('socials')}><Share2 size={16}/>Мои соцсети</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header><main className={`workspace view-${view}`} id="workspace">{loadError && <div className="notice error"><Info size={18}/><p>Не удалось загрузить серверные данные. Обнови страницу после восстановления соединения.</p></div>}{!ready ? <div className="loading-state"><Loader2 className="animate-spin"/><p>Открываем твоё пространство…</p></div> : <>{view === 'dashboard' && <Dashboard posts={data.posts} media={data.media} accounts={accounts} navigate={navigate} openPost={p => setDetailId(p.id)} composer={composer} name={data.name}/>} {view === 'create' && <><div className="page-heading"><div><div className="eyebrow">ОТ ИДЕИ К ПУБЛИКАЦИИ</div><h1>{draft.id ? 'Редактировать пост' : 'Создать пост'}</h1><p>Текст, медиа и площадки — всё на одном экране.</p></div><span className="pill neutral">Content Core</span></div><Composer {...composer}/></>}{view === 'calendar' && <Calendar posts={data.posts} openPost={p => setDetailId(p.id)} createPost={createPost} reschedule={reschedule}/>} {view === 'content' && <Content posts={data.posts} media={data.media} query={query} setQuery={setQuery} openPost={p => setDetailId(p.id)} editPost={editPost} create={() => createPost()} deletePost={p => setConfirm({ type: 'post', id: p.id, label: p.text.split('\n')[0] })} duplicatePost={p => { setDraft({ ...p, id: '', status: 'draft', targets: [] }); navigate('create'); toast.info('Копия открыта в редакторе. Сохрани её как новый пост.'); }}/>}{view === 'media' && <MediaLibrary media={data.media} upload={upload} remove={m => setConfirm({ type: 'media', id: m.id, label: m.name })} useMedia={m => { setDraft({ ...blankPost(), mediaIds: [m.id] }); navigate('create'); }}/>}{view === 'socials' && <SocialAccounts accounts={data.socialAccounts} toggle={(id, value) => { void updateAccount(id, value); }}/>}{view === 'analytics' && <Analytics posts={data.posts}/>} {view === 'settings' && <Settings name={data.name} saveName={name => { void updateName(name); }}/>}</>}</main></div><Sheet open={!!details} onOpenChange={open => { if (!open) setDetailId(null); }}><SheetContent className="post-sheet">{details && <><SheetTitle>Публикация</SheetTitle><SheetDescription>{dateLabel(details.date)} · {details.time} МСК</SheetDescription><StatusBadge status={details.status}/><Poster post={details} media={data.media}/><p className="detail-text">{details.text}</p><div className="target-statuses"><h3>Статус по каждой соцсети</h3>{details.targets.map(t => <div key={t.network}><SocialIcon network={t.network} small/><span>{networkNames[t.network]}</span><StatusBadge status={t.status}/></div>)}</div><div className="detail-actions"><Action secondary onClick={() => editPost(details)}><Pencil size={16}/>Редактировать / перенести</Action><Button variant="ghost" className="delete-button" onClick={() => setConfirm({ type: 'post', id: details.id, label: details.text.split('\n')[0] })}><Trash2 size={16}/>Удалить пост</Button></div></>}</SheetContent></Sheet><AlertDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogTitle>{confirm?.type === 'media' ? 'Удалить файл?' : 'Удалить публикацию?'}</AlertDialogTitle><AlertDialogDescription>«{confirm?.label}» будет удалён с сервера.{confirm?.type === 'media' ? ' Прикреплённый к посту файл удалить нельзя.' : ' Это действие нельзя отменить.'}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction className="destructive-action" onClick={() => { void confirmDelete(); }}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster position="bottom-right" richColors theme="light"/></SidebarProvider>;
}

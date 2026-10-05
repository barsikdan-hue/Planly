'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Home, CalendarDays, FileText, ImageIcon, Share2, BarChart3, Settings as SettingsIcon, Search, Bell, ChevronDown, Pencil, Trash2, Clock, Info, Layers, Loader2, Copy } from 'lucide-react';
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
import { ContentLibrary } from './content-library';
import { SwipePlanner } from './swipe-planner';
import { submitSwipeApproval, retrySwipeApproval, type SwipeApproval } from '@/lib/client/swipe-planner';
import { Settings, Analytics } from './settings';
import { normalizePlannerView } from '@/lib/planner-navigation';
import { clearSavedRecovery, editorFields, readRecovery, restoreRecovery, sessionRecoveryStorage, shouldReplaceEditor, writeRecovery, type EditorFields } from '@/lib/client/editor-recovery';
import { completePendingCreation, readPendingCreation, submitPendingCreation, type CreationIntent } from '@/lib/client/pending-creation';
import { SocialIcon, Poster, StatusBadge, Action, dateLabel } from './common';
import { blankPost, validatePost, movePost, networkNames, fromServerPost, toSavePostInput, toPublishNowInput, hasPendingPublications, type ComposerPostInput, type Post, type Media, type Network, type Status } from '@/lib/planner';
import type { SocialAccountDto } from '@/lib/contracts/planner';
import type { CreateLibraryItemInput, LibraryItemDto } from '@/lib/contracts/library';
import {
    loadPlanner,
    loadLibraryItems,
    createLibraryItem,
    updateLibraryItem,
    removeLibraryItem,
    archiveLibraryItem as archiveLibraryItemApi,
    loadPlannerSlot,
    PlanlyApiError,
    savePost as savePostApi,
    removePost as removePostApi,
    saveProfile as saveProfileApi,
    setAccountEnabled as setAccountEnabledApi,
    connectSocialAccount as connectSocialAccountApi,
    uploadMedia as uploadMediaApi,
    removeMedia as removeMediaApi,
    type MediaAssetWithPreview,
} from '@/lib/client/planly-api';

const navigation = [{ id: 'dashboard', label: 'Главная', icon: Home }, { id: 'calendar', label: 'Календарь', icon: CalendarDays }, { id: 'content', label: 'Библиотека', icon: FileText }, { id: 'media', label: 'Медиа', icon: ImageIcon }, { id: 'analytics', label: 'Аналитика', icon: BarChart3 }, { id: 'settings', label: 'Настройки', icon: SettingsIcon }];

type PlannerData = {
    posts: Post[];
    media: Media[];
    name: string;
    socialAccounts: SocialAccountDto[];
    libraryItems: LibraryItemDto[];
};

const initial: PlannerData = { posts: [], media: [], name: 'Данил', socialAccounts: [], libraryItems: [] };

type ComposerUploadContext = { ownerId: string; token: string; generation: number };
type ComposerUploadBatch = { id: string; context: ComposerUploadContext };

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
    const [contentTab, setContentTab] = useState<'prepared' | 'publications'>('prepared');
    const [reviewing, setReviewing] = useState(false);
    const [draft, setDraftState] = useState<Post>(blankPost);
    const draftRef = useRef(draft);
    const editorRevision = useRef(0);
    const [initialEditorToken] = useState(() => crypto.randomUUID());
    const editorToken = useRef(initialEditorToken);
    const [editorKey, setEditorKey] = useState(initialEditorToken);
    const [creationPending, setCreationPending] = useState(false);
    const recoveryOwner = useRef<string | null>(null);
    const persistedEditor = useRef<EditorFields | null>(null);
    const recoveryErrorShown = useRef(false);
    const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<{ type: 'post' | 'media'; id: string; label: string } | null>(null);
    const saveLock = useRef(false);
    const libraryRevision = useRef(0);
    const [saveBusy, setSaveBusy] = useState(false);
    const composerLifetime = useRef({ mounted: false, ownerId: null as string | null, generation: 0 });
    const composerBatches = useRef(new Map<string, ComposerUploadBatch>());
    const [composerUploads, setComposerUploads] = useState<{
        ownerId: string | null; generation: number; batches: ComposerUploadBatch[];
    }>({ ownerId: null, generation: 0, batches: [] });

    const publishComposerUploads = useCallback(() => {
        const lifetime = composerLifetime.current;
        if (!lifetime.mounted) return;
        setComposerUploads({ ownerId: lifetime.ownerId, generation: lifetime.generation,
            batches: Array.from(composerBatches.current.values()) });
    }, []);
    const bindComposerUploadOwner = useCallback((ownerId: string) => {
        const lifetime = composerLifetime.current;
        if (lifetime.ownerId !== ownerId) {
            lifetime.ownerId = ownerId;
            lifetime.generation += 1;
            composerBatches.current.clear();
        }
        publishComposerUploads();
    }, [publishComposerUploads]);
    useEffect(() => {
        const lifetime = composerLifetime.current;
        const batches = composerBatches.current;
        lifetime.mounted = true;
        lifetime.generation += 1;
        publishComposerUploads();
        return () => {
            lifetime.mounted = false;
            lifetime.generation += 1;
            batches.clear();
        };
    }, [publishComposerUploads]);

    const isCurrentComposerOwner = (context: ComposerUploadContext) => {
        const lifetime = composerLifetime.current;
        return lifetime.mounted && lifetime.ownerId === context.ownerId &&
            recoveryOwner.current === context.ownerId && lifetime.generation === context.generation;
    };
    const isCurrentComposerEditor = (context: ComposerUploadContext) =>
        isCurrentComposerOwner(context) && editorToken.current === context.token;
    const hasPendingComposerUpload = () => Array.from(composerBatches.current.values())
        .some(batch => isCurrentComposerEditor(batch.context));

    const updateEditorToken = useCallback((token: string) => {
        editorToken.current = token;
        setEditorKey(token);
    }, []);

    const warnRecoveryUnavailable = useCallback(() => {
        if (recoveryErrorShown.current) return;
        recoveryErrorShown.current = true;
        toast.error('Восстановление после обновления страницы недоступно. Не закрывай вкладку до подтверждения сохранения.');
    }, []);

    // Persist outside React updater functions, which Strict Mode may run twice.
    const setDraft: Dispatch<SetStateAction<Post>> = useCallback(update => {
        const updated = typeof update === 'function' ? update(draftRef.current) : update;
        const next = updated.id ? { ...updated, sourceLibraryItemId: null } : updated;
        draftRef.current = next;
        editorRevision.current += 1;
        setDraftState(next);
        if (!recoveryOwner.current) return;
        const storage = sessionRecoveryStorage();
        if (!storage || !writeRecovery(storage, recoveryOwner.current, next)) warnRecoveryUnavailable();
        else persistedEditor.current = editorFields(next);
    }, [warnRecoveryUnavailable]);

    const clearSubmittedEditor = (post: Post, revision: number): boolean => {
        if (editorRevision.current !== revision) return false;
        if (recoveryOwner.current) {
            const storage = sessionRecoveryStorage();
            if (!storage || !clearSavedRecovery(storage, recoveryOwner.current, persistedEditor.current ?? post)) { warnRecoveryUnavailable(); return false; }
            else persistedEditor.current = null;
        }
        const next = blankPost();
        draftRef.current = next;
        editorRevision.current += 1;
        updateEditorToken(crypto.randomUUID());
        setDraftState(next);
        setRecoveryNotice(null);
        return true;
    };

    useEffect(() => {
        let active = true;
        loadPlanner().then(snapshot => {
            if (!active) return;
            const posts = snapshot.posts.map(fromServerPost);
            const media = snapshot.media.map(toUiMedia);
            setData({
                posts,
                media,
                name: snapshot.profile.displayName,
                socialAccounts: snapshot.socialAccounts,
                libraryItems: snapshot.libraryItems,
            });
            recoveryOwner.current = snapshot.profile.id;
            bindComposerUploadOwner(snapshot.profile.id);
            const storage = sessionRecoveryStorage();
            if (!storage) warnRecoveryUnavailable();
            else {
                const cached = readRecovery(storage, snapshot.profile.id);
                if (cached.unavailable) warnRecoveryUnavailable();
                else if (cached.invalid) toast.error('Локальный черновик повреждён и не восстановлен.');
                else if (cached.editor) {
                    persistedEditor.current = cached.editor;
                    const restored = restoreRecovery(cached.editor, posts, media);
                    draftRef.current = restored.draft;
                    editorRevision.current += 1;
                    setDraftState(restored.draft);
                    setRecoveryNotice(`${restored.missingPost ? 'Исходный пост удалён. Текст восстановлен как новый черновик.' : 'Несохранённый пост восстановлен в этой вкладке.'}${restored.missingMediaCount ? ` Удалённые файлы исключены: ${restored.missingMediaCount}.` : ''}`);
                    if (!writeRecovery(storage, snapshot.profile.id, restored.draft)) warnRecoveryUnavailable();
                    else persistedEditor.current = editorFields(restored.draft);
                }
                try {
                    const pending = readPendingCreation(storage, snapshot.profile.id);
                    if (pending) {
                        if (pending.origin !== 'swipe-planner') updateEditorToken(pending.activeEditorToken);
                        setCreationPending(true);
                        if (pending.origin !== 'swipe-planner' && !cached.editor && pending.editorToken === pending.activeEditorToken) {
                            const restored = restoreRecovery(pending.editor, posts, media);
                            draftRef.current = restored.draft;
                            editorRevision.current += 1;
                            setDraftState(restored.draft);
                        }
                        if (pending.origin !== 'swipe-planner' && pending.acknowledgedId && pending.editorToken === editorToken.current) {
                            const next = { ...draftRef.current, id: pending.acknowledgedId, sourceLibraryItemId: null };
                            draftRef.current = next; setDraftState(next);
                            if (writeRecovery(storage, snapshot.profile.id, next)) persistedEditor.current = editorFields(next);
                        }
                        setRecoveryNotice('Предыдущее создание поста ещё не завершено в этой вкладке. Повтори сохранение, чтобы проверить его результат.');
                    }
                } catch (error) {
                    setCreationPending(true);
                    setRecoveryNotice(errorMessage(error, 'Не удалось восстановить предыдущее сохранение.'));
                }
            }
            setLoadError(false);
        }).catch(error => {
            if (!active) return;
            setLoadError(true);
            toast.error(errorMessage(error, 'Не удалось загрузить данные Planly.'));
        }).finally(() => { if (active) setReady(true); });
        return () => { active = false; };
    }, [warnRecoveryUnavailable, updateEditorToken, bindComposerUploadOwner]);

    useEffect(() => {
        const sync = () => {
            const hash = window.location.hash.slice(1);
            const nextView = normalizePlannerView(hash) ?? 'dashboard';
            if (hash === 'socials') window.history.replaceState(window.history.state, '', '#settings');
            if (nextView !== 'content') { setContentTab('prepared'); setReviewing(false); }
            setView(nextView);
        };
        sync();
        window.addEventListener('hashchange', sync);
        return () => window.removeEventListener('hashchange', sync);
    }, []);
    const navigate = useCallback((v: string) => {
        const nextView = normalizePlannerView(v);
        if (!nextView) return;
        setContentTab('prepared');
        if (nextView !== 'content') setReviewing(false);
        setView(nextView);
        window.location.hash = nextView;
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, []);

    const hasScheduledPosts = hasPendingPublications(data.posts);
    useEffect(()=>{
        if (!ready || !hasScheduledPosts) return;
        let active=true;
        let busy=false;
        const poll=async()=>{
            if (busy || document.hidden || saveLock.current) return;
            busy=true;
            const revision = libraryRevision.current;
            try {
                const snapshot=await loadPlanner();
                if (active && !saveLock.current) setData(current=>({...current,posts:snapshot.posts.map(fromServerPost),socialAccounts:snapshot.socialAccounts,libraryItems:revision === libraryRevision.current ? snapshot.libraryItems : current.libraryItems}));
            } catch { /* Initial loading and mutations already display errors; polling remains quiet. */ }
            finally {busy=false;}
        };
        const timer=setInterval(()=>{void poll();},5000);
        return ()=>{active=false;clearInterval(timer);};
    },[ready,hasScheduledPosts,data.posts]);

    const connectSocial = async(id:string,destinationId:string)=>{
        try {
            const account=await connectSocialAccountApi(id,destinationId);
            setData(current=>({...current,socialAccounts:current.socialAccounts.map(item=>item.id===id ? account : item)}));
            toast.success(`${networkNames[account.provider]} подключён: права публикации подтверждены`);
        } catch(error) {toast.error(errorMessage(error,'Не удалось подключить площадку.'));}
    };

    const accounts = useMemo(() => {
        const result: Record<Network, boolean> = { telegram: false, max: false };
        for (const account of data.socialAccounts) {
            result[account.provider] = account.enabled && account.connectionStatus === 'CONNECTED';
        }
        return result;
    }, [data.socialAccounts]);

    const submitEditor = async (post: Post, input: () => ComposerPostInput, intent: CreationIntent, token: string) => {
        const storage = sessionRecoveryStorage();
        const owner = recoveryOwner.current;
        const pending = storage && owner ? readPendingCreation(storage, owner) : null;
        if (pending?.origin === 'swipe-planner') throw new Error('Сначала восстанови предыдущее одобрение в Swipe Planner.');
        if (post.id && !pending) return { saved: await savePostApi(input(), post.id), pending: null, belongsToEditor: true, updateError: undefined };
        if (!storage || !owner) throw new Error('Не удалось сохранить повторяемый запрос в этой вкладке. Новый пост не отправлен.');
        try {
            const result = await submitPendingCreation(storage, owner, token, post, input, intent);
            setCreationPending(true);
            return result;
        } catch (error) {
            const pending = readPendingCreation(storage, owner);
            setCreationPending(!!pending);
            if (pending) setRecoveryNotice('Результат предыдущего создания поста пока не подтверждён. Повтори сохранение, чтобы восстановить его без нового поста.');
            throw error;
        }
    };

    const acknowledgeEditor = (result: Awaited<ReturnType<typeof submitEditor>>, post: Post, revision: number, token: string): boolean => {
        let cleared = false;
        if (result.belongsToEditor && editorToken.current === token) {
            if (result.updateError || editorRevision.current !== revision) setDraft(current => ({ ...current, id: result.saved.id }));
            else {
                cleared = clearSubmittedEditor(post, revision);
                if (!cleared) setDraft(current => ({ ...current, id: result.saved.id }));
            }
        }
        const storage = sessionRecoveryStorage();
        if (result.pending && storage && recoveryOwner.current) {
            // Persist the acknowledged ID before discarding the durable original request.
            const differentEditor = !result.belongsToEditor || editorToken.current !== token;
            const editorDurable = cleared || persistedEditor.current?.id === result.saved.id ||
                (differentEditor && JSON.stringify(persistedEditor.current) === JSON.stringify(editorFields(draftRef.current)));
            if (editorDurable) {
                try { completePendingCreation(storage, recoveryOwner.current, result.pending.key); setCreationPending(false); }
                catch { warnRecoveryUnavailable(); }
            }
        }
        return cleared;
    };

    const editBlockedReasonFor = (post: Post): string | null => post.id
        ? data.posts.find(item => item.id === post.id)?.editBlockedReason ?? post.editBlockedReason ?? null : null;
    const noteEditConflict = (post: Post, error: unknown) => {
        if (!(error instanceof PlanlyApiError) || error.status !== 409 || !error.body || typeof error.body !== 'object' ||
            !('code' in error.body) || error.body.code !== 'POST_EDIT_BLOCKED') return;
        const id = post.id || draftRef.current.id;
        if (!id) return;
        setData(current => ({ ...current, posts: current.posts.map(item => item.id === id ? { ...item, editBlockedReason: error.message } : item) }));
        if (draftRef.current.id === id) setDraft(current => ({ ...current, editBlockedReason: error.message }));
    };

    const save = async (post: Post, status: Status) => {
        if (saveLock.current || hasPendingComposerUpload()) return;
        if (status !== 'draft' && status !== 'scheduled') return;
        const blockedReason = editBlockedReasonFor(post);
        if (!creationPending && blockedReason) { toast.error(blockedReason); return; }
        const error = creationPending ? null : validatePost(post, status);
        if (error) { toast.error(error); return; }
        saveLock.current = true;
        setSaveBusy(true);
        const revision = editorRevision.current;
        const token = editorToken.current;
        try {
            const result = await submitEditor(post, () => toSavePostInput(post, status), status, token);
            const saved = fromServerPost(result.saved);
            setData(current => ({ ...current, posts: current.posts.some(item => item.id === saved.id) ? current.posts.map(item => item.id === saved.id ? saved : item) : [saved, ...current.posts] }));
            const cleared = acknowledgeEditor(result, post, revision, token);
            await refreshSourceLibrary(post, result);
            if (result.updateError) throw result.updateError;
            if (cleared && view !== 'dashboard') navigate('content');
            toast.success(result.belongsToEditor ? (status === 'draft' ? 'Черновик сохранён' : 'Расписание сохранено') : 'Предыдущее сохранение восстановлено. Теперь можно сохранить текущий черновик.');
        } catch (error) {
            noteEditConflict(post, error);
            toast.error(errorMessage(error, 'Не удалось сохранить пост. Текст остался в редакторе.'));
        } finally {
            saveLock.current = false;
            setSaveBusy(false);
        }
    };

    const replaceEditor = (next: Post, preservesCurrent = false): boolean => {
        const storage = sessionRecoveryStorage();
        if (storage && recoveryOwner.current) {
            try {
                if (readPendingCreation(storage, recoveryOwner.current)) {
                    toast.error('Сначала повтори предыдущее сохранение, чтобы восстановить его результат.');
                    return false;
                }
            }
            catch { toast.error('Сначала восстанови результат предыдущего сохранения.'); return false; }
        }
        if (!preservesCurrent && shouldReplaceEditor(draftRef.current, next, data.posts) && !window.confirm('В редакторе есть несохранённые изменения. Заменить их другим постом?')) return false;
        const nextToken = crypto.randomUUID();
        updateEditorToken(nextToken);
        setDraft(next);
        setRecoveryNotice(null);
        navigate('create');
        return true;
    };
    const editPost = (post: Post) => {
        if (editBlockedReasonFor(post)) { setDetailId(post.id); return; }
        if (replaceEditor({ ...post, sourceLibraryItemId: null, mediaIds: [...post.mediaIds], networks: [...post.networks], overrides: { ...post.overrides } })) setDetailId(null);
    };
    const duplicatePost = (post: Post, preservesCurrent = false) => {
        if (replaceEditor({ ...post, id: '', sourceLibraryItemId: null, status: 'draft', targets: [], editBlockedReason: null,
            mediaIds: [...post.mediaIds], networks: [...post.networks], overrides: { ...post.overrides } }, preservesCurrent)) {
            setDetailId(null);
            toast.info('Копия открыта в редакторе. Сохрани её как новый пост.');
        }
    };
    const createPost = (date?: string, time?: string) => { replaceEditor({ ...blankPost(), ...(date ? { date } : {}), ...(time ? { time } : {}) }); };

    const createFromLibrary = (item: LibraryItemDto) => {
        const source = data.libraryItems.find(current => current.id === item.id);
        if (source?.status !== 'READY') return;
        replaceEditor({ ...blankPost(), text: source.text, mediaIds: [...source.mediaIds], sourceLibraryItemId: source.id });
    };

    const saveLibraryItem = async (input: CreateLibraryItemInput & { status?: 'READY' | 'ARCHIVED' }, id?: string) => {
        const saved = id ? await updateLibraryItem(id, { ...input, status: input.status ?? 'READY' }) : await createLibraryItem(input);
        libraryRevision.current += 1;
        setData(current => ({ ...current, libraryItems: [saved, ...current.libraryItems.filter(item => item.id !== saved.id)] }));
    };
    const deleteLibraryItem = async (id: string) => {
        await removeLibraryItem(id);
        libraryRevision.current += 1;
        setData(current => ({ ...current, libraryItems: current.libraryItems.filter(item => item.id !== id) }));
    };
    const refreshSourceLibrary = async (post: Post, result: Awaited<ReturnType<typeof submitEditor>>) => {
        if (!post.sourceLibraryItemId && !result.pending?.input.sourceLibraryItemId) return;
        try {
            let revision = libraryRevision.current;
            let libraryItems = await loadLibraryItems();
            // A concurrent Library acknowledgement invalidates the older list,
            // but the newly consumed source still needs an authoritative refresh.
            while (revision !== libraryRevision.current) {
                revision = libraryRevision.current;
                libraryItems = await loadLibraryItems();
            }
            libraryRevision.current += 1;
            setData(current => ({ ...current, libraryItems }));
        } catch {
            toast.error('Пост сохранён, но библиотеку не удалось обновить. Обнови страницу, чтобы увидеть статус заготовки.');
        }
    };

    const acknowledgeQueue = async (result: Awaited<ReturnType<typeof submitSwipeApproval>>) => {
        const saved = fromServerPost(result.saved);
        setData(current => ({ ...current, posts: current.posts.some(post => post.id === saved.id)
            ? current.posts.map(post => post.id === saved.id ? saved : post) : [saved, ...current.posts] }));
        const storage = sessionRecoveryStorage();
        if (!storage || !recoveryOwner.current) throw new Error('Не удалось завершить восстановление. Повтори сохранение.');
        completePendingCreation(storage, recoveryOwner.current, result.pending.key);
        setCreationPending(false); setRecoveryNotice(null);
        await refreshSourceLibrary({ ...blankPost(), sourceLibraryItemId: result.pending.input.sourceLibraryItemId }, result);
        return { id: saved.id, scheduledAt: result.saved.targets.find(target => target.scheduledAt)?.scheduledAt ?? null };
    };

    const refreshQueueConflict = async (error: unknown) => {
        if (!(error instanceof PlanlyApiError) || !error.body || typeof error.body !== 'object' ||
            !('code' in error.body) || !['LIBRARY_SOURCE_STALE', 'LIBRARY_SOURCE_CONFLICT'].includes(String(error.body.code))) return;
        const revision = ++libraryRevision.current;
        try {
            const libraryItems = await loadLibraryItems();
            if (revision === libraryRevision.current) setData(current => ({ ...current, libraryItems }));
        } catch { toast.error('Не удалось обновить заготовку. Обнови страницу перед повторным одобрением.'); }
    };

    const approveQueueItem = async (item: LibraryItemDto, approval: SwipeApproval) => {
        if (saveLock.current || creationPending) throw new Error('Сначала восстанови предыдущее сохранение.');
        const storage = sessionRecoveryStorage(); const owner = recoveryOwner.current;
        if (!storage || !owner) throw new Error('Повторяемый запрос недоступен. Новый пост не отправлен.');
        saveLock.current = true; setSaveBusy(true);
        try { return await acknowledgeQueue(await submitSwipeApproval(storage, owner, item, approval)); }
        catch (error) {
            const pending = readPendingCreation(storage, owner); setCreationPending(!!pending);
            if (pending) setRecoveryNotice('Результат одобрения пока не подтверждён. Повтори сохранение с исходным запросом.');
            await refreshQueueConflict(error);
            throw error;
        } finally { saveLock.current = false; setSaveBusy(false); }
    };

    const rejectQueueItem = async (item: LibraryItemDto) => {
        if (saveLock.current || creationPending) throw new Error('Сначала восстанови предыдущее сохранение.');
        saveLock.current = true; setSaveBusy(true);
        try {
            const archived = await archiveLibraryItemApi(item.id, item.updatedAt);
            libraryRevision.current += 1;
            setData(current => ({ ...current, libraryItems: current.libraryItems.map(value => value.id === archived.id ? archived : value) }));
        } catch (error) { await refreshQueueConflict(error); throw error; }
        finally { saveLock.current = false; setSaveBusy(false); }
    };

    const reschedule = async (post: Post, date: string, time: string) => {
        if (creationPending) { toast.error('Сначала повтори предыдущее сохранение, чтобы восстановить его результат.'); return; }
        const blockedReason = editBlockedReasonFor(post);
        if (blockedReason) { toast.error(blockedReason); return; }
        const next = movePost(post, date, time);
        const validation = validatePost(next, 'scheduled');
        if (validation) { toast.error(validation); return; }
        try {
            const saved = fromServerPost(await savePostApi(toSavePostInput(next, 'scheduled'), post.id));
            setData(current => ({ ...current, posts: current.posts.map(item => item.id === post.id ? saved : item) }));
            toast.success(`Пост перенесён на ${dateLabel(date)}, ${time}`);
        } catch (error) {
            noteEditConflict(post, error);
            toast.error(errorMessage(error, 'Не удалось перенести публикацию.'));
        }
    };

    const upload = async (files: FileList | File[], canApply?: () => boolean, canNotify?: () => boolean): Promise<Media[]> => {
        const added: Media[] = [];
        for (const file of Array.from(files)) {
            if (canApply && !canApply()) break;
            try {
                const item = toUiMedia(await uploadMediaApi(file));
                if (canApply && !canApply()) break;
                added.push(item);
                setData(current => ({ ...current, media: [...current.media.filter(media => media.id !== item.id), item] }));
            } catch (error) {
                if ((!canApply || canApply()) && (canNotify ? canNotify() : !canApply))
                    toast.error(`${file.name}: ${errorMessage(error, 'не удалось загрузить файл')}`);
            }
        }
        if (added.length && (!canApply || canApply()) && (canNotify ? canNotify() : !canApply))
            toast.success(`Добавлено файлов: ${added.length}`);
        return added;
    };

    const uploadComposerEditor = async (files: FileList | File[], context: ComposerUploadContext): Promise<void> => {
        if (!isCurrentComposerEditor(context) || !files.length) return;
        const batch: ComposerUploadBatch = { id: crypto.randomUUID(), context };
        // Register before awaiting: direct submit callbacks consult this map.
        composerBatches.current.set(batch.id, batch);
        publishComposerUploads();
        try {
            const added = await upload(files, () => isCurrentComposerOwner(context), () => isCurrentComposerEditor(context));
            if (added.length && isCurrentComposerEditor(context)) {
                // A whole batch appends on completion; its files retain input order.
                setDraft(current => ({ ...current,
                    mediaIds: [...new Set([...current.mediaIds, ...added.map(item => item.id)])] }));
            }
        } catch (error) {
            if (isCurrentComposerEditor(context)) toast.error(errorMessage(error, 'Не удалось загрузить файлы.'));
        } finally {
            composerBatches.current.delete(batch.id);
            if (isCurrentComposerOwner(context)) publishComposerUploads();
        }
    };

    const details = data.posts.find(p => p.id === detailId);
    const publishNow = async(post:Post)=>{
        if (saveLock.current || hasPendingComposerUpload()) return;
        const blockedReason = editBlockedReasonFor(post);
        if (!creationPending && blockedReason) { toast.error(blockedReason); return; }
        const error = validatePost(post,'draft');
        if (!creationPending && (error || !post.networks.length || post.networks.some(network=>!accounts[network]))) {
            toast.error(error ?? 'Выбери подключённый канал для публикации.'); return;
        }
        saveLock.current=true;setSaveBusy(true);
        const revision = editorRevision.current;
        const token = editorToken.current;
        try {
            const result=await submitEditor(post,()=>toPublishNowInput(post),'now',token);
            const saved=fromServerPost(result.saved);
            setData(current=>({...current,posts:current.posts.some(item=>item.id===saved.id) ? current.posts.map(item=>item.id===saved.id ? saved : item) : [saved,...current.posts]}));
            const cleared = acknowledgeEditor(result, post, revision, token);
            await refreshSourceLibrary(post, result);
            if (result.updateError) throw result.updateError;
            if (cleared) navigate('content');
            toast.success(result.belongsToEditor ? 'Пост передан в очередь. Ждём подтверждения площадки.' : 'Предыдущее сохранение восстановлено. Теперь можно сохранить текущий черновик.');
        } catch(error) {noteEditConflict(post, error); toast.error(errorMessage(error,'Не удалось отправить пост в очередь.'));}
        finally {saveLock.current=false;setSaveBusy(false);}
    };

    const retryCreation = async () => {
        if (hasPendingComposerUpload()) return;
        const storage = sessionRecoveryStorage();
        if (!storage || !recoveryOwner.current) return;
        try {
            const pending = readPendingCreation(storage, recoveryOwner.current);
            if (!pending) return;
            if (pending.origin === 'swipe-planner') {
                if (saveLock.current) return;
                saveLock.current = true; setSaveBusy(true);
                try { await acknowledgeQueue(await retrySwipeApproval(storage, recoveryOwner.current)); }
                finally { setCreationPending(!!readPendingCreation(storage, recoveryOwner.current)); saveLock.current = false; setSaveBusy(false); }
                return;
            }
            if (pending.intent === 'now') await publishNow(draftRef.current);
            else await save(draftRef.current, pending.intent);
        } catch (error) { toast.error(errorMessage(error, 'Не удалось восстановить сохранение.')); }
    };

    const editorBlockedReason = editBlockedReasonFor(draft);
    const composerContext: ComposerUploadContext = {
        ownerId: composerUploads.ownerId ?? '', token: editorKey, generation: composerUploads.generation,
    };
    const composer = { draft, setDraft, media: data.media, upload,
        uploadControl: {
            busy: composerUploads.batches.some(batch => batch.context.ownerId === composerContext.ownerId &&
                batch.context.generation === composerContext.generation && batch.context.token === composerContext.token),
            addFiles: (files: FileList | File[]) => uploadComposerEditor(files, composerContext),
        },
        save: (post: Post, status: Status) => { if (isCurrentComposerEditor(composerContext)) return save(post, status); },
        publishNow: (post: Post) => { if (isCurrentComposerEditor(composerContext)) return publishNow(post); },
        saving: saveBusy, accounts,
        editBlockedReason: editorBlockedReason, duplicatePost: () => duplicatePost(draftRef.current, true) };

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
        if (creationPending) { toast.error('Сначала повтори предыдущее сохранение, чтобы восстановить его результат.'); return; }
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

    return <SidebarProvider style={{ '--sidebar-width': '228px', '--sidebar-width-icon': '72px' } as CSSProperties}><Navigation view={view} navigate={navigate} posts={data.posts}/><div className="app-main"><header className="topbar"><div className="topbar-left"><SidebarTrigger className="mobile-menu"/><div className="global-search"><Search size={18}/><input placeholder="Поиск по постам, медиа, хештегам…" aria-label="Поиск по постам, медиа, хештегам" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { navigate('content'); setContentTab('publications'); } }}/><kbd>↵</kbd></div></div><div className="topbar-right"><span className="demo-pill">MVP</span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="notifications" aria-label="Уведомления"><Bell size={19}/>{data.posts.some(p => p.status === 'failed') && <i />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="notification-menu"><DropdownMenuLabel>Уведомления</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate('calendar')}><Clock size={16}/>{data.posts.filter(p => p.status === 'scheduled').length} поста в расписании</DropdownMenuItem></DropdownMenuContent></DropdownMenu><span className="topbar-divider"/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="profile-button"><span className="user-avatar">{data.name.slice(0, 1).toUpperCase()}</span><span>{data.name}</span><ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => navigate('settings')}><SettingsIcon size={16}/>Настройки профиля</DropdownMenuItem><DropdownMenuItem onClick={() => navigate('settings')}><Share2 size={16}/>Мои соцсети</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header><main className={`workspace view-${view}`} id="workspace">{creationPending && <div className="notice"><Info size={18}/><p>Проверь результат предыдущего создания поста перед новым сохранением.</p><Button onClick={() => { void retryCreation(); }} disabled={saveBusy || composer.uploadControl.busy}>Повторить сохранение</Button></div>}{loadError && <div className="notice error"><Info size={18}/><p>Не удалось загрузить серверные данные. Обнови страницу после восстановления соединения.</p></div>}{recoveryNotice && <div className="notice"><Info size={18}/><p>{recoveryNotice} На сервер он попадёт после сохранения.</p><button className="inline-link" onClick={() => navigate('create')}>Открыть редактор</button></div>}{!ready ? <div className="loading-state"><Loader2 className="animate-spin"/><p>Открываем твоё пространство…</p></div> : <>{view === 'dashboard' && <Dashboard createPost={() => createPost()} posts={data.posts} media={data.media} accounts={accounts} navigate={navigate} openPost={p => setDetailId(p.id)} composer={composer} name={data.name}/>} {view === 'create' && <><div className="page-heading"><div><div className="eyebrow">ОТ ИДЕИ К ПУБЛИКАЦИИ</div><h1>{editorBlockedReason ? 'Просмотр поста' : draft.id ? 'Редактировать пост' : 'Создать пост'}</h1><p>Текст, медиа и площадки — всё на одном экране.</p></div><span className="pill neutral">Content Core</span></div><Composer key={editorKey} {...composer}/></>}{view === 'calendar' && <Calendar posts={data.posts} openPost={p => setDetailId(p.id)} createPost={createPost} reschedule={reschedule}/>} {view === 'content' && reviewing && <SwipePlanner items={data.libraryItems} media={data.media} socialAccounts={data.socialAccounts} busy={saveBusy} pending={creationPending} onPreview={loadPlannerSlot} onApprove={approveQueueItem} onReject={rejectQueueItem} onEdit={createFromLibrary} onClose={() => setReviewing(false)} onOpenPost={setDetailId}/>} {view === 'content' && !reviewing && <ContentLibrary startReview={() => setReviewing(true)} items={data.libraryItems} media={data.media} posts={data.posts} activeTab={contentTab} onTabChange={setContentTab} upload={upload} saveItem={saveLibraryItem} deleteItem={deleteLibraryItem} createPublication={createFromLibrary} openPublication={setDetailId}><Content posts={data.posts} media={data.media} query={query} setQuery={setQuery} openPost={p => setDetailId(p.id)} editPost={editPost} create={() => createPost()} deletePost={p => setConfirm({ type: 'post', id: p.id, label: p.text.split('\n')[0] })} duplicatePost={duplicatePost}/></ContentLibrary>}{view === 'media' && <MediaLibrary media={data.media} upload={upload} remove={m => setConfirm({ type: 'media', id: m.id, label: m.name })} useMedia={m => { replaceEditor({ ...blankPost(), mediaIds: [m.id] }); }}/>}{view === 'analytics' && <Analytics posts={data.posts}/>} {view === 'settings' && <Settings name={data.name} saveName={name => { void updateName(name); }} accounts={data.socialAccounts} connect={connectSocial} toggle={(id, value) => { void updateAccount(id, value); }}/>}</>}</main></div><Sheet open={!!details} onOpenChange={open => { if (!open) setDetailId(null); }}><SheetContent className="post-sheet">{details && <><SheetTitle>Публикация</SheetTitle><SheetDescription>{dateLabel(details.date)} · {details.time} МСК</SheetDescription><StatusBadge status={details.status}/><Poster post={details} media={data.media}/><p className="detail-text">{details.text}</p><div className="target-statuses"><h3>Статус по каждой соцсети</h3>{details.targets.map(t => <div key={t.network}><SocialIcon network={t.network} small/><span>{networkNames[t.network]}</span><StatusBadge status={t.status}/>{t.error && <small role="status">{t.error}</small>}{t.remoteUrl && <a href={t.remoteUrl} target="_blank" rel="noopener noreferrer">Открыть в {networkNames[t.network]}</a>}</div>)}</div><div className="detail-actions">{details.editBlockedReason ? <><p className="mini-note" role="status">{details.editBlockedReason}</p><Action secondary onClick={() => duplicatePost(details)}><Copy size={16}/>Дублировать в черновик</Action></> : <Action secondary onClick={() => editPost(details)}><Pencil size={16}/>Редактировать / перенести</Action>}<Button variant="ghost" className="delete-button" onClick={() => setConfirm({ type: 'post', id: details.id, label: details.text.split('\n')[0] })}><Trash2 size={16}/>Удалить пост</Button></div></>}</SheetContent></Sheet><AlertDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogTitle>{confirm?.type === 'media' ? 'Удалить файл?' : 'Удалить публикацию?'}</AlertDialogTitle><AlertDialogDescription>«{confirm?.label}» будет удалён из Planly.{confirm?.type === 'media' ? ' Прикреплённый к посту файл удалить нельзя.' : ' Уже опубликованные сообщения в Telegram и MAX останутся. Это действие нельзя отменить.'}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction className="destructive-action" onClick={() => { void confirmDelete(); }}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster position="bottom-right" richColors theme="light"/></SidebarProvider>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import type { LibraryItemDto } from '../../lib/contracts/library';

type SharedItem = { id: string; title: string | null; text: string; updatedAt: string; media: { name: string; mimeType: string; previewUrl: string }[] };
type CopyIntent = { key: string; ids: string[] };
const failure = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие.';

function recoverCopy(storageKey: string | null): { intent: CopyIntent | null; error: string | null } {
    if (!storageKey || typeof window === 'undefined') return { intent: null, error: null };
    try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (!raw) return { intent: null, error: null };
        const intent = JSON.parse(raw) as CopyIntent;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent.key) || !Array.isArray(intent.ids) || !intent.ids.length || intent.ids.length > 20 || new Set(intent.ids).size !== intent.ids.length || intent.ids.some(id => typeof id !== 'string' || !id)) throw new Error('Invalid recovery');
        return { intent, error: null };
    } catch { return { intent: null, error: 'Не удалось восстановить результат копирования. Не создавай повторную копию до проверки личной библиотеки.' }; }
}

async function readResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const code = await response.json().then(value => value?.code).catch(() => undefined);
        const message = response.status === 422 && code === 'SHARED_COPY_LIMIT_EXCEEDED' ? 'За один раз можно скопировать не более 20 медиафайлов общим размером до 100 MiB. Уменьши выбор. Если лимит превышает один материал, попроси администратора разделить его.'
            : response.status === 504 && code === 'SHARED_COPY_TIMEOUT' ? 'Копирование медиа превысило 60 секунд. Повтори проверку результата с прежним запросом.'
            : response.status === 401 ? 'Сессия истекла. Войди снова.' : response.status === 403 ? 'Доступ запрещён.' : response.status === 404 ? 'Материал больше недоступен.' : response.status === 409 ? 'Материал изменился. Обнови библиотеку.' : response.status === 410 ? 'Личная копия уже удалена.' : 'Не удалось выполнить действие. Проверь результат перед новым копированием.';
        throw Object.assign(new Error(message), { status: response.status });
    }
    return response.json() as Promise<T>;
}

export function useLibrarySharing() {
    const [admin, setAdmin] = useState(false);
    const [sourceIds, setSources] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lifetime = useRef<AbortController | null>(null), lock = useRef(false);
    useEffect(() => {
        const controller = new AbortController(); lifetime.current = controller;
        void fetch('/api/admin/shared-library', { cache: 'no-store', signal: controller.signal }).then(async response => {
            if (response.status === 403) return;
            const result = await readResponse<{ sourceIds: string[] }>(response);
            if (!Array.isArray(result.sourceIds) || result.sourceIds.some(id => typeof id !== 'string')) throw new Error('Не удалось проверить доступ к общей библиотеке.');
            if (!controller.signal.aborted) { setSources(result.sourceIds); setAdmin(true); }
        }).catch(error => { if (!controller.signal.aborted) setError(failure(error)); });
        return () => controller.abort();
    }, []);
    const toggle = async (id: string) => {
        const controller = lifetime.current;
        if (!admin || !controller || controller.signal.aborted || lock.current) return;
        lock.current = true; setBusy(true); setError(null);
        const shared = !sourceIds.includes(id);
        try {
            await readResponse(await fetch(`/api/admin/shared-library/${encodeURIComponent(id)}`, { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shared }) }));
            if (!controller.signal.aborted) setSources(current => shared ? [...new Set([...current, id])] : current.filter(value => value !== id));
        } catch (error) { if (!controller.signal.aborted) { setError(failure(error)); if ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 403) { setSources([]); setAdmin(false); } } }
        finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
    };
    return { admin, sourceIds, busy, error, toggle };
}

export function SharedLibrary({ ownerId, onCopied }: { ownerId?: string; onCopied: (items: LibraryItemDto[]) => Promise<void> }) {
    const storageKey = ownerId ? `planly.shared-copy.${ownerId}` : null;
    const [recovery] = useState(() => recoverCopy(storageKey));
    const [items, setItems] = useState<SharedItem[]>([]);
    const [selected, setSelected] = useState<string[]>(recovery.intent?.ids ?? []);
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(recovery.error), [notice, setNotice] = useState<string | null>(recovery.intent ? 'Предыдущее копирование требует проверки результата.' : null);
    const [pending, setPending] = useState<CopyIntent | null>(recovery.intent);
    const lifetime = useRef<AbortController | null>(null), lock = useRef(!!recovery.error);
    useEffect(() => {
        const controller = new AbortController(); lifetime.current = controller;
        void fetch('/api/shared-library', { cache: 'no-store', signal: controller.signal }).then(readResponse<{ items: SharedItem[] }>).then(result => { if (!controller.signal.aborted) setItems(result.items); }).catch(error => {
            if (!controller.signal.aborted) { setError(failure(error)); if ((error as { status?: number }).status === 401) window.location.assign('/login'); }
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [storageKey]);
    const copy = async (ids: string[]) => {
        const controller = lifetime.current;
        if (!controller || controller.signal.aborted || lock.current || !ids.length) return;
        lock.current = true; setBusy(true); setError(null); setNotice(null);
        const intent = pending ?? { key: crypto.randomUUID(), ids: [...ids] };
        let copyConfirmed = false;
        try {
            if (storageKey) {
                const encoded = JSON.stringify(intent); window.sessionStorage.setItem(storageKey, encoded);
                if (window.sessionStorage.getItem(storageKey) !== encoded) throw new Error('Не удалось сохранить защиту от повторного копирования.');
            }
            setPending(intent);
            const result = await readResponse<{ items: LibraryItemDto[] }>(await fetch('/api/shared-library/copy', { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json', 'idempotency-key': intent.key }, body: JSON.stringify({ ids: intent.ids }) }));
            copyConfirmed = true;
            if (controller.signal.aborted) return;
            await onCopied(result.items);
            if (controller.signal.aborted) return;
            if (storageKey) window.sessionStorage.removeItem(storageKey);
            setPending(null); setSelected([]); setNotice(`Добавлено в мои заготовки: ${result.items.length}.`);
        } catch (error) {
            if (controller.signal.aborted) return;
            setError(failure(error));
            const status = (error as { status?: number }).status;
            // A later personal-list refresh can itself fail (including 404
            // after concurrent deletion). It cannot invalidate a committed
            // copy's receipt or authorize a new idempotency key.
            if (!copyConfirmed && status && [400, 403, 404, 409, 410, 422].includes(status)) { if (storageKey) window.sessionStorage.removeItem(storageKey); setPending(null); }
            if (status === 401) { setItems([]); setSelected([]); window.location.assign('/login'); }
        } finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
    };
    return <section aria-label="Общая библиотека">
        <p className="mini-note">Выбери материалы администратора. Личная копия останется редактируемой и независимой.</p>
        {loading && <p role="status">Загрузка общей библиотеки…</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {pending ? <Button disabled={busy || !!recovery.error} onClick={() => copy(pending.ids)}>Проверить результат копирования</Button> : <Button disabled={busy || !!recovery.error || !selected.length} onClick={() => copy(selected)}>Добавить выбранные себе · {selected.length}</Button>}
        {!loading && !items.length && <p className="notice">В общей библиотеке пока нет материалов.</p>}
        <div className="content-grid library-grid">{items.map(item => <article key={item.id} className="content-card library-card">
            {!!item.media.length && <div className="library-media-preview">{item.media.map((media, index) => media.mimeType.startsWith('video/') ? <video key={index} src={media.previewUrl} controls preload="metadata" aria-label={media.name}/> : <img key={index} src={media.previewUrl} alt={media.name} loading="lazy"/>)}</div>}
            <div className="content-card-body"><label><input type="checkbox" checked={selected.includes(item.id)} disabled={busy || !!recovery.error || !!pending || (selected.length >= 20 && !selected.includes(item.id))} aria-label={`Выбрать ${item.title || 'материал'}`} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))}/> Выбрать</label>
                <h2>{item.title || 'Без названия'}</h2><p className="library-text-preview">{item.text}</p>
                <div className="library-card-actions"><Button disabled={busy || !!recovery.error || !!pending} onClick={() => copy([item.id])}>Добавить себе</Button></div>
            </div>
        </article>)}</div>
    </section>;
}

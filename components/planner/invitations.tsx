'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

type Invitation = { id: string; email: string; status: string; expiresAt: string; createdAt: string };
const states: Record<string, string> = { PENDING: 'Ожидает активации', ACCEPTED: 'Активировано', REVOKED: 'Отозвано', EXPIRED: 'Истекло' };

export function InvitationsEntry() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/invitations', { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setAllowed(response.ok); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return allowed ? <p><a href="/admin/invitations">Приглашения коллег</a></p> : null;
}

export function Invitations() {
  const [email, setEmail] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [link, setLink] = useState('');
  const [linkId, setLinkId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load(signal?: AbortSignal) {
    const response = await fetch('/api/admin/invitations', { cache: 'no-store', signal });
    if (signal?.aborted) return;
    if (response.status === 401) { window.location.assign('/login'); return; }
    if (response.status === 403) { window.location.assign('/'); return; }
    if (!response.ok) throw new Error('Не удалось загрузить приглашения.');
    const body = await response.json(); if (!signal?.aborted) setInvitations(body.invitations);
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/invitations', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (!response.ok) { setError('Не удалось загрузить приглашения.'); return; }
        const body = await response.json();
        if (!controller.signal.aborted) setInvitations(body.invitations);
      }).catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить приглашения.'); });
    return () => controller.abort();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice(''); setLink(''); setLinkId('');
    try {
      const response = await fetch('/api/admin/invitations', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? 'Не удалось создать приглашение.'); return; }
      setLink(`${window.location.origin}/invite#token=${encodeURIComponent(body.token)}`); setLinkId(body.id); setEmail('');
      await load();
    } catch { setError('Не удалось подтвердить создание. Проверь список приглашений перед повтором.'); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/invitations/${encodeURIComponent(id)}`, { method: 'DELETE', cache: 'no-store' });
      if (!response.ok) { setError('Не удалось отозвать приглашение.'); return; }
      if (id === linkId) { setLink(''); setLinkId(''); } await load();
    } catch { setError('Не удалось подтвердить отзыв. Обнови список.'); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice('Ссылка скопирована. Передай её коллеге лично.'); }
    catch { setNotice('Выдели и скопируй ссылку из поля.'); }
  }
  return <main className="invitations-shell"><section className="invitations-card">
    <Link href="/">← В Planly</Link><h1>Приглашения</h1><p>Доступ к личному кабинету. Передай ссылку адресату самостоятельно; она действует 24 часа и используется один раз.</p>
    <form onSubmit={create}><label htmlFor="invitation-email">Email</label><input id="invitation-email" type="email" required maxLength={320} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/><button type="submit" disabled={busy}>{busy ? 'Подождите…' : 'Пригласить'}</button></form>
    {link && <div className="invitation-link"><label htmlFor="invitation-link">Одноразовая ссылка</label><input id="invitation-link" readOnly value={link} onFocus={event => event.target.select()}/><button type="button" onClick={() => { void copy(); }}>Копировать ссылку</button><p>Скопируй сейчас: после обновления страницы ссылка не восстанавливается.</p></div>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <h2>Список приглашений</h2>{!invitations.length && <p>Приглашений пока нет.</p>}<ul>{invitations.map(invitation => <li key={invitation.id}><div><strong>{invitation.email}</strong><span>{states[invitation.status] ?? invitation.status}</span><small>Действует до {new Date(invitation.expiresAt).toLocaleString('ru-RU')}</small></div>{invitation.status === 'PENDING' && <button type="button" disabled={busy} onClick={() => { void revoke(invitation.id); }}>Отозвать</button>}</li>)}</ul>
  </section></main>;
}

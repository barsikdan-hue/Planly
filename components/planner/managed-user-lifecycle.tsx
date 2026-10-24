'use client';
import { useEffect, useRef, useState } from 'react';
type User = { id: string; email: string; accessExpiresAt?: string | null };
export function ManagedUserLifecycle({ user, onChanged, onDeleted }: { user: User; onChanged: (value: User) => void; onDeleted: () => void }) {
  const [until, setUntil] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetLink, setResetLink] = useState('');
  const inFlight = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [user.id]);
  async function mutate(body: object) {
    const controller = lifetime.current;
    if (inFlight.current || !controller || controller.signal.aborted) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice(''); setResetLink('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { window.location.assign(response.status === 401 ? '/login' : '/'); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось подтвердить действие. Обновите список перед повтором.');
      if (result.resetToken) { setResetLink(`${window.location.origin}/reset-password#token=${encodeURIComponent(result.resetToken)}`); setNotice('Одноразовая ссылка действует 30 минут. Передайте её агенту безопасным способом.'); }
      else if (result.deleted) { setNotice('Доступ и записи удалены. Очистка файлов и очереди продолжается до подтверждённого завершения.'); setDeleting(false); onDeleted(); }
      else { setNotice('Срок доступа обновлён. Блокировка пользователя не изменена.'); if (result.user) onChanged(result.user); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Результат неизвестен. Обновите список перед повтором.'); }
    finally { inFlight.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section aria-label={`Доступ ${user.email}`}>
    <p>{user.accessExpiresAt ? `Доступ до ${new Date(user.accessExpiresAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК` : 'Бессрочный доступ'}</p>
    <label>Продлить до (МСК)<input aria-label={`Срок доступа ${user.email} (МСК)`} type="datetime-local" value={until} disabled={busy} onChange={event => setUntil(event.target.value)} /></label>
    <button type="button" disabled={busy || !until} onClick={() => { if (until) void mutate({ action: 'expire', expiresAt: new Date(`${until}:00+03:00`).toISOString() }); }}>Сохранить срок</button>
    <button type="button" disabled={busy} onClick={() => mutate({ action: 'unlimited' })}>Бессрочный доступ</button>
    <button type="button" disabled={busy} onClick={() => mutate({ action: 'reset-password' })}>Сбросить пароль</button>
    {resetLink && <label>Ссылка сброса<input aria-label="Одноразовая ссылка сброса" readOnly value={resetLink} /></label>}
    <button type="button" disabled={busy} onClick={() => { setDeleting(true); setConfirmation(''); }}>Удалить агента</button>
    {deleting && <section role="alertdialog" aria-label={`Удалить ${user.email}`}>
      <p>Удалить аккаунт {user.email}, его материалы и историю без возможности отмены? Отправки с неопределённым результатом блокируют удаление. Файлы очищаются подтверждённой фоновой задачей.</p>
      <label>Введите email агента<input aria-label="Email для подтверждения удаления" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => setDeleting(false)}>Отменить удаление</button>
      <button type="button" disabled={busy || confirmation.trim().toLowerCase() !== user.email.trim().toLowerCase()} onClick={() => { if (confirmation.trim().toLowerCase() === user.email.trim().toLowerCase()) return mutate({ action: 'delete', confirmedEmail: confirmation.trim().toLowerCase() }); }}>Подтвердить удаление</button>
    </section>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}

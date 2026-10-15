'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import '../login/login.css';

export default function InvitePage() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activating = useRef(false);
  useEffect(() => {
    let disposed = false;
    let inspection: AbortController | undefined;
    const inspectLink = () => {
      if (disposed) return;
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      // Clear every incoming bearer fragment, including same-document navigation.
      window.history.replaceState(null, '', '/invite');
      // Do not admit a second activation while the first can still set a cookie.
      if (activating.current) return;
      inspection?.abort();
      const controller = new AbortController(); inspection = controller;
      setToken(value); setEmail(''); setPassword(''); setConfirmation(''); setError(''); setChecking(true);
      if (!value) { setError('Приглашение недействительно. Попроси администратора новую ссылку.'); setChecking(false); return; }
      void fetch('/api/auth/invitations/inspect', { method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) })
        .then(async response => {
          const body = await response.json();
          if (controller.signal.aborted || disposed) return;
          if (!response.ok) { setError(body.error ?? 'Приглашение недействительно.'); return; }
          setEmail(body.email);
        }).catch(() => { if (!controller.signal.aborted && !disposed) setError('Не удалось проверить приглашение. Открой ссылку повторно.'); })
        .finally(() => { if (!controller.signal.aborted && !disposed) setChecking(false); });
    };
    window.addEventListener('hashchange', inspectLink);
    // Defer the first browser read; a Strict Mode cleanup cancels this callback.
    queueMicrotask(inspectLink);
    return () => { disposed = true; inspection?.abort(); window.removeEventListener('hashchange', inspectLink); };
  }, []);
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activating.current || !email) return;
    if (password !== confirmation) { setError('Пароли не совпадают.'); return; }
    activating.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/invitations/accept', { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error ?? 'Не удалось активировать аккаунт.'); return; }
      setToken(''); setPassword(''); setConfirmation(''); window.location.assign('/');
    } catch { setError('Сервер недоступен. Повтори попытку.'); }
    finally { activating.current = false; setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card">
    <div className="login-brand">planly.</div><h1>Принять приглашение</h1>
    <p>{checking ? 'Проверяем приглашение…' : email ? `Личный кабинет для ${email}` : 'Доступ предоставляется администратором.'}</p>
    {email && <form onSubmit={activate}>
      <label htmlFor="invite-password">Пароль</label><input id="invite-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
      <label htmlFor="invite-confirmation">Подтверждение пароля</label><input id="invite-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}/>
      <p>От 12 до 128 символов.</p><button type="submit" disabled={busy}>{busy ? 'Активируем…' : 'Активировать аккаунт'}</button>
    </form>}
    {error && <p role="alert" className="login-error">{error}</p>}<p><a href="/login">Войти в Planly</a></p>
  </section></main>;
}

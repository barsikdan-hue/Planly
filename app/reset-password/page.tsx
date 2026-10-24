'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import '../login/login.css';
export default function PasswordResetPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
      window.history.replaceState(null, '', '/reset-password');
      if (value) setToken(value);
    };
    read(); window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !token || password !== confirmation || password.length < 12) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/password-reset', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось изменить пароль.');
      setToken(''); setPassword(''); setConfirmation(''); setDone(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Результат неизвестен. Попробуйте войти с новым паролем или запросите новую ссылку.'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card"><h1>Новый пароль</h1>
    {done ? <p role="status">Пароль изменён. Старые сессии отозваны. <Link href="/login">Войти</Link></p> : <form onSubmit={event => { void submit(event); }}>
      {!token && <p role="alert">Откройте одноразовую ссылку, полученную от администратора.</p>}
      <label>Новый пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      <label>Повторите пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
      {confirmation && confirmation !== password && <p>Пароли должны совпадать.</p>}{error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || !token || password !== confirmation || password.length < 12}>{busy ? 'Сохраняем…' : 'Изменить пароль'}</button>
    </form>}
  </section></main>;
}

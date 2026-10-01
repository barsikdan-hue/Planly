'use client';

import { useState, type FormEvent } from 'react';
import './login.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Не удалось войти.');
        return;
      }
      window.location.assign('/');
    } catch {
      setError('Сервер недоступен. Повтори попытку.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">planly.</div>
        <h1>Личное пространство</h1>
        <p>Вход только для владельца.</p>
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="login-password">Пароль</label>
          <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error ? <p role="alert" className="login-error">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        </form>
      </section>
    </main>
  );
}

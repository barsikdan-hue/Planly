'use client';

import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './login.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const passwordSelection = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const input = passwordInput.current;
    const selection = passwordSelection.current;
    if (!input || !selection) return;
    // Chromium can reset selection during layout after changing a focused input's type.
    input.getBoundingClientRect();
    input.setSelectionRange(selection.start, selection.end, selection.direction);
    passwordSelection.current = null;
  }, [passwordVisible]);

  function togglePasswordVisibility() {
    const input = passwordInput.current;
    if (input && input.selectionStart !== null && input.selectionEnd !== null) {
      passwordSelection.current = { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection ?? 'none' };
    }
    setPasswordVisible((visible) => !visible);
  }

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
        <div className="login-brand">Lentaro</div>
        <h1>Личное пространство</h1>
        <p>Вход в личный кабинет.</p>
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="login-password">Пароль</label>
          <div className="login-password-field">
            <input ref={passwordInput} id="login-password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button
              type="button"
              className="login-password-toggle"
              aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
              aria-controls="login-password"
              aria-pressed={passwordVisible}
              onPointerDown={(event) => event.preventDefault()}
              onClick={togglePasswordVisibility}
            >
              {passwordVisible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
          {error ? <p role="alert" className="login-error">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        </form>
      </section>
    </main>
  );
}

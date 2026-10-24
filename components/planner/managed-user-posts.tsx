'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link.js';

type Target = { provider: string; scheduledAt: string | null; publication: { status: string } | null };
type Post = { id: string; title: string | null; baseText: string; status: string; targets: Target[] };

export function ManagedUserPosts({ userId, email, displayName }: { userId: string; email: string; displayName: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch(`/api/admin/users/${encodeURIComponent(userId)}/posts`, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(); setPosts((await response.json()).posts); }).catch(() => setError('Не удалось загрузить публикации.')); }, [userId]);
  async function reschedule(post: Post, target: Target, value: string) {
    if (!value || target.publication?.status === 'PUBLISHED') return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/posts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: post.id, provider: target.provider, scheduledAt: new Date(value).toISOString() }) });
      if (!response.ok) throw new Error();
      await response.json();
      setNotice('Дата публикации изменена.');
      const refreshed = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/posts`, { cache: 'no-store' });
      setPosts((await refreshed.json()).posts);
    } catch { setError('Не удалось изменить дату публикации.'); } finally { setBusy(false); }
  }
  return <main className="users-shell"><section className="users-card">
    <Link href="/admin/users">← Пользователи</Link><h1>{displayName}</h1><p>{email}</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!posts.length && !error && <p>Публикаций пока нет.</p>}
    {posts.length > 0 && <table className="users-list"><thead><tr><th>Пост</th><th>Статус</th><th>Площадка и время</th></tr></thead><tbody>{posts.map(post => <tr key={post.id}><td><strong>{post.title || post.baseText.slice(0, 80)}</strong></td><td>{post.targets.some(target => target.publication?.status === 'PUBLISHED') ? 'Опубликован' : post.status}</td><td>{post.targets.map(target => <label key={target.provider} style={{ display: 'block', marginBottom: 8 }}>{target.provider.toUpperCase()} <input type="datetime-local" disabled={busy || target.publication?.status === 'PUBLISHED'} defaultValue={target.scheduledAt ? new Date(target.scheduledAt).toISOString().slice(0, 16) : ''} onChange={event => void reschedule(post, target, event.target.value)} /></label>)}</td></tr>)}</tbody></table>}
  </section></main>;
}

'use client';
import { useEffect, useState } from 'react';
export function ManualAccessNotice() {
  const [access, setAccess] = useState<{ expiresAt: string | null; canPublish: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/access', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.ok) { const value = await response.json(); if (!controller.signal.aborted) setAccess(value); }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!access?.expiresAt) return null;
  return <p role="status">{access.canPublish ? 'Доступ до' : 'Срок доступа истёк'} {new Date(access.expiresAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК.{!access.canPublish && ' Материалы сохранены. Новые действия и отправки приостановлены; для продления обратитесь к администратору. Отмена публикаций доступна.'}</p>;
}

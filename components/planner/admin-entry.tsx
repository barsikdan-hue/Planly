'use client';

import { useEffect, useState } from 'react';

export function AdminEntry() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/users', { cache: 'no-store', signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setAllowed(response.ok);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return allowed ? <p><a href="/admin">Администрирование коллег</a></p> : null;
}

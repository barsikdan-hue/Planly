import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { UsersRound, UserPlus } from 'lucide-react';
import { getDb } from '../../db/index';
import { users } from '../../db/schema';
import { requireOwner } from '../../lib/server/auth/next-owner';
import './admin.css';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const identity = await requireOwner();
  const [user] = await getDb()
    .select({ role: users.role, accessState: users.accessState })
    .from(users)
    .where(eq(users.id, identity.id));

  if (user?.role !== 'ADMIN' || user.accessState !== 'ACTIVE') redirect('/');

  return <main className="admin-shell">
    <section className="admin-card">
      <Link className="admin-back" href="/">← В Lentaro</Link>
      <div className="admin-heading">
        <span>КОМАНДА LENTARO</span>
        <h1>Администрирование</h1>
        <p>Приглашай коллег и управляй их доступом к сервису.</p>
      </div>
      <div className="admin-actions">
        <Link href="/admin/invitations">
          <UserPlus aria-hidden="true" />
          <span><strong>Пригласить коллегу</strong><small>Создай одноразовую ссылку на 24 часа и передай её адресату лично.</small></span>
          <b aria-hidden="true">→</b>
        </Link>
        <Link href="/admin/users">
          <UsersRound aria-hidden="true" />
          <span><strong>Управление коллегами</strong><small>Просматривай пользователей, блокируй или восстанавливай доступ.</small></span>
          <b aria-hidden="true">→</b>
        </Link>
      </div>
      <p className="admin-privacy">У каждого коллеги отдельное рабочее пространство. Администратор управляет доступом, но не просматривает личные материалы и подключения коллег.</p>
    </section>
  </main>;
}

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '../../../../db/index';
import { users } from '../../../../db/schema';
import { requireOwner } from '../../../../lib/server/auth/next-owner';
import { ManagedUserPosts } from '../../../../components/planner/managed-user-posts';
import '../users.css';

export const dynamic = 'force-dynamic';

export default async function ManagedUserPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireOwner();
  const [admin] = await getDb().select({ role: users.role, accessState: users.accessState }).from(users).where(eq(users.id, identity.id));
  const { id } = await params;
  const [managed] = await getDb().select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, id));
  if (admin?.role !== 'ADMIN' || admin.accessState !== 'ACTIVE' || !managed) redirect('/admin/users');
  return <ManagedUserPosts userId={id} email={managed.email} displayName={managed.displayName} />;
}

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '../../../db/index';
import { users } from '../../../db/schema';
import { requireOwner } from '../../../lib/server/auth/next-owner';
import { Invitations } from '../../../components/planner/invitations';
import './invitations.css';

export const dynamic = 'force-dynamic';

export default async function InvitationsPage() {
  const owner = await requireOwner();
  const [user] = await getDb().select({ role: users.role, accessState: users.accessState }).from(users).where(eq(users.id, owner.id));
  if (user?.role !== 'ADMIN' || user.accessState !== 'ACTIVE') redirect('/');
  return <Invitations />;
}

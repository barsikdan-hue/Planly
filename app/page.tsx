import PlannerApp from '@/components/planner/app';
import { requireOwner } from '@/lib/server/auth/next-owner';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await requireOwner();
  return <PlannerApp />;
}

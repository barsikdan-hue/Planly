import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { posts, postTargets, publications, socialAccounts, users } from '../../db/schema.ts';
import { toDbProvider, type Provider } from '../contracts/planner.ts';
import { slotQuerySchema, type SlotQuery } from '../contracts/swipe-planner.ts';
import { findNextSlot, slotMinuteKey } from '../planner-slots.ts';

export type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export class PlannerSlotConflictError extends Error {
  constructor() { super('Выбранный слот уже занят или прошёл. Обнови слот и подтверди снова.'); this.name = 'PlannerSlotConflictError'; }
}
export class LibrarySourceStaleError extends Error {
  constructor() { super('Заготовка изменилась. Обнови её и проверь содержимое снова.'); this.name = 'LibrarySourceStaleError'; }
}
export class PlannerAccountUnavailableError extends Error {
  constructor() { super('Для планирования выбери включённые подключённые сети.'); this.name = 'PlannerAccountUnavailableError'; }
}

// One lock order for every Post create/update: owner → source/Post → publication.
export async function lockOwnerSchedule(tx: Transaction, userId: string): Promise<void> {
  const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for('update');
  if (!owner) throw new Error('Owner not found');
}

export async function requirePlannerAccounts(tx: Transaction, userId: string, providers: Provider[]): Promise<void> {
  if (!providers.length) throw new PlannerAccountUnavailableError();
  const rows = await tx.select().from(socialAccounts).where(and(
    eq(socialAccounts.userId, userId), inArray(socialAccounts.provider, providers.map(toDbProvider)),
  ));
  if (rows.length !== new Set(providers).size || rows.some(account => !account.enabled || account.connectionStatus !== 'CONNECTED')) {
    throw new PlannerAccountUnavailableError();
  }
}

export async function occupiedSlotMinutes(tx: Transaction, userId: string, query: Pick<SlotQuery, 'providers'>): Promise<Set<string>> {
  const targets = await tx.select({ id: postTargets.id, scheduledAt: postTargets.scheduledAt }).from(postTargets)
    .innerJoin(socialAccounts, eq(postTargets.socialAccountId, socialAccounts.id))
    .innerJoin(posts, eq(postTargets.postId, posts.id))
    .where(and(eq(socialAccounts.userId, userId), eq(posts.userId, userId),
      inArray(socialAccounts.provider, query.providers.map(toDbProvider)), eq(postTargets.active, true)));
  const scheduled = targets.filter(target => target.scheduledAt !== null);
  if (!scheduled.length) return new Set();
  const history = await tx.select({ targetId: publications.postTargetId, status: publications.status }).from(publications)
    .where(and(eq(publications.userId, userId), inArray(publications.postTargetId, scheduled.map(target => target.id))))
    .orderBy(desc(publications.createdAt), desc(publications.id));
  const latest = new Map<string, string>();
  for (const row of history) if (!latest.has(row.targetId)) latest.set(row.targetId, row.status);
  return new Set(scheduled.filter(target => latest.get(target.id) !== 'CANCELLED').map(target => slotMinuteKey(target.scheduledAt!.toISOString())));
}

export async function previewPlannerSlot(userId: string, raw: SlotQuery, now = new Date()): Promise<{ scheduledAt: string | null }> {
  const query = slotQuerySchema.parse(raw);
  return getDb().transaction(async tx => {
    await requirePlannerAccounts(tx, userId, query.providers);
    return { scheduledAt: findNextSlot(query, await occupiedSlotMinutes(tx, userId, query), now) };
  });
}

import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { updateProfileInputSchema, type ProfileDto, type UpdateProfileInput } from '../contracts/planner.ts';

function toDto(row: typeof users.$inferSelect): ProfileDto {
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export async function getProfile(userId: string): Promise<ProfileDto> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new Error('Profile not found');
  return toDto(row);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
  const value = updateProfileInputSchema.parse(input);
  const db = getDb();
  const [row] = await db.update(users)
    .set({ displayName: value.displayName, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw new Error('Profile not found');
  return toDto(row);
}

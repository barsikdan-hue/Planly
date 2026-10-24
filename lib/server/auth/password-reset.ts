import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db/index.ts';
import { passwordResetTokens, sessions, users } from '../../../db/schema.ts';
import { getOwnerEmail } from '../env.ts';
import { hashOwnerPassword } from './password.ts';
import type { AuthTransaction } from './admin.ts';

export const passwordResetInputSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(12).max(128) }).strict();
export class PasswordResetError extends Error {
  constructor() { super('Ссылка сброса недействительна или истекла. Запросите новую у администратора.'); }
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function issuePasswordReset(tx: AuthTransaction, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await tx.insert(passwordResetTokens).values({ tokenHash: digest(token), userId, expiresAt });
  return { resetToken: token, resetExpiresAt: expiresAt };
}
export async function consumePasswordReset(raw: unknown) {
  const { token, password } = passwordResetInputSchema.parse(raw);
  const tokenHash = digest(token);
  const [reference] = await getDb().select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
  if (!reference || reference.expiresAt.getTime() <= Date.now()) throw new PasswordResetError();
  const passwordHash = await hashOwnerPassword(password);
  await getDb().transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, reference.userId)).for('update');
    const [capability] = await tx.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, tokenHash), eq(passwordResetTokens.userId, reference.userId))).for('update');
    if (!user || user.role !== 'USER' || !user.authInitialized || user.email.trim().toLowerCase() === getOwnerEmail() || !capability || capability.expiresAt.getTime() <= Date.now()) throw new PasswordResetError();
    await tx.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  });
  return { ok: true };
}

export type ManualAccess = { role: string; accessExpiresAt?: Date | null };
export function hasManualAccess(user: ManualAccess, now = new Date()): boolean {
  if (user.role === 'ADMIN' || user.accessExpiresAt == null) return true;
  return Number.isFinite(user.accessExpiresAt.getTime()) && user.accessExpiresAt.getTime() > now.getTime();
}

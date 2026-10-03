import { savePostInputSchema, type SavePostInput } from './contracts/planner.ts';

export function canonicalCreationInput(rawInput: SavePostInput): string {
  const input = savePostInputSchema.parse(rawInput);
  return JSON.stringify({ title: input.title ?? null, baseText: input.baseText, status: input.status,
    targets: input.targets.map(target => ({ provider: target.provider, textOverride: target.textOverride,
      scheduledAt: target.scheduledAt ? new Date(target.scheduledAt).toISOString() : null }))
      .sort((left, right) => left.provider.localeCompare(right.provider)),
    mediaIds: input.mediaIds });
}

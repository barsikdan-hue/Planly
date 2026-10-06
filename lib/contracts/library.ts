import { z } from 'zod';

export const libraryItemStatusSchema = z.enum(['READY', 'USED', 'ARCHIVED']);
export type LibraryItemStatus = z.infer<typeof libraryItemStatusSchema>;

const libraryContentShape = {
  title: z.string().trim().max(200).nullable().optional(),
  text: z.string().trim().max(20_000),
  mediaIds: z.array(z.string().min(1)).max(20).refine(
    ids => new Set(ids).size === ids.length,
    'Duplicate media id',
  ),
};

const hasContent = (input: { text: string; mediaIds: string[] }) => input.text.length > 0 || input.mediaIds.length > 0;
const contentRequired = { message: 'Add text or media to the library item', path: ['text'] };

export const createLibraryItemInputSchema = z.object(libraryContentShape).refine(hasContent, contentRequired);
export type CreateLibraryItemInput = z.infer<typeof createLibraryItemInputSchema>;

export const libraryCreationKeySchema = z.string().uuid().transform(key => key.toLowerCase());
export function canonicalLibraryCreateInput(raw: CreateLibraryItemInput): { title: string | null; text: string; mediaIds: string[] } {
  const parsed = createLibraryItemInputSchema.parse(raw);
  return { title: parsed.title ?? null, text: parsed.text, mediaIds: [...parsed.mediaIds] };
}

export const updateLibraryItemInputSchema = z.object({
  ...libraryContentShape,
  status: z.enum(['READY', 'ARCHIVED']),
}).refine(hasContent, contentRequired);
export type UpdateLibraryItemInput = z.infer<typeof updateLibraryItemInputSchema>;

export const archiveLibraryItemInputSchema = z.object({
  status: z.literal('ARCHIVED'),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
export const patchLibraryItemInputSchema = z.union([
  archiveLibraryItemInputSchema,
  // A conditional command cannot fall through to a full replacement that
  // strips the revision, even when stale content fields accompany it.
  z.object({ expectedUpdatedAt: z.never().optional() }).passthrough().pipe(updateLibraryItemInputSchema),
]);

export type LibraryItemDto = {
  id: string;
  title: string | null;
  text: string;
  status: LibraryItemStatus;
  mediaIds: string[];
  sourcePostId: string | null;
  createdAt: string;
  updatedAt: string;
};

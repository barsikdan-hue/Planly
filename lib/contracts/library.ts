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

export const updateLibraryItemInputSchema = z.object({
  ...libraryContentShape,
  status: z.enum(['READY', 'ARCHIVED']),
}).refine(hasContent, contentRequired);
export type UpdateLibraryItemInput = z.infer<typeof updateLibraryItemInputSchema>;

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

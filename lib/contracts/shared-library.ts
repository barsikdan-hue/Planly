import { z } from 'zod';

export type SharedLibraryItemDto = {
  id: string;
  title: string | null;
  text: string;
  updatedAt: string;
  media: Array<{ name: string; mimeType: string; previewUrl: string }>;
};
export const shareLibraryItemInputSchema = z.object({ shared: z.boolean() }).strict();
export const sharedLibraryCopyInputSchema = z.object({
  ids: z.array(z.string().uuid().transform(id => id.toLowerCase())).min(1).max(20)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate share id'),
}).strict();
export const sharedLibraryOperationKeySchema = z.string().uuid().transform(key => key.toLowerCase());

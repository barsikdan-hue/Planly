export function orderedPostMedia<T extends { id: string }>(mediaIds: readonly string[], library: readonly T[]): T[] {
  const byId = new Map(library.map(item => [item.id, item]));
  return mediaIds.flatMap(id => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

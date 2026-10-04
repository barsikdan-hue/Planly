export class LibrarySourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibrarySourceConflictError';
  }
}

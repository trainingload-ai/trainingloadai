/** A persistent ownership conflict requires operator review, not automatic retry. */
export class ImportIdentityConflictError extends Error {
  readonly code = 'IMPORT_IDENTITY_CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ImportIdentityConflictError';
  }
}

export class CoachTaskResultValidationError extends Error {
  constructor(
    readonly category: string,
    readonly code: string,
    readonly correction: string,
  ) {
    super(category);
    this.name = 'CoachTaskResultValidationError';
  }
}

const OFFSET_ISO = /(?:Z|[+-]\d{2}:\d{2})$/i;

export type MemoryValidationIssue = {
  field: string;
  reason:
    | 'missing'
    | 'wrong_type'
    | 'empty'
    | 'too_long'
    | 'invalid_value'
    | 'budget_exhausted';
  actualLength?: number;
  maxLength?: number;
};

export class MemoryValidationError extends Error {
  constructor(
    message: string,
    readonly issue?: MemoryValidationIssue,
  ) {
    super(message);
    this.name = 'MemoryValidationError';
  }
}

export function atMemoryValidationPath<T>(path: string, validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    if (
      error instanceof MemoryValidationError &&
      !(error instanceof MemoryIsolationError)
    ) {
      const issue = error.issue ?? {
        field: 'decision',
        reason: 'invalid_value' as const,
      };
      throw new MemoryValidationError(error.message, {
        ...issue,
        field: issue.field === 'decision' ? path : `${path}.${issue.field}`,
      });
    }
    throw error;
  }
}

/**
 * A tenant-boundary violation is not a transient model or database failure.
 * Workers use this subtype to stop retrying instead of repeatedly probing a
 * fact or job that the authenticated user does not own.
 */
export class MemoryIsolationError extends MemoryValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryIsolationError';
  }
}

export function assertIanaTimezone(value: string): string {
  const timezone = String(value ?? '').trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new MemoryValidationError('Invalid IANA timezone', {
      field: 'timezone',
      reason: 'invalid_value',
    });
  }
  return timezone;
}

export function parseMemoryInstant(
  value: unknown,
  field: string,
): Date | undefined {
  if (value == null || value === '') return undefined;
  // Never let the server process timezone reinterpret a model-produced local
  // timestamp. The Judge receives the IANA zone and must return an absolute
  // instant with an explicit offset; we then normalize it to UTC for storage.
  if (typeof value !== 'string' || !OFFSET_ISO.test(value)) {
    throw new MemoryValidationError(
      `${field} must include an explicit offset`,
      {
        field,
        reason: 'invalid_value',
      },
    );
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new MemoryValidationError(`${field} is invalid`, {
      field,
      reason: 'invalid_value',
    });
  }
  return date;
}

export function assertMemoryTimeRange(args: {
  eventStart?: Date;
  eventEnd?: Date;
  validFrom?: Date;
  validUntil?: Date;
  assertedAt: Date;
}) {
  if (
    args.eventStart &&
    args.eventEnd &&
    args.eventEnd.getTime() < args.eventStart.getTime()
  ) {
    throw new MemoryValidationError('eventEnd must not precede eventStart', {
      field: 'eventEnd',
      reason: 'invalid_value',
    });
  }
  if (
    args.validFrom &&
    args.validUntil &&
    args.validUntil.getTime() < args.validFrom.getTime()
  ) {
    throw new MemoryValidationError('validUntil must not precede validFrom', {
      field: 'validUntil',
      reason: 'invalid_value',
    });
  }
  const latestEvent = Math.max(
    args.eventStart?.getTime() ?? 0,
    args.eventEnd?.getTime() ?? 0,
  );
  const fiveYears = 5 * 366 * 24 * 60 * 60 * 1000;
  if (latestEvent > args.assertedAt.getTime() + fiveYears) {
    throw new MemoryValidationError(
      'Event time is unreasonably far in the future',
      { field: 'eventStart', reason: 'invalid_value' },
    );
  }
}

export function formatLocalDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

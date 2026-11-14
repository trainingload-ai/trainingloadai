type PrismaLikeError = {
  code?: unknown;
  meta?: unknown;
  name?: unknown;
  message?: unknown;
};

export const MAX_SERIALIZABLE_ATTEMPTS = 3;

/**
 * Prisma normally maps a Serializable conflict to P2034. Conflicts raised by
 * an explicit $queryRaw lock can instead be wrapped as P2010 with PostgreSQL's
 * SQLSTATE 40001 in meta.code, so both shapes must enter the same retry path.
 */
export function isPrismaSerializableConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as PrismaLikeError;
  if (
    candidate.code === 'P2034' ||
    candidate.code === '40001' ||
    candidate.code === '40P01'
  )
    return true;
  if (
    candidate.code === 'P2010' &&
    candidate.meta &&
    typeof candidate.meta === 'object'
  ) {
    return ['40001', '40P01'].includes(
      String((candidate.meta as { code?: unknown }).code),
    );
  }

  // Prisma 6 can expose a trigger's PostgreSQL error as an unknown request
  // error without structured metadata. Inspect only the connector diagnostic,
  // never SQLSTATE-like text in the query arguments or a generic error message.
  if (
    candidate.name !== 'PrismaClientUnknownRequestError' ||
    typeof candidate.message !== 'string'
  )
    return false;
  const marker = 'Error occurred during query execution:';
  const diagnosticAt = candidate.message.lastIndexOf(marker);
  if (diagnosticAt < 0) return false;
  const diagnostic = candidate.message
    .slice(diagnosticAt + marker.length)
    .trimStart();
  return /^ConnectorError\(ConnectorError \{\s*user_facing_error: None,\s*kind: QueryError\(PostgresError \{\s*code: "(?:40001|40P01)",/.test(
    diagnostic,
  );
}

/** Bounded exponential backoff plus jitter for SERIALIZABLE retries. */
export function serializableRetryDelayMs(attempt: number): number {
  const backoffMs = Math.min(80, 20 * 2 ** Math.max(0, attempt - 1));
  const jitterMs = Math.floor(Math.random() * 20);
  return backoffMs + jitterMs;
}

export async function withSerializableRetry<T>(
  work: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    wait?: (attempt: number) => Promise<void>;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? MAX_SERIALIZABLE_ATTEMPTS;
  const wait =
    options?.wait ??
    (async (attempt: number) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, serializableRetryDelayMs(attempt));
      });
    });

  let attempt = 0;
  while (true) {
    try {
      return await work();
    } catch (error) {
      if (!isPrismaSerializableConflict(error) || ++attempt >= maxAttempts) {
        throw error;
      }
      await wait(attempt);
    }
  }
}

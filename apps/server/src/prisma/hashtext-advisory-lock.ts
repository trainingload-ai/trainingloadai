export const HASHTEXT_ADVISORY_XACT_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock';

export const REGISTERED_ADVISORY_XACT_LOCK_SQL =
  `SELECT pg_advisory_xact_lock(
    (hashtextextended('trainingload:advisory:v1:' || $1::text, 0) & 4611686018427387903::bigint)
    | 4611686018427387904::bigint
  )::text AS lock`;

type AdvisoryLockClient = {
  $executeRawUnsafe?: (...args: unknown[]) => Promise<unknown>;
  $queryRawUnsafe?: (...args: unknown[]) => Promise<unknown>;
};

/**
 * Keep each existing lock group and its existing order. Acquire the legacy
 * signed 32-bit key first, then its registered bigint key. The registered
 * range has bit 62 set and cannot alias any sign-extended legacy hashtext key.
 */
export async function acquireHashtextAdvisoryXactLock(
  client: AdvisoryLockClient,
  key: string,
): Promise<void> {
  const execute = client.$executeRawUnsafe ?? client.$queryRawUnsafe;
  if (!execute) return;
  await execute.call(client, HASHTEXT_ADVISORY_XACT_LOCK_SQL, key);
  await execute.call(client, REGISTERED_ADVISORY_XACT_LOCK_SQL, key);
}

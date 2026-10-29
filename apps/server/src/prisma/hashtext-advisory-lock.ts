/**
 * 按字符串键串行化短事务（用户、日指标、外部身份等）。
 * mock tx 若没有 $executeRawUnsafe，直接跳过，避免单测绑真实 PG。
 */
export const HASHTEXT_ADVISORY_XACT_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock';

export async function acquireHashtextAdvisoryXactLock(
  client: { $executeRawUnsafe?: (...args: unknown[]) => Promise<unknown> },
  key: string,
): Promise<void> {
  if (typeof client.$executeRawUnsafe !== 'function') return;
  await client.$executeRawUnsafe(HASHTEXT_ADVISORY_XACT_LOCK_SQL, key);
}

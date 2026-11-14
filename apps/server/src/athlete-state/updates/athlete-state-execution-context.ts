import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaTx } from '@/prisma/prisma-db';
import type { StateUpdateJob } from './athlete-state-update-queue.service';

const lease = new AsyncLocalStorage<StateUpdateJob>();
export const withAthleteStateLease = <T>(
  job: StateUpdateJob,
  run: () => Promise<T>,
) => lease.run(job, run);

/** Lock the lease row in the SAME short transaction as a state/Case write. */
export async function guardAthleteStateWrite(tx: PrismaTx) {
  const job = lease.getStore();
  if (!job) return;
  const rows = await tx.$queryRawUnsafe<Array<{ user_id: string }>>(
    `SELECT user_id FROM t_athlete_state_update
    WHERE user_id = $1 AND lease_token = $2 AND status = 'RUNNING'
      AND lease_expires_at > clock_timestamp() FOR UPDATE`,
    job.user_id,
    job.lease_token,
  );
  if (rows.length !== 1) throw new Error('ATHLETE_STATE_UPDATE_LEASE_LOST');
}

/** Preserve existing non-worker calls; worker writes use a fenced transaction. */
export async function guardedAthleteStateWrite<T>(
  prisma: import('@/prisma/prisma.service').PrismaService,
  write: (tx: PrismaTx) => Promise<T>,
): Promise<T> {
  if (!lease.getStore()) return write(prisma as unknown as PrismaTx);
  return prisma.$transaction(async (tx) => {
    await guardAthleteStateWrite(tx);
    return write(tx);
  });
}

import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/** A session lock spans provider I/O without keeping a Prisma transaction open. */
@Injectable()
export class IntervalsIcuPlanSyncLock {
  private readonly ownership = new AsyncLocalStorage<() => void>();

  assertHeld(): void {
    const check = this.ownership.getStore();
    if (!check) throw new Error('INTERVALS_PLAN_SYNC_LOCK_REQUIRED');
    check();
  }

  async run<T>(connectionId: string, work: () => Promise<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg') as typeof import('pg');
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
    let lost = false;
    client.on('error', () => {
      lost = true;
    });
    try {
      await client.connect();
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [`intervals-plan-sync:${connectionId}`],
      );
      if (!result.rows[0]?.acquired)
        throw new Error('INTERVALS_PLAN_SYNC_BUSY');
      const check = () => {
        if (lost) throw new Error('INTERVALS_PLAN_SYNC_LOCK_LOST');
      };
      const value = await this.ownership.run(check, work);
      check();
      return value;
    } finally {
      // Closing the dedicated session also releases the lock after a failure.
      await client.end();
    }
  }
}

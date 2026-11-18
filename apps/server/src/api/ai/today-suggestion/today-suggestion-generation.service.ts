import { validCoachTimezone } from '../core/coach-fact-scope.port';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';

export type TodayGenerationScope = {
  userId: string;
  locale: string;
  date: string;
  inputHash: string;
};
export type TodayGenerationLease = TodayGenerationScope & {
  token: string;
  fence: number;
  failure?: string;
};
export class TodayGenerationLeaseLost extends Error {
  constructor() {
    super('TODAY_GENERATION_LEASE_LOST');
  }
}
const LEASE_MS = 150_000;

/** Short database transactions coordinate instances; no upstream call holds a lock. */
@Injectable()
export class TodaySuggestionGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  private async locked<T>(
    userId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await acquireHashtextAdvisoryXactLock(tx, `today-generation:${userId}`);
        return work(tx);
      },
      { timeout: 15_000 },
    );
  }

  async contextToken(userId: string, timezone?: string | null) {
    const zone = validCoachTimezone(timezone) ?? 'UTC';
    return this.locked(userId, async (tx) => {
      const row = await tx.todaySuggestionContextReference.upsert({
        where: { userId_timezone: { userId, timezone: zone } },
        create: { userId, timezone: zone },
        update: {},
        select: { id: true },
      });
      return row.id;
    });
  }

  claim(scope: TodayGenerationScope) {
    return this.locked(scope.userId, async (tx) => {
      const now = new Date();
      const current = await tx.todaySuggestionGeneration.findUnique({
        where: { userId: scope.userId },
      });
      if (current?.retryAfter && current.retryAfter > now)
        return { kind: 'COOLDOWN' as const, retryAt: current.retryAfter };
      if (
        current?.token &&
        current.leaseExpiresAt &&
        current.leaseExpiresAt > now
      )
        return { kind: 'BUSY' as const, retryAt: current.leaseExpiresAt };
      const token = randomUUID();
      const value = {
        token,
        locale: scope.locale,
        date: scope.date,
        inputHash: scope.inputHash,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        retryAfter: null,
      };
      const row = await tx.todaySuggestionGeneration.upsert({
        where: { userId: scope.userId },
        create: { userId: scope.userId, ...value, fence: 1 },
        update: { ...value, fence: { increment: 1 } },
      });
      return {
        kind: 'ACQUIRED' as const,
        lease: {
          ...scope,
          token,
          fence: row.fence,
        } satisfies TodayGenerationLease,
      };
    });
  }

  async bind(lease: TodayGenerationLease, scope: TodayGenerationScope) {
    const result = await this.prisma.todaySuggestionGeneration.updateMany({
      where: {
        userId: lease.userId,
        token: lease.token,
        fence: lease.fence,
        leaseExpiresAt: { gt: new Date() },
      },
      data: {
        locale: scope.locale,
        date: scope.date,
        inputHash: scope.inputHash,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      },
    });
    if (result.count !== 1) throw new TodayGenerationLeaseLost();
    Object.assign(lease, scope);
  }

  publish<T>(
    lease: TodayGenerationLease,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.locked(lease.userId, async (tx) => {
      const row = await tx.todaySuggestionGeneration.findUnique({
        where: { userId: lease.userId },
      });
      if (
        !row ||
        row.token !== lease.token ||
        row.fence !== lease.fence ||
        !row.leaseExpiresAt ||
        row.leaseExpiresAt <= new Date() ||
        row.locale !== lease.locale ||
        row.date !== lease.date ||
        row.inputHash !== lease.inputHash
      )
        throw new TodayGenerationLeaseLost();
      return work(tx);
    });
  }

  release(lease: TodayGenerationLease) {
    return this.locked(lease.userId, async (tx) => {
      const row = await tx.todaySuggestionGeneration.findUnique({
        where: { userId: lease.userId },
      });
      if (!row || row.token !== lease.token || row.fence !== lease.fence)
        return;
      const changingFacts = lease.failure === 'FACTS_CHANGED';
      const failures = lease.failure && !changingFacts ? row.failures + 1 : 0;
      const cooldown =
        failures >= 5
          ? 15 * 60_000
          : [60_000, 120_000, 300_000][Math.min(2, failures - 1)];
      await tx.todaySuggestionGeneration.updateMany({
        where: { userId: lease.userId, token: lease.token, fence: lease.fence },
        data: {
          token: null,
          leaseExpiresAt: null,
          failures,
          retryAfter: changingFacts
            ? new Date(Date.now() + 15_000)
            : lease.failure
              ? new Date(Date.now() + cooldown)
              : null,
          lastErrorCode: lease.failure ?? null,
        },
      });
    });
  }
}

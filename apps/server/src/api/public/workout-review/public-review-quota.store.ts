import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  PublicReviewQuotaError,
  type PublicReviewQuotaLimits,
  type PublicReviewQuotaScope,
  type PublicReviewQuotaSnapshot,
  type PublicReviewQuotaStore,
  type PublicReviewQuotaSubject,
  type PublicReviewReservationInput,
} from './public-review-quota.service';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

type QueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

type AggregateRow = {
  attempts: number;
  modelStarts: number;
  successes: number;
  failures: number;
  reservedWt: number;
  usedWt: number;
  nextSuccessRecoveryAt: Date | null;
  nextModelStartRecoveryAt: Date | null;
  nextTokenRecoveryAt: Date | null;
};

type ReservationRow = {
  id: string;
  reservedWt: number;
};

const ROLLING_WINDOW = Prisma.sql`INTERVAL '24 hours'`;

function quotaCode(scope: PublicReviewQuotaScope) {
  if (scope === 'VISITOR') return 'VISITOR_LIMIT_REACHED' as const;
  if (scope === 'ACTIVITY') return 'DUPLICATE_ACTIVITY_REVIEW' as const;
  if (scope === 'IP') return 'NETWORK_LIMIT_REACHED' as const;
  return 'ROLLING_BUDGET_EXHAUSTED' as const;
}

function subjectFilter(subject: PublicReviewQuotaSubject) {
  if (subject.scope === 'VISITOR') {
    return Prisma.sql`"visitor_hash" = ${subject.subjectHash}`;
  }
  if (subject.scope === 'IP') {
    return Prisma.sql`"ip_hash" = ${subject.subjectHash}`;
  }
  if (subject.scope === 'ACTIVITY') {
    return Prisma.sql`"activity_hash" = ${subject.subjectHash}`;
  }
  return Prisma.sql`TRUE`;
}

function recoveryIso(value: Date | null) {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : undefined;
}

function laterRecovery(...values: Array<string | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : undefined;
}

@Injectable()
export class PostgresPublicReviewQuotaStore implements PublicReviewQuotaStore {
  constructor(private readonly prisma: PrismaService) {}

  snapshots(subjects: PublicReviewQuotaSubject[]) {
    return this.readSnapshots(this.prisma, subjects);
  }

  async reserve(
    input: PublicReviewReservationInput & {
      subjects: PublicReviewQuotaSubject[];
      reservedWt: number;
    },
    limits: PublicReviewQuotaLimits,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.lockSubjects(tx, input);
          await this.assertNoActiveConflict(tx, input);

          const snapshots = await this.readSnapshots(tx, input.subjects);
          for (const subject of input.subjects) {
            this.assertCapacity(
              subject.scope,
              snapshots.get(subject.scope),
              input.reservedWt,
              limits,
            );
          }

          const reservationId = randomUUID();
          const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "t_public_ai_review_reservation" (
              "id", "visitor_hash", "ip_hash", "activity_hash",
              "admission_nonce", "status", "reserved_wt", "expires_at"
            ) VALUES (
              ${reservationId}, ${input.visitorHash}, ${input.ipHash},
              ${input.activityHash}, ${input.admissionNonce}, 'RESERVED',
              ${input.reservedWt},
              NOW() + ${limits.reservationLeaseSeconds} * INTERVAL '1 second'
            )
            RETURNING "id"
          `);
          if (!rows[0]) throw new PublicReviewQuotaError('ADMISSION_INVALID');
          return { reservationId: rows[0].id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof PublicReviewQuotaError) throw error;
      if (String(error).includes('admission_nonce')) {
        throw new PublicReviewQuotaError('ADMISSION_INVALID');
      }
      throw error;
    }
  }

  async settle(input: {
    reservationId: string;
    outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    actualWt?: number;
  }) {
    await this.prisma.$transaction(
      async (tx) => {
        const reservations = await tx.$queryRaw<ReservationRow[]>(Prisma.sql`
          SELECT "id", "reserved_wt" AS "reservedWt"
          FROM "t_public_ai_review_reservation"
          WHERE "id" = ${input.reservationId} AND "status" = 'RESERVED'
          FOR UPDATE
        `);
        const reservation = reservations[0];
        if (!reservation) return;

        const actualWt = Math.max(0, Math.floor(input.actualWt ?? 0));
        await tx.$executeRaw(Prisma.sql`
          UPDATE "t_public_ai_review_reservation"
          SET "status" = ${input.outcome}::"PublicAiReviewReservationStatus",
              "actual_wt" = ${actualWt > 0 ? actualWt : null},
              "finished_at" = NOW()
          WHERE "id" = ${reservation.id} AND "status" = 'RESERVED'
        `);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async expireStaleReservations(limit = 100) {
    return this.prisma.$transaction(async (tx) => {
      const reservations = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "t_public_ai_review_reservation"
          WHERE "status" = 'RESERVED' AND "expires_at" <= NOW()
          ORDER BY "expires_at" ASC
          LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}
          FOR UPDATE SKIP LOCKED
        `,
      );
      for (const reservation of reservations) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "t_public_ai_review_reservation"
          SET "status" = 'EXPIRED', "finished_at" = NOW()
          WHERE "id" = ${reservation.id} AND "status" = 'RESERVED'
        `);
      }
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "t_public_ai_review_reservation"
        WHERE "status" <> 'RESERVED'
          AND "created_at" < NOW() - INTERVAL '48 hours'
      `);
      return reservations.length;
    });
  }

  private async readSnapshots(
    client: QueryClient,
    subjects: PublicReviewQuotaSubject[],
  ) {
    const result = new Map<PublicReviewQuotaScope, PublicReviewQuotaSnapshot>();
    for (const subject of subjects) {
      const rows = await client.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          (COUNT(*) FILTER (
            WHERE "created_at" > NOW() - ${ROLLING_WINDOW}
          ))::int AS "attempts",
          (COUNT(*) FILTER (
            WHERE "created_at" > NOW() - ${ROLLING_WINDOW}
          ))::int AS "modelStarts",
          (COUNT(*) FILTER (
            WHERE "status" = 'SUCCEEDED'
              AND "finished_at" > NOW() - ${ROLLING_WINDOW}
          ))::int AS "successes",
          (COUNT(*) FILTER (
            WHERE "status" IN ('FAILED', 'CANCELLED', 'EXPIRED')
              AND "finished_at" > NOW() - ${ROLLING_WINDOW}
          ))::int AS "failures",
          COALESCE(SUM("reserved_wt") FILTER (
            WHERE "status" = 'RESERVED' AND "expires_at" > NOW()
          ), 0)::int AS "reservedWt",
          COALESCE(SUM("actual_wt") FILTER (
            WHERE "actual_wt" > 0
              AND "finished_at" > NOW() - ${ROLLING_WINDOW}
          ), 0)::int AS "usedWt",
          MIN("finished_at" + ${ROLLING_WINDOW}) FILTER (
            WHERE "status" = 'SUCCEEDED'
              AND "finished_at" > NOW() - ${ROLLING_WINDOW}
          ) AS "nextSuccessRecoveryAt",
          MIN("created_at" + ${ROLLING_WINDOW}) FILTER (
            WHERE "created_at" > NOW() - ${ROLLING_WINDOW}
          ) AS "nextModelStartRecoveryAt",
          MIN("finished_at" + ${ROLLING_WINDOW}) FILTER (
            WHERE "actual_wt" > 0
              AND "finished_at" > NOW() - ${ROLLING_WINDOW}
          ) AS "nextTokenRecoveryAt"
        FROM "t_public_ai_review_reservation"
        WHERE ${subjectFilter(subject)}
      `);
      const row = rows[0];
      result.set(subject.scope, {
        attempts: row?.attempts ?? 0,
        modelStarts: row?.modelStarts ?? 0,
        successes: row?.successes ?? 0,
        failures: row?.failures ?? 0,
        reservedWt: row?.reservedWt ?? 0,
        usedWt: row?.usedWt ?? 0,
        nextSuccessRecoveryAt: recoveryIso(row?.nextSuccessRecoveryAt ?? null),
        nextModelStartRecoveryAt: recoveryIso(
          row?.nextModelStartRecoveryAt ?? null,
        ),
        nextTokenRecoveryAt: recoveryIso(row?.nextTokenRecoveryAt ?? null),
      });
    }
    return result;
  }

  private assertCapacity(
    scope: PublicReviewQuotaScope,
    snapshot: PublicReviewQuotaSnapshot | undefined,
    reservedWt: number,
    limits: PublicReviewQuotaLimits,
  ) {
    const value = snapshot ?? {
      attempts: 0,
      modelStarts: 0,
      successes: 0,
      failures: 0,
      reservedWt: 0,
      usedWt: 0,
    };
    const available =
      scope === 'VISITOR'
        ? value.successes < limits.visitorSuccesses
        : scope === 'ACTIVITY'
          ? value.successes < limits.activitySuccesses
          : scope === 'IP'
            ? value.successes < limits.ipSuccesses &&
              value.modelStarts < limits.ipModelStarts
            : value.usedWt + value.reservedWt + reservedWt <=
              limits.globalWeightedTokens;
    if (!available) {
      const nextRecoveryAt =
        scope === 'GLOBAL'
          ? value.nextTokenRecoveryAt
          : scope === 'IP'
            ? laterRecovery(
                value.successes >= limits.ipSuccesses
                  ? value.nextSuccessRecoveryAt
                  : undefined,
                value.modelStarts >= limits.ipModelStarts
                  ? value.nextModelStartRecoveryAt
                  : undefined,
              )
            : value.nextSuccessRecoveryAt;
      throw new PublicReviewQuotaError(quotaCode(scope), nextRecoveryAt);
    }
  }

  private async lockSubjects(
    tx: TransactionClient,
    input: PublicReviewReservationInput,
  ) {
    for (const subject of [
      'global:GLOBAL',
      `visitor:${input.visitorHash}`,
      `ip:${input.ipHash}`,
      `activity:${input.activityHash}`,
    ]) {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${subject}, 0))
      `);
    }
  }

  private async assertNoActiveConflict(
    tx: TransactionClient,
    input: PublicReviewReservationInput,
  ) {
    const active = await tx.$queryRaw<
      Array<{
        visitorHash: string;
        ipHash: string;
        activityHash: string;
        expiresAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        "visitor_hash" AS "visitorHash",
        "ip_hash" AS "ipHash",
        "activity_hash" AS "activityHash",
        "expires_at" AS "expiresAt"
      FROM "t_public_ai_review_reservation"
      WHERE "status" = 'RESERVED'
        AND "expires_at" > NOW()
        AND (
          "visitor_hash" = ${input.visitorHash}
          OR "ip_hash" = ${input.ipHash}
          OR "activity_hash" = ${input.activityHash}
        )
      LIMIT 1
    `);
    const conflict = active[0];
    if (!conflict) return;
    const nextRecoveryAt = recoveryIso(conflict.expiresAt);
    if (conflict.visitorHash === input.visitorHash) {
      throw new PublicReviewQuotaError('VISITOR_LIMIT_REACHED', nextRecoveryAt);
    }
    if (conflict.activityHash === input.activityHash) {
      throw new PublicReviewQuotaError(
        'DUPLICATE_ACTIVITY_REVIEW',
        nextRecoveryAt,
      );
    }
    throw new PublicReviewQuotaError('NETWORK_LIMIT_REACHED', nextRecoveryAt);
  }
}

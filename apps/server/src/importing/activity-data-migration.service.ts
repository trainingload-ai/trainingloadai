import { ImportingJobService } from './importing-job.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { SensorFileQueryService } from '@/sensor/sensor-file-query.service';
import { readPlanActivityLinksForMigration } from '@/api/plan/persistence/plan-activity-link.repository';
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type ActivityDataMigration } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { FitActivityDataRepairService } from './fit-activity-data-repair.service';
import {
  applyUnknownActivitySportRepairs,
  scanUnknownActivitySports,
} from './unknown-activity-sport-repair';

const LOCK = 'activity-data-migration';
const json = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
const hash = (value: unknown): string =>
  createHash('sha256')
    .update(
      JSON.stringify(json(value), (_key, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      ),
    )
    .digest('hex');
type Manifest = {
  activityIds: number[];
  protectedHash: string;
  primaryHash: string;
  activityCount: number;
};
export type BackupEvidence = {
  schemaVersion: number;
  verified: boolean;
  sha256: string;
  verifiedAt: string;
  targetRevision: string;
  purpose: 'production' | 'local-validation';
  databaseIdentity: string;
};

export function assertMigrationBackup(
  evidence: BackupEvidence,
  version: string,
  local: boolean,
) {
  const age = Date.now() - Date.parse(evidence?.verifiedAt);
  if (
    evidence?.schemaVersion !== 1 ||
    evidence.verified !== true ||
    !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? '') ||
    evidence.targetRevision !== version ||
    !Number.isFinite(age) ||
    age < -60_000 ||
    age > 24 * 3_600_000 ||
    !evidence.databaseIdentity ||
    (!local && evidence.purpose !== 'production')
  ) {
    throw new Error('ACTIVITY_MIGRATION_BACKUP_NOT_VERIFIED');
  }
}

/** Maintenance-only orchestration. No HTTP controller and no automatic next-user cron. */
@Injectable()
export class ActivityDataMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repair: FitActivityDataRepairService,
    private readonly jobs: ImportingJobService,
    private readonly users: UserQueryService,
    private readonly files: SensorFileQueryService,
  ) {}

  private async lock(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK}, 0))::text`;
  }
  private async lockUser(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'fitness:' + userId}, 0))::text`;
  }
  async databaseIdentity() {
    const [row] = await this.prisma.$queryRaw<Array<{ identity: string }>>`
      SELECT (SELECT system_identifier::text FROM pg_control_system()) || ':' ||
        current_database() || ':' || (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS identity`;
    return row.identity;
  }

  async prepare(
    runKey: string,
    version: string,
    userIds: string[],
    evidence: BackupEvidence,
  ) {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    );
    assertMigrationBackup(evidence, version, local);
    if (evidence.databaseIdentity !== (await this.databaseIdentity()))
      throw new Error('ACTIVITY_MIGRATION_BACKUP_DATABASE_MISMATCH');
    if (
      !runKey?.trim() ||
      !version?.trim() ||
      !userIds.length ||
      new Set(userIds).size !== userIds.length
    ) {
      throw new Error('ACTIVITY_MIGRATION_SCOPE_INVALID');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const existing = await tx.activityDataMigration.findMany({
        where: { runKey },
        orderBy: { sequence: 'asc' },
      });
      if (existing.length) {
        if (
          existing.length !== userIds.length ||
          existing.some(
            (r, i) =>
              r.userId !== userIds[i] ||
              r.version !== version ||
              (r.backupEvidence as unknown as BackupEvidence).sha256 !==
                evidence.sha256,
          )
        )
          throw new Error('ACTIVITY_MIGRATION_RUN_CONFLICT');
        return existing;
      }
      const users = await this.users
        .users(tx)
        .count({ where: { id: { in: userIds } } });
      if (users !== userIds.length)
        throw new Error('ACTIVITY_MIGRATION_USER_NOT_FOUND');
      await tx.activityDataMigration.createMany({
        data: userIds.map((userId, sequence) => ({
          runKey,
          version,
          userId,
          sequence,
          backupEvidence: json(evidence),
        })),
      });
      return tx.activityDataMigration.findMany({
        where: { runKey },
        orderBy: { sequence: 'asc' },
      });
    });
  }

  async status(runKey: string) {
    const rows = await this.prisma.activityDataMigration.findMany({
      where: { runKey },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        userId: true,
        sequence: true,
        status: true,
        phase: true,
        rawCursor: true,
        importBatchIds: true,
        recomputeJobId: true,
        errorCode: true,
        verification: true,
        verifiedAt: true,
        beforeManifest: true,
      },
    });
    return rows.map(({ beforeManifest, ...row }) => ({
      ...row,
      sportRepairs:
        (beforeManifest as Record<string, unknown> | null)?.sportRepairs ??
        null,
    }));
  }

  async auditUnknownSports(userId?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const findings = await scanUnknownActivitySports(tx, userId);
        return {
          schemaVersion: 1,
          ok: true,
          mode: 'dry-run',
          total: findings.length,
          users: new Set(findings.map((f) => f.userId)).size,
          counts: findings.reduce(
            (counts, finding) => ({
              ...counts,
              [finding.status]: (counts[finding.status] ?? 0) + 1,
            }),
            {} as Record<string, number>,
          ),
          findings,
        };
      },
      { timeout: 30_000 },
    );
  }

  private async manifest(tx: Prisma.TransactionClient, userId: string) {
    const [activities, manual, zones, body, links, sources, files] =
      await Promise.all([
        tx.activity.findMany({
          where: { userId, state: 1 },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            activityName: true,
            description: true,
            sessionRpe: true,
          },
        }),
        this.users.fitnessMetrics(tx).findMany({
          where: { userId, source: 'MANUAL' },
          orderBy: { id: 'asc' },
        }),
        this.users.zoneSettings(tx).findMany({
          where: { userId },
          orderBy: { id: 'asc' },
        }),
        this.users.bodyMetrics(tx).findMany({
          where: { userId },
          orderBy: { id: 'asc' },
        }),
        readPlanActivityLinksForMigration(tx, userId),
        tx.activitySource.findMany({
          where: { userId, activity: { state: 1 } },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            activityId: true,
            isPrimary: true,
            isActive: true,
          },
        }),
        this.files.parquetFiles(tx).findMany({
          where: { activity: { userId } },
          orderBy: { id: 'asc' },
        }),
      ]);
    return {
      activityIds: activities.map((a) => a.id),
      activityCount: activities.length,
      protectedHash: hash({ activities, manual, zones, body, links }),
      primaryHash: hash(sources),
      files: files.map((f) => ({
        bucket: 'default',
        objectKey: f.parquetPath,
      })),
    };
  }

  private async start(runKey: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx);
        const row = await tx.activityDataMigration.findFirst({
          where: { runKey, status: { not: 'VERIFIED' } },
          orderBy: { sequence: 'asc' },
        });
        if (!row) return null;
        if (row.status === 'FAILED')
          throw new Error('ACTIVITY_MIGRATION_PREVIOUS_USER_FAILED');
        const other = await tx.activityDataMigration.findFirst({
          where: {
            id: { not: row.id },
            status: { in: ['MIGRATING', 'VERIFYING', 'FAILED'] },
          },
          select: { id: true },
        });
        if (other) throw new Error('ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE');
        if (row.status !== 'PENDING') return row;
        await this.lockUser(tx, row.userId);
        if (
          await tx.activityAnalysisLease.findFirst({
            where: { userId: row.userId, leaseExpiresAt: { gt: new Date() } },
          })
        ) {
          throw new Error('ACTIVITY_MIGRATION_USER_ANALYSIS_BUSY');
        }
        const before = await this.manifest(tx, row.userId);
        const objects = await this.jobs.sourceObjects(tx).findMany({
          where: { userId: row.userId },
          select: { fileKey: true, rawStorageKey: true },
        });
        const refs = [
          ...before.files,
          ...objects.flatMap((o) =>
            [o.fileKey, o.rawStorageKey]
              .filter((k): k is string => Boolean(k))
              .map((objectKey) => ({ bucket: 'default', objectKey })),
          ),
        ];
        await tx.storageObjectRetention.createMany({
          data: refs.map((o) => ({ ...o, migrationId: row.id })),
          skipDuplicates: true,
        });
        await tx.activityDataMigration.update({
          where: { id: row.id },
          data: {
            status: 'MIGRATING',
            beforeManifest: json(before),
            phase: 'RAW_SCAN',
          },
        });
        const sportRepairs = await applyUnknownActivitySportRepairs(
          tx,
          row.userId,
          row.id,
        );
        return tx.activityDataMigration.update({
          where: { id: row.id },
          data: { beforeManifest: json({ ...before, sportRepairs }) },
        });
      },
      { timeout: 30_000 },
    );
  }

  /** One bounded step; the CLI holds a session advisory lock across scan + step. */
  async advance(runKey: string) {
    const row = await this.start(runKey);
    if (!row) return { completed: true };
    try {
      if (row.phase === 'RAW_SCAN') {
        const scan = await this.repair.scan({
          all: false,
          limit: 25,
          userId: row.userId,
          afterId: row.rawCursor ?? undefined,
          migrationId: row.id,
          failFast: true,
        });
        if (scan.failures.length) throw new Error(scan.failures[0].code);
        if (scan.alreadyQueued)
          return {
            completed: false,
            waiting: 'IMPORT_SOURCE_BUSY',
            userId: row.userId,
          };
        await this.repair.enqueue(scan.candidates);
        await this.prisma.activityDataMigration.update({
          where: { id: row.id },
          data: {
            rawCursor: scan.lastScannedId ?? row.rawCursor,
            phase: scan.hasMore ? 'RAW_SCAN' : 'WAIT_IMPORT',
          },
        });
      } else if (row.phase === 'WAIT_IMPORT') {
        const ids = row.importBatchIds as string[];
        const batches = await this.jobs.batchJobs().findMany({
          where: { id: { in: ids } },
          include: { postProcessJobs: true },
        });
        if (
          batches.some(
            (b) =>
              ['FAILED', 'PARTIAL_FAILED', 'CANCELLED'].includes(b.status) ||
              b.postProcessJobs.some((p) => p.status === 'DEAD'),
          )
        ) {
          throw new Error('ACTIVITY_MIGRATION_IMPORT_FAILED');
        }
        if (
          batches.length !== ids.length ||
          batches.some(
            (b) =>
              b.status !== 'COMPLETED' ||
              !b.postProcessJobs.length ||
              b.postProcessJobs.some((p) => p.status !== 'COMPLETED'),
          )
        ) {
          return { completed: false, waiting: 'IMPORT', userId: row.userId };
        }
        await this.queueReplay(row, false);
      } else if (
        row.phase === 'WAIT_REPLAY' ||
        row.phase === 'WAIT_VERIFY_REPLAY'
      ) {
        const job = await this.prisma.activityRecomputeJob.findUniqueOrThrow({
          where: { id: row.recomputeJobId! },
        });
        if (job.status === 'DEAD')
          throw new Error(
            job.lastErrorCode ?? 'ACTIVITY_MIGRATION_REPLAY_FAILED',
          );
        if (job.status !== 'COMPLETED')
          return { completed: false, waiting: 'REPLAY', userId: row.userId };
        const report = await this.verify(row);
        if (row.phase === 'WAIT_REPLAY') {
          await this.prisma.activityDataMigration.update({
            where: { id: row.id },
            data: { status: 'VERIFYING', verification: json(report) },
          });
          await this.queueReplay(row, true);
        } else {
          const checkpoint = job.replayCheckpoint as Record<string, any> | null;
          const pages = Object.values(checkpoint?.pageStats ?? {}) as Array<{
            highFrequencyReads: number;
            fingerprintHits: number;
            processedActivities: number;
          }>;
          if (
            !pages.length ||
            pages.some(
              (p) =>
                p.highFrequencyReads !== 0 ||
                p.fingerprintHits !== p.processedActivities,
            )
          ) {
            throw new Error('ACTIVITY_MIGRATION_IDEMPOTENCE_FAILED');
          }
          const previous = row.verification as Record<string, any>;
          if (previous.resultFingerprint !== report.resultFingerprint)
            throw new Error('ACTIVITY_MIGRATION_RESULTS_CHANGED');
          await this.prisma.$transaction(async (tx) => {
            await this.lock(tx);
            await this.lockUser(tx, row.userId);
            const [revision] = await tx.$queryRaw<
              Array<{ revision: bigint }>
            >`SELECT revision FROM t_fitness_evidence_revision WHERE user_id=${row.userId}`;
            if (String(revision?.revision ?? 0) !== report.revision)
              throw new Error('ACTIVITY_MIGRATION_REVISION_DRIFT');
            await tx.activityDataMigration.update({
              where: { id: row.id },
              data: {
                status: 'VERIFIED',
                verifiedAt: new Date(),
                verification: json({
                  ...report,
                  hotReplayPages: pages,
                  highFrequencyReads: 0,
                }),
              },
            });
          });
        }
      } else throw new Error('ACTIVITY_MIGRATION_PHASE_INVALID');
      return {
        completed: false,
        userId: row.userId,
        status: await this.status(runKey),
      };
    } catch (error) {
      const code =
        error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
          ? error.message
          : 'ACTIVITY_MIGRATION_STEP_FAILED';
      await this.prisma.activityDataMigration.update({
        where: { id: row.id },
        data: { status: 'FAILED', errorCode: code },
      });
      throw Object.assign(new Error(code), { cause: error });
    }
  }

  private async queueReplay(row: ActivityDataMigration, hot: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      await this.lockUser(tx, row.userId);
      const activities = await tx.activity.findMany({
        where: { userId: row.userId, state: 1 },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        select: { id: true, startTime: true },
      });
      if (activities.some((a) => !a.startTime))
        throw new Error('ACTIVITY_MIGRATION_MISSING_ACTIVITY_TIME');
      const legacy = await this.users.fitnessMetrics(tx).findFirst({
        where: {
          userId: row.userId,
          source: 'AUTO',
          OR: [{ projectionVersion: null }, { projectionFingerprint: null }],
        },
        orderBy: { recordedAt: 'asc' },
        select: { recordedAt: true },
      });
      const orphanPmc =
        activities.length === 0
          ? await tx.pMCData.findFirst({
              where: { userId: row.userId },
              orderBy: { date: 'asc' },
              select: { date: true },
            })
          : null;
      const dates = [
        activities[0]?.startTime,
        legacy?.recordedAt,
        orphanPmc?.date,
        row.replayFrom,
      ].filter((d): d is Date => d != null);
      if (!dates.length) {
        await tx.activityDataMigration.update({
          where: { id: row.id },
          data: {
            status: 'VERIFIED',
            verifiedAt: new Date(),
            verification: {
              ok: true,
              activityCount: 0,
              reason: 'EMPTY_ACCOUNT',
            },
          },
        });
        return;
      }
      const from = new Date(Math.min(...dates.map((d) => d.getTime())));
      const generation =
        (row.beforeManifest as Record<string, unknown> | null)?.generation ??
        'initial';
      const dedupeKey = `activity-data-migration:${row.id}:${generation}:${hot ? 'verify' : 'replay'}`;
      const job = await tx.activityRecomputeJob.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          dedupeKey,
          userId: row.userId,
          metricType: 'DATA_REPAIR',
          reason: 'PER_USER_DATA_MIGRATION',
          affectedPipelines: ['FULL'],
          recomputeFrom: from,
          recomputeTo: new Date(),
          lookbackDays: 0,
          availableAt: new Date(),
          priority: 10,
          ...(orphanPmc
            ? {
                replayCheckpoint: {
                  schemaVersion: 1,
                  pendingPmcRecomputeFrom: orphanPmc.date.toISOString(),
                  pendingPmcRecomputeTo: new Date().toISOString(),
                },
              }
            : {}),
          triggerSource: 'activity_data_migration',
          triggerPayload: {
            schemaVersion: 2,
            migrationId: row.id,
            verificationReplay: hot,
            includeActivityIds: activities.map((a) => a.id),
            suppressAthleteStateReassessment: true,
          },
        },
      });
      await tx.activityDataMigration.update({
        where: { id: row.id },
        data: {
          status: hot ? 'VERIFYING' : 'MIGRATING',
          phase: hot ? 'WAIT_VERIFY_REPLAY' : 'WAIT_REPLAY',
          recomputeJobId: job.id,
          replayFrom: from,
        },
      });
    });
  }

  async verify(row: ActivityDataMigration) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockUser(tx, row.userId);
        const current = await this.manifest(tx, row.userId);
        const before = row.beforeManifest as unknown as Manifest;
        if (
          current.protectedHash !== before.protectedHash ||
          current.primaryHash !== before.primaryHash
        ) {
          throw new Error('ACTIVITY_MIGRATION_PROTECTED_DATA_CHANGED');
        }
        const activities = await tx.activity.findMany({
          where: { userId: row.userId, state: 1 },
          orderBy: { id: 'asc' },
          include: {
            fitnessMetricsSnapshot: true,
            coggan: true,
            bikeScore: true,
          },
        });
        for (const a of activities) {
          const s = a.fitnessMetricsSnapshot;
          if (
            a.processingStatus !== 'READY' ||
            !s ||
            s.resolutionVersion !== 5 ||
            !s.calculationFingerprint ||
            !s.inputFingerprint ||
            !s.analysisConfigFingerprint ||
            !s.pmcLocalDate
          )
            throw new Error('ACTIVITY_MIGRATION_SNAPSHOT_INCOMPLETE');
          if (
            (s.ftpValue == null &&
              a.coggan &&
              (a.coggan.intensityFactor === 0 || a.coggan.bikeStress === 0)) ||
            (s.cpValue == null &&
              a.bikeScore &&
              (a.bikeScore.relativeIntensity === 0 ||
                a.bikeScore.bikeScore === 0))
          ) {
            throw new Error('ACTIVITY_MIGRATION_FALSE_ZERO_LOAD');
          }
          const metrics = (s.provenance as any)?.metrics ?? {};
          for (const metric of Object.values(metrics) as any[]) {
            const p = metric?.provenance?.value;
            if (!p?.effectiveAt) continue;
            if (p.source === 'ACTIVITY_BOOTSTRAP') {
              if (p.sourceMetricId !== `activity:${a.id}`)
                throw new Error('ACTIVITY_MIGRATION_BOOTSTRAP_LEAK');
            } else if (Date.parse(p.effectiveAt) > a.startTime!.getTime())
              throw new Error('ACTIVITY_MIGRATION_FUTURE_METRIC');
          }
        }
        for (const a of activities) {
          const p = a.fitnessMetricsSnapshot!.provenance as any;
          for (const item of [...(p?.zones ?? []), ...(p?.bodyMetrics ?? [])]) {
            if (
              item.effectiveAt &&
              Date.parse(item.effectiveAt) > a.startTime!.getTime()
            ) {
              const ownBootstrap = Object.values(p.metrics ?? {}).some(
                (m: any) =>
                  m?.provenance?.value?.source === 'ACTIVITY_BOOTSTRAP' &&
                  m.provenance.value.sourceMetricId === `activity:${a.id}` &&
                  m.provenance.value.effectiveAt === item.effectiveAt,
              );
              if (!ownBootstrap)
                throw new Error('ACTIVITY_MIGRATION_FUTURE_CONTEXT');
            }
          }
        }
        const mismatches = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM (
          SELECT s.pmc_local_date, SUM(COALESCE(s.actual_load,0)) AS value
          FROM t_activity_fitness_metrics_snapshot s JOIN t_activity a ON a.id=s.activity_id
          WHERE a.user_id=${row.userId} AND a.state=1 GROUP BY s.pmc_local_date
        ) expected FULL OUTER JOIN (SELECT * FROM t_user_pmc_data WHERE user_id=${row.userId}) p ON
          p.date=to_date(expected.pmc_local_date,'YYYY-MM-DD')::timestamp
        WHERE (expected.pmc_local_date IS NOT NULL AND p.id IS NULL)
          OR ABS(COALESCE(p.daily_value,0)-COALESCE(expected.value,0))>0.000001`;
        if (Number(mismatches[0]?.count ?? 0) !== 0)
          throw new Error('ACTIVITY_MIGRATION_PMC_MISMATCH');
        const [revision] = await tx.$queryRaw<
          Array<{ revision: bigint }>
        >`SELECT revision FROM t_fitness_evidence_revision WHERE user_id=${row.userId}`;
        const values = activities.map((a) => ({
          id: a.id,
          fingerprint: a.fitnessMetricsSnapshot!.calculationFingerprint,
          load: a.fitnessMetricsSnapshot!.actualLoad,
          source: a.fitnessMetricsSnapshot!.actualLoadSource,
          date: a.fitnessMetricsSnapshot!.pmcLocalDate,
        }));
        return {
          ok: true,
          activityCount: activities.length,
          revision: String(revision?.revision ?? 0),
          resultFingerprint: hash(values),
        };
      },
      { timeout: 30_000 },
    );
  }

  async retry(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const row = await tx.activityDataMigration.findUniqueOrThrow({
        where: { id },
      });
      if (row.status !== 'FAILED')
        throw new Error('ACTIVITY_MIGRATION_NOT_FAILED');
      await this.lockUser(tx, row.userId);
      const batchIds = Array.isArray(row.importBatchIds)
        ? (row.importBatchIds as string[])
        : [];
      await this.jobs.itemJobs(tx).updateMany({
        where: {
          batchJobId: { in: batchIds },
          status: { in: ['DEAD', 'FAILED'] },
        },
        data: {
          status: 'QUEUED',
          attempts: 0,
          availableAt: new Date(),
          lockToken: null,
          leaseExpiresAt: null,
          lastError: null,
          lastErrorCode: null,
        },
      });
      await this.jobs.batchJobs(tx).updateMany({
        where: {
          id: { in: batchIds },
          status: { in: ['FAILED', 'PARTIAL_FAILED', 'CANCELLED'] },
        },
        data: { status: 'RUNNING', completedAt: null },
      });
      await this.jobs.postProcessJobs(tx).updateMany({
        where: {
          batchJobId: { in: batchIds },
          status: { in: ['DEAD', 'FAILED'] },
        },
        data: {
          status: 'PENDING',
          attempts: 0,
          availableAt: new Date(),
          lockToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
      if (row.recomputeJobId) {
        const job = await tx.activityRecomputeJob.findUnique({
          where: { id: row.recomputeJobId },
        });
        if (job?.status === 'DEAD')
          await tx.activityRecomputeJob.update({
            where: { id: job.id },
            data: {
              status: 'SCHEDULED',
              attempts: 0,
              availableAt: new Date(),
              lastError: null,
              lastErrorCode: null,
              lockToken: null,
              leaseExpiresAt: null,
            },
          });
      }
      return tx.activityDataMigration.update({
        where: { id },
        data: {
          status:
            row.phase === 'WAIT_VERIFY_REPLAY' ? 'VERIFYING' : 'MIGRATING',
          errorCode: null,
        },
      });
    });
  }

  /** Explicitly accept current user edits after investigation; preserve every old recovery pin. */
  async restartUser(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx);
        const row = await tx.activityDataMigration.findUniqueOrThrow({
          where: { id },
        });
        if (row.status !== 'FAILED')
          throw new Error('ACTIVITY_MIGRATION_NOT_FAILED');
        await this.lockUser(tx, row.userId);
        if (
          await tx.activityAnalysisLease.findFirst({
            where: { userId: row.userId, leaseExpiresAt: { gt: new Date() } },
          })
        )
          throw new Error('ACTIVITY_MIGRATION_USER_ANALYSIS_BUSY');
        const ids = Array.isArray(row.importBatchIds)
          ? (row.importBatchIds as string[])
          : [];
        // Clearing tokens fences stale owners; their eventual commit must fail.
        await this.jobs.itemJobs(tx).updateMany({
          where: {
            batchJobId: { in: ids },
            status: { notIn: ['DONE', 'SKIPPED', 'DEAD'] },
          },
          data: {
            status: 'DEAD',
            lockToken: null,
            leaseExpiresAt: null,
            lastErrorCode: 'ACTIVITY_MIGRATION_USER_RESTARTED',
          },
        });
        await this.jobs.postProcessJobs(tx).updateMany({
          where: {
            batchJobId: { in: ids },
            status: { notIn: ['COMPLETED', 'DEAD'] },
          },
          data: {
            status: 'DEAD',
            lockToken: null,
            leaseExpiresAt: null,
            lastError: 'ACTIVITY_MIGRATION_USER_RESTARTED',
          },
        });
        if (row.recomputeJobId)
          await tx.activityRecomputeJob.updateMany({
            where: {
              id: row.recomputeJobId,
              userId: row.userId,
              status: { notIn: ['COMPLETED', 'DEAD'] },
            },
            data: {
              status: 'DEAD',
              lockToken: null,
              leaseExpiresAt: null,
              lastErrorCode: 'ACTIVITY_MIGRATION_USER_RESTARTED',
            },
          });
        const before = await this.manifest(tx, row.userId);
        const objects = await this.jobs.sourceObjects(tx).findMany({
          where: { userId: row.userId },
          select: { fileKey: true, rawStorageKey: true },
        });
        const refs = [
          ...before.files,
          ...objects.flatMap((o) =>
            [o.fileKey, o.rawStorageKey]
              .filter((k): k is string => Boolean(k))
              .map((objectKey) => ({ bucket: 'default', objectKey })),
          ),
        ];
        await tx.storageObjectRetention.createMany({
          data: refs.map((o) => ({ ...o, migrationId: id })),
          skipDuplicates: true,
        });
        const old = (row.beforeManifest ?? {}) as Record<string, any>;
        const { restartHistory: history = [], ...prior } = old;
        const restarted = await tx.activityDataMigration.update({
          where: { id },
          data: {
            status: 'MIGRATING',
            phase: 'RAW_SCAN',
            rawCursor: null,
            importBatchIds: [],
            recomputeJobId: null,
            errorCode: null,
            verification: Prisma.DbNull,
            beforeManifest: json({
              ...before,
              generation: randomUUID(),
              restartHistory: [
                ...history,
                {
                  at: new Date().toISOString(),
                  before: prior,
                  batchIds: ids,
                  recomputeJobId: row.recomputeJobId,
                  errorCode: row.errorCode,
                  verification: row.verification,
                },
              ],
            }),
          },
        });
        const sportRepairs = await applyUnknownActivitySportRepairs(
          tx,
          row.userId,
          id,
        );
        return tx.activityDataMigration.update({
          where: { id },
          data: {
            beforeManifest: json({
              ...(restarted.beforeManifest as object),
              sportRepairs,
            }),
          },
        });
      },
      { timeout: 30_000 },
    );
  }

  async releaseRecoveryObjects(runKey: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const rows = await tx.activityDataMigration.findMany({
        where: { runKey },
      });
      if (!rows.length || rows.some((r) => r.status !== 'VERIFIED'))
        throw new Error('ACTIVITY_MIGRATION_RECOVERY_RELEASE_BLOCKED');
      return tx.storageObjectRetention.updateMany({
        where: { migrationId: { in: rows.map((r) => r.id) }, releasedAt: null },
        data: { releasedAt: new Date() },
      });
    });
  }
}

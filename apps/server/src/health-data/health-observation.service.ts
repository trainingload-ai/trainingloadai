import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { HealthDataProvider, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { ImportingJobService } from '@/importing/importing-job.service';
import { AthleteClockService } from '@/timezone/athlete-clock.service';
import { HealthDataRepository } from './persistence/health-data.repository';
import { healthDataProviderPriority } from './health-data-provider-policy.port';
import {
  healthObservationCandidate,
  type HealthObservationCandidate,
} from './health-observation.contract';
const sourceSchema = z.object({
  userId: z.string().min(1),
  provider: z.nativeEnum(HealthDataProvider),
  sourceNamespace: z
    .string()
    .min(1)
    .max(192)
    .regex(/^[\x21-\x7e]+$/),
  kind: z.enum(['BLOOD_PRESSURE', 'BREATHING_VARIATION']),
  externalIdPrefix: z.string().min(1).max(500),
  sourceObjectId: z.string().min(1).nullable().optional(),
  snapshotId: z.string().min(1).nullable().optional(),
  connectionId: z.string().min(1).nullable().optional(),
  sourceName: z.string().max(200).nullable().optional(),
  sourcePriority: z.number().int().min(-1000).max(1000).optional(),
  sourceUpdatedAt: z.date(),
});
type ObservationSource = z.infer<typeof sourceSchema>;
const dayKey = (value: Date) => value.toISOString().slice(0, 10);
@Injectable()
export class HealthObservationService {
  constructor(
    private readonly health: HealthDataRepository,
    private readonly imports: ImportingJobService,
    private readonly clock: AthleteClockService,
  ) {}
  /** Replace one complete source summary; no values from independent blood-pressure readings are paired. */
  async replaceSourceObservations(
    input: ObservationSource & { candidates: HealthObservationCandidate[] },
  ) {
    const args = sourceSchema.parse({ ...input, candidates: undefined });
    if (input.candidates.length > 10000)
      throw new BadRequestException('HEALTH_OBSERVATION_LIMIT');
    const sourceGroupKey = createHash('sha256')
      .update(
        JSON.stringify([
          args.provider,
          args.sourceNamespace,
          args.kind,
          args.externalIdPrefix,
        ]),
      )
      .digest('hex');
    const candidates = input.candidates.map((candidate) =>
      healthObservationCandidate.parse(candidate),
    );
    if (
      candidates.some(
        (candidate) =>
          candidate.kind !== args.kind ||
          !candidate.externalId.startsWith(args.externalIdPrefix),
      )
    )
      throw new BadRequestException('HEALTH_OBSERVATION_SCOPE_MISMATCH');
    if (
      new Set(candidates.map((candidate) => candidate.externalId)).size !==
      candidates.length
    )
      throw new BadRequestException('HEALTH_OBSERVATION_DUPLICATE_ID');
    return this.health.runTransaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(
        tx,
        `health-observation:${args.userId}:${args.provider}:${args.sourceNamespace}:${args.kind}:${args.externalIdPrefix}`,
      );
      if (
        args.sourceObjectId &&
        !(await this.imports
          .sourceObjects(tx)
          .findFirst({
            where: { id: args.sourceObjectId, userId: args.userId },
            select: { id: true },
          }))
      )
        throw new ConflictException('HEALTH_OBSERVATION_SOURCE_OWNER_MISMATCH');
      if (
        args.snapshotId &&
        !(await this.health
          .snapshots(tx)
          .findFirst({
            where: {
              id: args.snapshotId,
              userId: args.userId,
              ...(args.sourceObjectId
                ? { sourceObjectId: args.sourceObjectId }
                : {}),
            },
            select: { id: true },
          }))
      )
        throw new ConflictException(
          'HEALTH_OBSERVATION_SNAPSHOT_OWNER_MISMATCH',
        );
      const scope = {
        userId: args.userId,
        provider: args.provider,
        sourceNamespace: args.sourceNamespace,
        kind: args.kind,
        sourceGroupKey,
      };
      const latest = await this.health
        .observations(tx)
        .findFirst({
          where: scope,
          orderBy: { sourceUpdatedAt: 'desc' },
          select: { sourceUpdatedAt: true },
        });
      if (latest && latest.sourceUpdatedAt > args.sourceUpdatedAt)
        return { upsertedCount: 0, deletedCount: 0, ignored: true };
      const ids: string[] = [];
      for (const candidate of candidates) {
        const data = {
          sourceGroupKey,
          connectionId: args.connectionId ?? null,
          sourceObjectId: args.sourceObjectId ?? null,
          snapshotId: args.snapshotId ?? null,
          kind: candidate.kind,
          scope: candidate.scope,
          localDate: candidate.localDate,
          timezone: candidate.timezone ?? null,
          offsetSeconds: candidate.offsetSeconds ?? null,
          measuredAt:
            candidate.scope === 'MEASUREMENT' ? candidate.measuredAt : null,
          intervalStart:
            candidate.scope === 'INTERVAL' ? candidate.intervalStart : null,
          intervalEnd:
            candidate.scope === 'INTERVAL' ? candidate.intervalEnd : null,
          systolicMmHg:
            candidate.scope === 'MEASUREMENT' ? candidate.systolicMmHg : null,
          diastolicMmHg:
            candidate.scope === 'MEASUREMENT' ? candidate.diastolicMmHg : null,
          pulseBpm:
            candidate.scope === 'MEASUREMENT'
              ? (candidate.pulseBpm ?? null)
              : null,
          measurementOrigin:
            candidate.scope === 'MEASUREMENT'
              ? candidate.measurementOrigin
              : null,
          categorySystem:
            candidate.kind === 'BREATHING_VARIATION'
              ? candidate.categorySystem
              : null,
          categoryCode:
            candidate.kind === 'BREATHING_VARIATION'
              ? candidate.categoryCode
              : null,
          sourceName: args.sourceName ?? null,
          sourcePriority:
            args.sourcePriority ?? healthDataProviderPriority(args.provider),
          sourceUpdatedAt: args.sourceUpdatedAt,
          deletedAt: null,
        };
        const row = await this.health
          .observations(tx)
          .upsert({
            where: {
              userId_provider_sourceNamespace_kind_externalId: {
                userId: args.userId,
                provider: args.provider,
                sourceNamespace: args.sourceNamespace,
                kind: args.kind,
                externalId: candidate.externalId,
              },
            },
            create: {
              userId: args.userId,
              provider: args.provider,
              sourceNamespace: args.sourceNamespace,
              externalId: candidate.externalId,
              ...data,
            },
            update: data,
            select: { id: true },
          });
        ids.push(row.id);
      }
      const retired = await this.health
        .observations(tx)
        .updateMany({
          where: {
            ...scope,
            deletedAt: null,
            ...(ids.length ? { id: { notIn: ids } } : {}),
          },
          data: {
            deletedAt: new Date(),
            sourceUpdatedAt: args.sourceUpdatedAt,
          },
        });
      return {
        upsertedCount: ids.length,
        deletedCount: retired.count,
        ignored: false,
      };
    });
  }
  async tombstoneSource(userId: string, sourceObjectId: string) {
    return this.health
      .observations()
      .updateMany({
        where: { userId, sourceObjectId, deletedAt: null },
        data: { deletedAt: new Date(), sourceUpdatedAt: new Date() },
      });
  }
  async tombstoneExternalIds(args: {
    userId: string;
    provider: HealthDataProvider;
    sourceNamespace: string;
    externalIds: string[];
  }) {
    if (args.externalIds.length > 1000)
      throw new BadRequestException('HEALTH_OBSERVATION_LIMIT');
    return this.health
      .observations()
      .updateMany({
        where: {
          userId: args.userId,
          provider: args.provider,
          sourceNamespace: args.sourceNamespace,
          externalId: { in: args.externalIds },
          deletedAt: null,
        },
        data: { deletedAt: new Date(), sourceUpdatedAt: new Date() },
      });
  }
  async overview(
    userId: string,
    requestedDays = 30,
    requestedEndDate?: string,
  ) {
    if (!Number.isFinite(requestedDays))
      throw new BadRequestException('HEALTH_DATE_INVALID');
    const days = Math.min(90, Math.max(1, Math.round(requestedDays))),
      endKey = requestedEndDate ?? (await this.clock.todayYmd(userId));
    const end = new Date(`${endKey}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(endKey) ||
      !Number.isFinite(end.getTime()) ||
      dayKey(end) !== endKey
    )
      throw new BadRequestException('HEALTH_DATE_INVALID');
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const rows = await this.health
      .observations()
      .findMany({
        where: { userId, localDate: { gte: start, lte: end }, deletedAt: null },
        orderBy: [
          { localDate: 'desc' },
          { sourcePriority: 'desc' },
          { sourceUpdatedAt: 'desc' },
          { id: 'asc' },
        ],
        take: 1001,
      });
    const rawReports = await this.health
      .samples()
      .findMany({
        where: {
          userId,
          localDate: { gte: start, lte: end },
          deletedAt: null,
          projectToDaily: false,
          metricType: 'HYDRATION_ML',
          metadata: { path: ['basis'], equals: 'UNSPECIFIED_REPORT' },
        },
        orderBy: [
          { localDate: 'desc' },
          { sourceUpdatedAt: 'desc' },
          { id: 'asc' },
        ],
        take: 501,
      });
    const reports = rawReports
      .slice(0, 500)
      .filter(
        (row) =>
          row.value != null &&
          Number.isFinite(row.value) &&
          row.unit?.toLowerCase() === 'ml',
      )
      .map((row) => ({
        id: row.id,
        type: row.metricType,
        localDate: dayKey(row.localDate),
        value: row.value!,
        unit: 'mL',
        provider: row.provider,
        sourceName: row.sourceName,
        basis: 'UNSPECIFIED_REPORT' as const,
      }));
    const winners = new Map<
      string,
      { source: string; priority: number; time: number }
    >();
    const key = (row: (typeof rows)[number]) =>
      `${dayKey(row.localDate)}:${row.kind}:${row.categorySystem ?? ''}`;
    for (const row of rows.slice(0, 1000)) {
      const k = key(row),
        priority =
          row.sourcePriority ?? healthDataProviderPriority(row.provider),
        time = row.sourceUpdatedAt.getTime(),
        old = winners.get(k);
      if (
        !old ||
        priority > old.priority ||
        (priority === old.priority &&
          (time > old.time ||
            (time === old.time &&
              (row.provider + ':' + row.sourceNamespace).localeCompare(
                old.source,
              ) < 0)))
      )
        winners.set(k, {
          source: row.provider + ':' + row.sourceNamespace,
          priority,
          time,
        });
    }
    const items = rows
      .slice(0, 1000)
      .map((row) => ({
        id: row.id,
        groupId: row.sourceGroupKey,
        kind: row.kind,
        scope: row.scope,
        localDate: dayKey(row.localDate),
        timezone: row.timezone,
        offsetSeconds: row.offsetSeconds,
        measuredAt: row.measuredAt?.toISOString() ?? null,
        intervalStart: row.intervalStart?.toISOString() ?? null,
        intervalEnd: row.intervalEnd?.toISOString() ?? null,
        systolicMmHg: row.systolicMmHg,
        diastolicMmHg: row.diastolicMmHg,
        pulseBpm: row.pulseBpm,
        measurementOrigin: row.measurementOrigin,
        categorySystem: row.categorySystem,
        categoryCode: row.categoryCode,
        provider: row.provider,
        sourceName: row.sourceName,
        selected:
          winners.get(key(row))?.source ===
          row.provider + ':' + row.sourceNamespace,
        sourceUpdatedAt: row.sourceUpdatedAt.toISOString(),
      }));
    return {
      startDate: dayKey(start),
      endDate: dayKey(end),
      items,
      reports,
      truncated: rows.length > 1000 || rawReports.length > 500,
    };
  }
}

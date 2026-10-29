/**
 * 与 provider 无关的每日健康数据摄取和投影策略。
 *
 * Provider 事实在 `ExternalHealthSample` 中始终可以独立寻址。兼容事实先在同一
 * provider 内合并，再根据 provider 优先级选择每日投影；`sourceBreakdown` 会保留
 * 每个有效 provider 的结果。任何软删除都会触发确定性重建。
 */
import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  HealthMetricType,
  Prisma,
  type HealthDataProvider,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import type { PrismaClientSlice, PrismaTx } from '@/prisma/prisma-db';
import { HealthDataRepository } from './persistence/health-data.repository';
import { forEachWithConcurrency } from '@/utils/async-concurrency.util';
import { assertHealthMetricCandidate } from './health-metric-contract';
import { emitAthleteStateReassessRequested } from '@/athlete-state/athlete-state.events';
import { healthDataProviderPriority } from './health-data-provider-policy.port';

const HEALTH_CANDIDATE_INGEST_CONCURRENCY = 4;

/** 统一健康事实模型支持的 provider。 */
export type HealthDataProviderCode = HealthDataProvider;

const HEALTH_METRIC_TYPES = new Set<string>(Object.values(HealthMetricType));

function asHealthMetricType(metricType: string): HealthMetricType {
  if (!HEALTH_METRIC_TYPES.has(metricType)) {
    throw new Error(`Unsupported health metric: ${metricType}`);
  }
  return metricType as HealthMetricType;
}

function asHealthMetricTypes(
  metricTypes: readonly string[],
): HealthMetricType[] {
  return metricTypes.map(asHealthMetricType);
}

/** 每日合并及 provider 选优前的单条 provider 健康事实。 */
export type ExternalHealthMetricCandidate = {
  /** 来源 provider。 */
  provider: HealthDataProviderCode;
  /** 由 `health-metric-contract` 校验的规范每日指标代码。 */
  metricType: string;
  /** Provider 侧稳定标识，用于幂等 upsert。 */
  externalId: string;
  /** 使用 UTC 零点表示的数据库本地日期键。 */
  localDate: Date;
  /** 来源范围的绝对起始时刻，包含该时刻。 */
  startTime: Date;
  /** 来源范围的绝对结束时刻，不包含该时刻；point 可与起始时刻相同。 */
  endTime: Date;
  /** 使用 `unit` 表示的有限规范数值。 */
  value: number;
  /** 指标契约允许的规范单位。 */
  unit: string;
  /** 可选的所属第三方连接。 */
  connectionId?: string | null;
  /** 生成该事实的导入来源对象。 */
  sourceObjectId?: string | null;
  /** 生成该事实的规范 Health IR 快照。 */
  snapshotId?: string | null;
  /** 稳定的 provider、账号或导出范围。 */
  sourceNamespace?: string | null;
  /** 用于确定 `localDate` 的 IANA 时区。 */
  timezone?: string | null;
  /** 用于来源追踪的人类可读来源名称。 */
  sourceName?: string | null;
  /** 显式 provider 选优优先级；省略时使用 provider 默认策略。 */
  sourcePriority?: number | null;
  /** 合并语义，例如 `SUM`、`AVG`、`MIN`、`MAX` 或 `LATEST`。 */
  aggregation?: string | null;
  /** Provider 更新时间，用于确定性解决冲突。 */
  sourceUpdatedAt?: Date | null;
  /** 为审计保留的最小 provider payload，不复制整份导出数据。 */
  rawPayload?: Record<string, unknown> | null;
  /** 合并元数据，例如样本数、粒度和质量等级。 */
  metadata?: Record<string, unknown> | null;
  /** 对绝不能参与每日聚合的原始 point 设置为 `false`。 */
  projectToDaily?: boolean;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function candidatePriority(candidate: ExternalHealthMetricCandidate) {
  return (
    candidate.sourcePriority ?? healthDataProviderPriority(candidate.provider)
  );
}

/** Provider 确定性合并所需的最小已存储事实结构。 */
type StoredHealthCandidate = {
  id?: string;
  provider: HealthDataProviderCode;
  externalId: string;
  startTime: Date;
  endTime: Date;
  value: number | null;
  unit: string | null;
  timezone: string | null;
  sourceName: string | null;
  sourcePriority: number | null;
  sourceUpdatedAt?: Date | null;
  sourceNamespace: string | null;
  aggregation: string | null;
  metadata: unknown;
};

function sampleCount(metadata: unknown) {
  const value = Number(jsonObject(metadata).sampleCount);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function qualityRank(metadata: unknown) {
  const value = Number(jsonObject(metadata).qualityRank);
  return Number.isFinite(value) ? value : 0;
}

function compatibilityKey(candidate: StoredHealthCandidate) {
  return `${String(candidate.unit ?? '')
    .trim()
    .toLowerCase()}|${String(candidate.aggregation ?? 'LATEST').toUpperCase()}`;
}

/** 已计入的、排序且互不重叠的 epoch 毫秒范围。 */
type Coverage = Array<{ start: number; end: number }>;

function uncoveredDuration(start: number, end: number, coverage: Coverage) {
  if (end <= start) return 0;
  let uncovered = end - start;
  for (const interval of coverage) {
    uncovered -= Math.max(
      0,
      Math.min(end, interval.end) - Math.max(start, interval.start),
    );
  }
  return Math.max(0, uncovered);
}

function addCoverage(coverage: Coverage, start: number, end: number) {
  if (end <= start) return coverage;
  const merged: Coverage = [];
  let next = { start, end };
  for (const interval of coverage) {
    if (interval.end < next.start) {
      merged.push(interval);
    } else if (next.end < interval.start) {
      merged.push(next);
      next = interval;
    } else {
      next = {
        start: Math.min(next.start, interval.start),
        end: Math.max(next.end, interval.end),
      };
    }
  }
  merged.push(next);
  return merged;
}

/**
 * 合并同一 provider 内兼容的事实。
 *
 * 首先选择最高质量等级；随后校验单位和聚合语义兼容性，删除完全重复项。
 * 重叠的 SUM、DURATION、AVG 范围只贡献尚未覆盖的部分，最终数值由聚合语义决定。
 */
export function consolidateHealthCandidates(
  candidates: StoredHealthCandidate[],
) {
  const valid = candidates.filter(
    (candidate): candidate is StoredHealthCandidate & { value: number } =>
      candidate.value != null && Number.isFinite(candidate.value),
  );
  if (valid.length === 0) return null;
  const highestQualityRank = Math.max(
    ...valid.map((candidate) => qualityRank(candidate.metadata)),
  );
  const qualityCandidates = valid.filter(
    (candidate) => qualityRank(candidate.metadata) === highestQualityRank,
  );
  const compatibilityGroups = new Map<string, typeof qualityCandidates>();
  qualityCandidates.forEach((candidate) => {
    const key = compatibilityKey(candidate);
    const group = compatibilityGroups.get(key) ?? [];
    group.push(candidate);
    compatibilityGroups.set(key, group);
  });
  const compatible = [...compatibilityGroups.entries()].sort(
    ([leftKey, left], [rightKey, right]) =>
      right.reduce(
        (sum, candidate) => sum + sampleCount(candidate.metadata),
        0,
      ) -
        left.reduce(
          (sum, candidate) => sum + sampleCount(candidate.metadata),
          0,
        ) ||
      Math.max(...right.map((candidate) => candidate.endTime.valueOf())) -
        Math.max(...left.map((candidate) => candidate.endTime.valueOf())) ||
      right.length - left.length ||
      leftKey.localeCompare(rightKey),
  )[0]![1];
  const unique = new Map<string, (typeof valid)[number]>();
  [...compatible]
    .sort(
      (a, b) =>
        (b.sourcePriority ?? healthDataProviderPriority(b.provider)) -
          (a.sourcePriority ?? healthDataProviderPriority(a.provider)) ||
        (b.sourceUpdatedAt?.valueOf() ?? 0) -
          (a.sourceUpdatedAt?.valueOf() ?? 0) ||
        a.externalId.localeCompare(b.externalId),
    )
    .forEach((candidate) => {
      const identity = [
        candidate.startTime.toISOString(),
        candidate.endTime.toISOString(),
        candidate.value,
        candidate.unit,
        candidate.aggregation,
      ].join('|');
      if (!unique.has(identity)) unique.set(identity, candidate);
    });
  const deduplicated = [...unique.values()];
  const aggregation = String(
    deduplicated[0]?.aggregation ?? 'LATEST',
  ).toUpperCase();
  let overlapCandidateCount = 0;
  let contributions = deduplicated.map((candidate) => ({
    candidate,
    ratio: 1,
  }));
  if (
    aggregation === 'SUM' ||
    aggregation === 'DURATION' ||
    aggregation === 'AVG'
  ) {
    contributions = [];
    let coverage: Coverage = [];
    for (const candidate of [...deduplicated].sort(
      (a, b) =>
        sampleCount(b.metadata) - sampleCount(a.metadata) ||
        b.endTime.valueOf() -
          b.startTime.valueOf() -
          (a.endTime.valueOf() - a.startTime.valueOf()) ||
        b.endTime.valueOf() - a.endTime.valueOf() ||
        a.externalId.localeCompare(b.externalId),
    )) {
      const start = candidate.startTime.valueOf();
      const end = candidate.endTime.valueOf();
      const duration = end - start;
      const ratio =
        duration > 0 ? uncoveredDuration(start, end, coverage) / duration : 1;
      if (ratio < 1) overlapCandidateCount += 1;
      if (ratio > 0) contributions.push({ candidate, ratio });
      coverage = addCoverage(coverage, start, end);
    }
  }
  const retained = contributions.map((entry) => entry.candidate);
  const ordered = retained.sort(
    (a, b) =>
      a.endTime.valueOf() - b.endTime.valueOf() ||
      (a.sourceUpdatedAt?.valueOf() ?? 0) -
        (b.sourceUpdatedAt?.valueOf() ?? 0) ||
      a.externalId.localeCompare(b.externalId),
  );
  const latest = ordered.at(-1)!;
  let value: number;
  switch (aggregation) {
    case 'SUM':
    case 'DURATION':
      value = contributions.reduce(
        (sum, entry) => sum + entry.candidate.value * entry.ratio,
        0,
      );
      break;
    case 'AVG': {
      const weighted = contributions.reduce(
        (result, entry) => {
          const weight = sampleCount(entry.candidate.metadata) * entry.ratio;
          return {
            total: result.total + entry.candidate.value * weight,
            weight: result.weight + weight,
          };
        },
        { total: 0, weight: 0 },
      );
      value = weighted.total / weighted.weight;
      break;
    }
    case 'MIN':
      value = Math.min(...retained.map((candidate) => candidate.value));
      break;
    case 'MAX':
      value = Math.max(...retained.map((candidate) => candidate.value));
      break;
    case 'SCORE':
    case 'LATEST':
    default:
      value = latest.value;
      break;
  }
  return {
    provider: latest.provider,
    value,
    unit: latest.unit,
    timezone: latest.timezone,
    sourceName: latest.sourceName,
    priority: Math.max(
      ...retained.map(
        (candidate) =>
          candidate.sourcePriority ??
          healthDataProviderPriority(candidate.provider),
      ),
    ),
    aggregation,
    candidateCount: retained.length,
    duplicateCandidateCount: compatible.length - deduplicated.length,
    lowerQualityCandidateCount: valid.length - qualityCandidates.length,
    incompatibleCandidateCount: qualityCandidates.length - compatible.length,
    overlapCandidateCount,
    qualityRank: highestQualityRank,
    sampleCount: contributions.reduce(
      (sum, entry) => sum + sampleCount(entry.candidate.metadata) * entry.ratio,
      0,
    ),
    startTime: new Date(
      Math.min(...retained.map((candidate) => candidate.startTime.valueOf())),
    ),
    endTime: new Date(
      Math.max(...retained.map((candidate) => candidate.endTime.valueOf())),
    ),
    sourceNamespace: latest.sourceNamespace,
    externalId: latest.externalId,
  };
}

/** 存储来源事实，并确定性维护每日投影。 */
@Injectable()
export class HealthDataIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthDataRepository,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** 可由 PrismaService 或事务共同使用的 upsert 实现。 */
  private async upsertExternalSampleWith(
    db: PrismaClientSlice<'externalHealthSample'>,
    args: {
      userId: string;
      candidate: ExternalHealthMetricCandidate;
    },
  ) {
    const { candidate } = args;
    const contract = assertHealthMetricCandidate(candidate);
    return this.health.samples(db).upsert({
      where: {
        userId_provider_metricType_externalId: {
          userId: args.userId,
          provider: candidate.provider,
          metricType: asHealthMetricType(candidate.metricType),
          externalId: candidate.externalId,
        },
      },
      create: {
        userId: args.userId,
        provider: candidate.provider,
        connectionId: candidate.connectionId ?? undefined,
        sourceObjectId: candidate.sourceObjectId ?? undefined,
        snapshotId: candidate.snapshotId ?? undefined,
        sourceNamespace: candidate.sourceNamespace ?? undefined,
        metricType: asHealthMetricType(candidate.metricType),
        externalId: candidate.externalId,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        localDate: candidate.localDate,
        timezone: candidate.timezone ?? undefined,
        value: candidate.value,
        unit: candidate.unit,
        sourceName: candidate.sourceName ?? undefined,
        sourcePriority: candidatePriority(candidate),
        aggregation: contract.aggregation,
        sourceUpdatedAt: candidate.sourceUpdatedAt ?? undefined,
        projectToDaily: candidate.projectToDaily !== false,
        rawPayload:
          candidate.rawPayload === null
            ? Prisma.DbNull
            : (candidate.rawPayload as Prisma.InputJsonValue | undefined),
        metadata:
          candidate.metadata === null
            ? Prisma.DbNull
            : (candidate.metadata as Prisma.InputJsonValue | undefined),
      },
      update: {
        connectionId: candidate.connectionId ?? undefined,
        sourceObjectId: candidate.sourceObjectId ?? undefined,
        snapshotId: candidate.snapshotId ?? undefined,
        sourceNamespace: candidate.sourceNamespace ?? undefined,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        localDate: candidate.localDate,
        timezone: candidate.timezone ?? undefined,
        value: candidate.value,
        unit: candidate.unit,
        sourceName: candidate.sourceName ?? undefined,
        sourcePriority: candidatePriority(candidate),
        aggregation: contract.aggregation,
        sourceUpdatedAt: candidate.sourceUpdatedAt ?? undefined,
        projectToDaily: candidate.projectToDaily !== false,
        rawPayload:
          candidate.rawPayload === null
            ? Prisma.DbNull
            : (candidate.rawPayload as Prisma.InputJsonValue | undefined),
        metadata:
          candidate.metadata === null
            ? Prisma.DbNull
            : (candidate.metadata as Prisma.InputJsonValue | undefined),
        deletedAt: null,
      },
      select: {
        id: true,
        dailyMetricId: true,
      },
    });
  }

  /** 校验并幂等 upsert 单条 provider 事实，但不执行投影。 */
  async upsertExternalSample(args: {
    userId: string;
    candidate: ExternalHealthMetricCandidate;
  }) {
    return this.upsertExternalSampleWith(this.prisma, args);
  }

  /**
   * 根据全部有效且具备投影资格的事实，重建一个用户、日期、指标投影。
   * 操作会按用户和指标键在事务内串行执行。
   */
  async rebuildDailyMetric(
    args: {
      userId: string;
      localDate: Date;
      metricType: string;
    },
    db?: PrismaTx,
  ) {
    if (!db) {
      return this.health.runTransaction(
        (tx) => this.rebuildDailyMetric(args, tx),
        { timeout: 30_000 },
      );
    }
    await acquireHashtextAdvisoryXactLock(
      db,
      `health-daily-user|${args.userId}`,
    );
    await acquireHashtextAdvisoryXactLock(
      db,
      `health-daily|${args.userId}|${args.localDate.toISOString().slice(0, 10)}|${args.metricType}`,
    );
    const candidates = (await this.health.samples(db).findMany({
      where: {
        userId: args.userId,
        localDate: args.localDate,
        metricType: asHealthMetricType(args.metricType),
        deletedAt: null,
        projectToDaily: true,
        value: { not: null },
      },
      select: {
        id: true,
        provider: true,
        externalId: true,
        startTime: true,
        endTime: true,
        value: true,
        unit: true,
        timezone: true,
        sourceName: true,
        sourcePriority: true,
        sourceUpdatedAt: true,
        sourceNamespace: true,
        aggregation: true,
        metadata: true,
      },
    })) as StoredHealthCandidate[];
    const byProvider = new Map<
      HealthDataProviderCode,
      StoredHealthCandidate[]
    >();
    candidates.forEach((candidate) => {
      const values = byProvider.get(candidate.provider) ?? [];
      values.push(candidate);
      byProvider.set(candidate.provider, values);
    });
    const consolidated = [...byProvider.values()]
      .map(consolidateHealthCandidates)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    if (consolidated.length === 0) {
      await this.health.dailyMetrics(db).deleteMany({
        where: {
          userId: args.userId,
          date: args.localDate,
          metricType: asHealthMetricType(args.metricType),
        },
      });
      return { selectedProvider: null };
    }
    consolidated.sort(
      (a, b) => b.priority - a.priority || a.provider.localeCompare(b.provider),
    );
    const selected = consolidated[0]!;
    const computedAt = new Date();
    const sourceBreakdown = Object.fromEntries(
      consolidated.map((entry) => [
        entry.provider,
        {
          value: entry.value,
          unit: entry.unit,
          sourceName: entry.sourceName,
          externalId: entry.externalId,
          priority: entry.priority,
          aggregation: entry.aggregation,
          candidateCount: entry.candidateCount,
          duplicateCandidateCount: entry.duplicateCandidateCount,
          lowerQualityCandidateCount: entry.lowerQualityCandidateCount,
          incompatibleCandidateCount: entry.incompatibleCandidateCount,
          overlapCandidateCount: entry.overlapCandidateCount,
          qualityRank: entry.qualityRank,
          sampleCount: entry.sampleCount,
          startTime: entry.startTime.toISOString(),
          endTime: entry.endTime.toISOString(),
          sourceNamespace: entry.sourceNamespace,
          updatedAt: computedAt.toISOString(),
        },
      ]),
    );
    const dailyMetric = await this.health.dailyMetrics(db).upsert({
      where: {
        userId_date_metricType: {
          userId: args.userId,
          date: args.localDate,
          metricType: asHealthMetricType(args.metricType),
        },
      },
      create: {
        userId: args.userId,
        date: args.localDate,
        timezone: selected.timezone,
        metricType: asHealthMetricType(args.metricType),
        value: selected.value,
        unit: selected.unit,
        selectedProvider: selected.provider,
        sourceBreakdown: sourceBreakdown as Prisma.InputJsonValue,
        computedAt,
      },
      update: {
        timezone: selected.timezone,
        value: selected.value,
        unit: selected.unit,
        selectedProvider: selected.provider,
        sourceBreakdown: sourceBreakdown as Prisma.InputJsonValue,
        computedAt,
      },
    });
    if (dailyMetric?.id) {
      await this.health.samples(db).updateMany({
        where: {
          userId: args.userId,
          localDate: args.localDate,
          metricType: asHealthMetricType(args.metricType),
          OR: [{ projectToDaily: false }, { deletedAt: { not: null } }],
        },
        data: { dailyMetricId: null },
      });
      await this.health.samples(db).updateMany({
        where: {
          userId: args.userId,
          localDate: args.localDate,
          metricType: asHealthMetricType(args.metricType),
          deletedAt: null,
          projectToDaily: true,
        },
        data: { dailyMetricId: dailyMetric.id },
      });
    }
    return { selectedProvider: selected.provider };
  }

  /** 对多个每日指标键去重并确定性重建。 */
  async rebuildDailyMetrics(
    args: {
      userId: string;
      keys: Array<{ localDate: Date; metricType: string }>;
    },
    db?: PrismaTx,
  ) {
    const unique = new Map<string, { localDate: Date; metricType: string }>();
    args.keys.forEach((key) => {
      unique.set(
        `${key.localDate.toISOString().slice(0, 10)}|${key.metricType}`,
        key,
      );
    });
    const orderedKeys = [...unique.values()].sort(
      (left, right) =>
        left.localDate.valueOf() - right.localDate.valueOf() ||
        left.metricType.localeCompare(right.metricType),
    );
    for (const key of orderedKeys) {
      await this.rebuildDailyMetric({ userId: args.userId, ...key }, db);
    }
    return { rebuiltCount: unique.size };
  }

  /**
   * 替换权威 provider payload 对应的完整每日候选范围。缺失事实会被软删除，
   * 受影响投影会被重建。不得用于增量事件流或 Provider 原始分片。
   */
  async replaceProviderDailyCandidates(args: {
    userId: string;
    provider: HealthDataProviderCode;
    connectionId?: string | null;
    localDate: Date;
    managedMetricTypes: string[];
    candidates: ExternalHealthMetricCandidate[];
    externalIdPrefix?: string;
  }) {
    const metricTypes = [...new Set(args.managedMetricTypes)];
    if (metricTypes.length === 0) {
      return { sampleCount: 0, deletedCount: 0, rebuiltCount: 0 };
    }
    const dateKey = args.localDate.toISOString().slice(0, 10);
    args.candidates.forEach((candidate) => {
      if (
        candidate.provider !== args.provider ||
        candidate.localDate.toISOString().slice(0, 10) !== dateKey ||
        !metricTypes.includes(candidate.metricType) ||
        (args.connectionId !== undefined &&
          candidate.connectionId !== args.connectionId) ||
        (args.externalIdPrefix != null &&
          !candidate.externalId.startsWith(args.externalIdPrefix)) ||
        candidate.projectToDaily === false
      ) {
        throw new Error(
          'replaceProviderDailyCandidates received a candidate outside its authoritative daily scope',
        );
      }
    });

    const result = await this.health.runTransaction(
      async (tx) => {
        await acquireHashtextAdvisoryXactLock(
          tx,
          `health-daily-user|${args.userId}`,
        );
        for (const metricType of [...metricTypes].sort()) {
          await acquireHashtextAdvisoryXactLock(
            tx,
            `health-daily|${args.userId}|${dateKey}|${metricType}`,
          );
        }
        const previous = await this.health.samples(tx).findMany({
          where: {
            userId: args.userId,
            provider: args.provider,
            ...(args.connectionId !== undefined
              ? { connectionId: args.connectionId }
              : {}),
            ...(args.externalIdPrefix ? {} : { localDate: args.localDate }),
            metricType: { in: asHealthMetricTypes(metricTypes) },
            ...(args.externalIdPrefix
              ? { externalId: { startsWith: args.externalIdPrefix } }
              : {}),
            deletedAt: null,
          },
          select: { externalId: true, dailyMetricId: true },
        });
        const previousDailyMetricIds = new Set<string>(
          previous
            .map((sample) => sample.dailyMetricId)
            .filter((id): id is string => Boolean(id)),
        );
        for (const candidate of args.candidates) {
          const stored = await this.upsertExternalSampleWith(tx, {
            userId: args.userId,
            candidate,
          });
          if (stored?.dailyMetricId) {
            previousDailyMetricIds.add(stored.dailyMetricId);
          }
        }
        const currentExternalIds = args.candidates.map(
          (candidate) => candidate.externalId,
        );
        const deleted = await this.health.samples(tx).updateMany({
          where: {
            userId: args.userId,
            provider: args.provider,
            ...(args.connectionId !== undefined
              ? { connectionId: args.connectionId }
              : {}),
            ...(args.externalIdPrefix ? {} : { localDate: args.localDate }),
            metricType: { in: asHealthMetricTypes(metricTypes) },
            ...(args.externalIdPrefix || currentExternalIds.length > 0
              ? {
                  externalId: {
                    ...(args.externalIdPrefix
                      ? { startsWith: args.externalIdPrefix }
                      : {}),
                    ...(currentExternalIds.length > 0
                      ? { notIn: currentExternalIds }
                      : {}),
                  },
                }
              : {}),
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
        const rebuildKeys = new Map<
          string,
          { localDate: Date; metricType: string }
        >();
        metricTypes.forEach((metricType) =>
          rebuildKeys.set(`${dateKey}|${metricType}`, {
            localDate: args.localDate,
            metricType,
          }),
        );
        if (previousDailyMetricIds.size > 0) {
          const previousMetrics = await this.health.dailyMetrics(tx).findMany({
            where: { id: { in: [...previousDailyMetricIds] } },
            select: { date: true, metricType: true },
          });
          previousMetrics.forEach((metric) =>
            rebuildKeys.set(
              `${metric.date.toISOString().slice(0, 10)}|${metric.metricType}`,
              {
                localDate: metric.date,
                metricType: String(metric.metricType),
              },
            ),
          );
        }
        const orderedRebuildKeys = [...rebuildKeys.values()].sort(
          (left, right) =>
            left.localDate.valueOf() - right.localDate.valueOf() ||
            left.metricType.localeCompare(right.metricType),
        );
        for (const key of orderedRebuildKeys) {
          await this.rebuildDailyMetric({ userId: args.userId, ...key }, tx);
        }
        return {
          sampleCount: args.candidates.length,
          previousCount: previous.length,
          deletedCount: deleted.count,
          rebuiltCount: rebuildKeys.size,
        };
      },
      { timeout: 30_000 },
    );
    await emitAthleteStateReassessRequested(this.events, {
      userId: args.userId,
      triggerType: 'HEALTH_DATA_AGGREGATED',
      triggerRef: `${dateKey}:${metricTypes.sort().join(',')}`,
    });
    return result;
  }

  /**
   * 替换权威原始 point 范围，但不投影到每日指标。缺失 point 会被软删除。
   * 仅用于完整 provider/日期 point 快照，不得用于增量 webhook。
   */
  async replaceProviderRawCandidates(args: {
    userId: string;
    provider: HealthDataProviderCode;
    connectionId?: string | null;
    localDate: Date;
    managedMetricTypes: string[];
    candidates: ExternalHealthMetricCandidate[];
    externalIdPrefix?: string;
  }) {
    const metricTypes = [...new Set(args.managedMetricTypes)];
    if (metricTypes.length === 0) {
      return { sampleCount: 0, deletedCount: 0, rebuiltCount: 0 };
    }
    const dateKey = args.localDate.toISOString().slice(0, 10);
    args.candidates.forEach((candidate) => {
      if (
        candidate.provider !== args.provider ||
        candidate.localDate.toISOString().slice(0, 10) !== dateKey ||
        !metricTypes.includes(candidate.metricType) ||
        (args.connectionId !== undefined &&
          candidate.connectionId !== args.connectionId) ||
        (args.externalIdPrefix != null &&
          !candidate.externalId.startsWith(args.externalIdPrefix)) ||
        candidate.projectToDaily !== false
      ) {
        throw new Error(
          'replaceProviderRawCandidates received a candidate outside its authoritative raw scope',
        );
      }
    });

    return this.health.runTransaction(
      async (tx) => {
        await acquireHashtextAdvisoryXactLock(
          tx,
          `health-daily-user|${args.userId}`,
        );
        const scopeWhere = {
          userId: args.userId,
          provider: args.provider,
          ...(args.connectionId !== undefined
            ? { connectionId: args.connectionId }
            : {}),
          localDate: args.localDate,
          metricType: { in: asHealthMetricTypes(metricTypes) },
          projectToDaily: false,
        };
        const previous = await this.health.samples(tx).findMany({
          where: {
            ...scopeWhere,
            ...(args.externalIdPrefix
              ? { externalId: { startsWith: args.externalIdPrefix } }
              : {}),
            deletedAt: null,
          },
          select: { externalId: true, dailyMetricId: true },
        });
        const previousDailyMetricIds = new Set<string>(
          previous
            .map((sample) => sample.dailyMetricId)
            .filter((id): id is string => Boolean(id)),
        );
        for (const candidate of args.candidates) {
          const stored = await this.upsertExternalSampleWith(tx, {
            userId: args.userId,
            candidate,
          });
          if (stored?.dailyMetricId) {
            previousDailyMetricIds.add(stored.dailyMetricId);
          }
        }
        const currentExternalIds = args.candidates.map(
          (candidate) => candidate.externalId,
        );
        const deleted = await this.health.samples(tx).updateMany({
          where: {
            ...scopeWhere,
            ...(args.externalIdPrefix || currentExternalIds.length > 0
              ? {
                  externalId: {
                    ...(args.externalIdPrefix
                      ? { startsWith: args.externalIdPrefix }
                      : {}),
                    ...(currentExternalIds.length > 0
                      ? { notIn: currentExternalIds }
                      : {}),
                  },
                }
              : {}),
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
        const rebuildKeys = new Map<
          string,
          { localDate: Date; metricType: string }
        >();
        if (previousDailyMetricIds.size > 0) {
          const previousMetrics = await this.health.dailyMetrics(tx).findMany({
            where: { id: { in: [...previousDailyMetricIds] } },
            select: { date: true, metricType: true },
          });
          previousMetrics.forEach((metric) =>
            rebuildKeys.set(
              `${metric.date.toISOString().slice(0, 10)}|${metric.metricType}`,
              {
                localDate: metric.date,
                metricType: String(metric.metricType),
              },
            ),
          );
        }
        for (const key of [...rebuildKeys.values()].sort(
          (left, right) =>
            left.localDate.valueOf() - right.localDate.valueOf() ||
            left.metricType.localeCompare(right.metricType),
        )) {
          await this.rebuildDailyMetric({ userId: args.userId, ...key }, tx);
        }
        return {
          sampleCount: args.candidates.length,
          previousCount: previous.length,
          deletedCount: deleted.count,
          rebuiltCount: rebuildKeys.size,
        };
      },
      { timeout: 30_000 },
    );
  }

  /** 重建候选对应的每日键，并返回其 provider 是否胜出。 */
  async projectDailyMetric(args: {
    userId: string;
    candidate: ExternalHealthMetricCandidate;
  }) {
    const rebuilt = await this.rebuildDailyMetric({
      userId: args.userId,
      localDate: args.candidate.localDate,
      metricType: args.candidate.metricType,
    });
    return { selected: rebuilt.selectedProvider === args.candidate.provider };
  }

  /**
   * Upsert 单条事实，并重建其当前及此前关联的每日键。仅原始事实会持久化，
   * 但绝不会参与投影。
   */
  async ingestCandidate(args: {
    userId: string;
    candidate: ExternalHealthMetricCandidate;
  }) {
    const stored = await this.upsertExternalSample(args);
    if (args.candidate.projectToDaily === false) {
      if (stored?.dailyMetricId) {
        const previousMetric = await this.health.dailyMetrics().findUnique({
          where: { id: stored.dailyMetricId },
          select: { date: true, metricType: true },
        });
        if (previousMetric) {
          await this.rebuildDailyMetric({
            userId: args.userId,
            localDate: previousMetric.date,
            metricType: String(previousMetric.metricType),
          });
        }
      }
      return { projected: false, selected: false };
    }

    const previousMetric = stored?.dailyMetricId
      ? await this.health.dailyMetrics().findUnique({
          where: { id: stored.dailyMetricId },
          select: { date: true, metricType: true },
        })
      : null;
    const projection = await this.projectDailyMetric(args);
    if (
      previousMetric &&
      (previousMetric.date.valueOf() !== args.candidate.localDate.valueOf() ||
        String(previousMetric.metricType) !== args.candidate.metricType)
    ) {
      await this.rebuildDailyMetric({
        userId: args.userId,
        localDate: previousMetric.date,
        metricType: String(previousMetric.metricType),
      });
    }
    return { projected: true, selected: projection.selected };
  }

  /**
   * 批量 upsert 后，每个受影响的每日键只重建一次。该方法不是权威范围替换，
   * 因此不会软删除批次中缺失的事实。
   */
  async ingestCandidates(args: {
    userId: string;
    candidates: ExternalHealthMetricCandidate[];
  }) {
    let sampleCount = 0;
    let projectedCount = 0;
    const metricTypes = new Set<string>();
    const dates = new Set<string>();
    const dailyKeys = new Map<
      string,
      { localDate: Date; metricType: string }
    >();
    const previousDailyMetricIds = new Set<string>();

    const candidateGroups = new Map<string, ExternalHealthMetricCandidate[]>();
    for (const candidate of args.candidates) {
      const identity = `${candidate.provider}|${candidate.metricType}|${candidate.externalId}`;
      const group = candidateGroups.get(identity) ?? [];
      group.push(candidate);
      candidateGroups.set(identity, group);
    }
    await forEachWithConcurrency(
      [...candidateGroups.values()],
      HEALTH_CANDIDATE_INGEST_CONCURRENCY,
      async (group) => {
        // 相同幂等键按输入顺序执行，保留最后一项覆盖前一项的语义。
        for (const candidate of group) {
          const stored = await this.upsertExternalSample({
            userId: args.userId,
            candidate,
          });
          if (stored?.dailyMetricId) {
            previousDailyMetricIds.add(stored.dailyMetricId);
          }
          sampleCount += 1;
          if (candidate.projectToDaily !== false) {
            projectedCount += 1;
            dailyKeys.set(
              `${candidate.localDate.toISOString().slice(0, 10)}|${candidate.metricType}`,
              {
                localDate: candidate.localDate,
                metricType: candidate.metricType,
              },
            );
          }
          metricTypes.add(candidate.metricType);
          dates.add(candidate.localDate.toISOString().slice(0, 10));
        }
      },
    );

    if (previousDailyMetricIds.size > 0) {
      const previousMetrics = await this.health.dailyMetrics().findMany({
        where: { id: { in: [...previousDailyMetricIds] } },
        select: { date: true, metricType: true },
      });
      previousMetrics.forEach((metric) =>
        dailyKeys.set(
          `${metric.date.toISOString().slice(0, 10)}|${metric.metricType}`,
          { localDate: metric.date, metricType: String(metric.metricType) },
        ),
      );
    }

    const orderedDailyKeys = [...dailyKeys.values()].sort(
      (left, right) =>
        left.localDate.valueOf() - right.localDate.valueOf() ||
        left.metricType.localeCompare(right.metricType),
    );
    for (const key of orderedDailyKeys) {
      await this.rebuildDailyMetric({ userId: args.userId, ...key });
    }

    return {
      sampleCount,
      projectedCount,
      metricTypes: Array.from(metricTypes).sort(),
      dates: Array.from(dates).sort(),
    };
  }
}

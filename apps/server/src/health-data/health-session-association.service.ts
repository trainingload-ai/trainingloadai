/**
 * 跨 provider 健康 session 的关联边界。
 * Provider 事实是不可变且幂等的来源记录；规范 session 是根据时间重叠、provider
 * 优先级和质量选优后重建的投影。
 */
import { Injectable, Optional } from '@nestjs/common';
import {
  ExternalHealthSessionType,
  Prisma,
  type ExternalHealthSession,
  type HealthDataProvider,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import type { PrismaTx } from '@/prisma/prisma-db';
import { HealthDataRepository } from './persistence/health-data.repository';
import { healthDataProviderPriority } from './health-data-provider-policy.port';

const SLEEP_DAILY_METRICS = [
  'SLEEP_ASLEEP_SECONDS',
  'SLEEP_IN_BED_SECONDS',
] as const;

/** 跨 provider 规范关联前的 provider session 事实。 */
export type ExternalHealthSessionCandidate = {
  /** 来源 provider。 */
  provider: HealthDataProvider;
  /** 可选的所属第三方连接。 */
  connectionId?: string | null;
  /** 稳定的 provider、账号或导出命名空间。 */
  sourceNamespace: string;
  /** 规范 session 类别。 */
  sessionType: ExternalHealthSessionType;
  /** Provider 侧稳定标识，用于幂等 upsert。 */
  externalId: string;
  /** 绝对起始时刻，包含该时刻。 */
  startTime: Date;
  /** 绝对结束时刻，不包含该时刻。 */
  endTime: Date;
  /** Session 持续秒数；省略时根据起止时间计算。 */
  durationSeconds?: number;
  /** 使用 UTC 零点表示的数据库本地日期键。 */
  calendarDate?: Date | null;
  /** 用于确定 `calendarDate` 的 IANA 时区。 */
  timezone?: string | null;
  /** Session 开始时的 UTC 偏移秒数，不是持续时间。 */
  startOffsetSeconds?: number | null;
  /** Session 结束时的 UTC 偏移秒数。 */
  endOffsetSeconds?: number | null;
  /** 可选的 provider 评分。 */
  score?: number | null;
  /** 作为来源事实保留的 provider 或 session 汇总值。 */
  summary?: Record<string, unknown> | null;
  /** Provider 更新时间，用于拒绝过期重放。 */
  sourceUpdatedAt?: Date | null;
  /** 来源软删除时间；`null` 表示仍有效。 */
  deletedAt?: Date | null;
  /** 生成该事实的规范 Health IR 快照。 */
  snapshotId?: string | null;
  /** 关联质量及 provider 专属审计元数据。 */
  metadata?: Record<string, unknown> | null;
  /** 已裁剪到 session 半开时间范围内的阶段列表。 */
  segments?: Array<{
    /** 规范化或 provider 专属的阶段名。 */
    segmentType: string;
    /** Segment 绝对起始时刻，包含该时刻。 */
    startTime: Date;
    /** Segment 绝对结束时刻，不包含该时刻。 */
    endTime: Date;
    /** Segment 持续秒数；省略时自动计算。 */
    durationSeconds?: number;
    /** Segment 测量状态；默认 `valid`。 */
    status?: string;
    /** Provider 或 FIT 来源消息名。 */
    sourceMessage?: string | null;
    /** Provider 或 FIT 来源消息的零基索引。 */
    sourceIndex?: number | null;
    /** 附加阶段审计元数据。 */
    metadata?: Record<string, unknown> | null;
  }>;
};

/** 绝对时间半开区间 `[startTime, endTime)`。 */
type TimeRange = { startTime: Date; endTime: Date };

function durationSeconds(range: TimeRange) {
  return Math.max(
    0,
    Math.round((range.endTime.valueOf() - range.startTime.valueOf()) / 1000),
  );
}

/**
 * 评估 provider session 是否属于某个规范 session。未达到该类型的重叠或时间阈值
 * 时返回 `null`；非空分数越高表示匹配越好。
 */
export function healthSessionMatchScore(
  source: TimeRange & { sessionType: ExternalHealthSessionType },
  canonical: TimeRange,
) {
  const sourceDuration = Math.max(
    1,
    source.endTime.valueOf() - source.startTime.valueOf(),
  );
  const canonicalDuration = Math.max(
    1,
    canonical.endTime.valueOf() - canonical.startTime.valueOf(),
  );
  const overlap = Math.max(
    0,
    Math.min(source.endTime.valueOf(), canonical.endTime.valueOf()) -
      Math.max(source.startTime.valueOf(), canonical.startTime.valueOf()),
  );
  const overlapRatio = overlap / Math.min(sourceDuration, canonicalDuration);
  const startDiffMinutes =
    Math.abs(source.startTime.valueOf() - canonical.startTime.valueOf()) /
    60_000;
  const endDiffMinutes =
    Math.abs(source.endTime.valueOf() - canonical.endTime.valueOf()) / 60_000;

  let matches = false;
  switch (source.sessionType) {
    case ExternalHealthSessionType.SLEEP:
    case ExternalHealthSessionType.NAP:
      matches =
        overlapRatio >= 0.6 || (startDiffMinutes <= 45 && endDiffMinutes <= 90);
      break;
    case ExternalHealthSessionType.HEALTH_SNAPSHOT:
      matches = startDiffMinutes <= 5;
      break;
    case ExternalHealthSessionType.AUTO_ACTIVITY:
      matches =
        overlapRatio >= 0.7 && startDiffMinutes <= 10 && endDiffMinutes <= 10;
      break;
  }
  if (!matches) return null;
  return overlapRatio * 1000 - startDiffMinutes * 2 - endDiffMinutes + 10_000;
}

function metadataQualityRank(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 0;
  }
  const value = Number((metadata as Record<string, unknown>).qualityRank);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 幂等存储 provider session 事实，并把匹配事实合并为与 provider 无关的规范
 * session。使用手工/provider 优先级和质量等级选择代表性边界，同时保留低等级来源。
 */
@Injectable()
export class HealthSessionAssociationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthDataRepository,
  ) {}

  /**
   * Upsert 单条来源事实，拒绝过期 provider 更新，将 segment 裁剪到 session 边界，
   * 并关联或重建最佳规范 session。
   */
  async upsertSession(args: {
    userId: string;
    candidate: ExternalHealthSessionCandidate;
  }) {
    const { candidate } = args;
    if (
      !Number.isFinite(candidate.startTime.valueOf()) ||
      !Number.isFinite(candidate.endTime.valueOf()) ||
      candidate.endTime <= candidate.startTime ||
      (candidate.durationSeconds != null &&
        (!Number.isFinite(candidate.durationSeconds) ||
          candidate.durationSeconds < 0)) ||
      (candidate.score != null && !Number.isFinite(candidate.score))
    ) {
      throw new Error('Invalid external health session time range');
    }
    const segments = (candidate.segments ?? []).map((segment) => {
      if (
        !Number.isFinite(segment.startTime.valueOf()) ||
        !Number.isFinite(segment.endTime.valueOf()) ||
        segment.endTime <= segment.startTime
      ) {
        throw new Error('Invalid external health session segment time range');
      }
      const startTime = new Date(
        Math.max(candidate.startTime.valueOf(), segment.startTime.valueOf()),
      );
      const endTime = new Date(
        Math.min(candidate.endTime.valueOf(), segment.endTime.valueOf()),
      );
      if (endTime <= startTime) {
        throw new Error('Health session segment is outside the session range');
      }
      return { ...segment, startTime, endTime };
    });

    return this.health.runTransaction(
      async (tx) => {
        await acquireHashtextAdvisoryXactLock(
          tx,
          `health-session|${args.userId}|${candidate.sessionType}`,
        );
        const existing = await this.health.providerSessions(tx).findFirst({
          where: {
            userId: args.userId,
            provider: candidate.provider,
            sourceNamespace: candidate.sourceNamespace,
            sessionType: candidate.sessionType,
            externalId: candidate.externalId,
          },
          select: {
            id: true,
            canonicalSessionId: true,
            sourceUpdatedAt: true,
          },
        });
        if (
          existing?.sourceUpdatedAt &&
          candidate.sourceUpdatedAt &&
          existing.sourceUpdatedAt > candidate.sourceUpdatedAt
        ) {
          return {
            sessionId: existing.id,
            canonicalSessionId: existing.canonicalSessionId,
            stale: true,
          };
        }

        const createData: Prisma.ExternalHealthSessionUncheckedCreateInput = {
          userId: args.userId,
          connectionId: candidate.connectionId ?? undefined,
          provider: candidate.provider,
          sourceNamespace: candidate.sourceNamespace,
          sessionType: candidate.sessionType,
          externalId: candidate.externalId,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          durationSeconds:
            candidate.durationSeconds ?? durationSeconds(candidate),
          calendarDate: candidate.calendarDate ?? undefined,
          timezone: candidate.timezone ?? undefined,
          startOffsetSeconds: candidate.startOffsetSeconds ?? undefined,
          endOffsetSeconds: candidate.endOffsetSeconds ?? undefined,
          score: candidate.score ?? undefined,
          summary:
            candidate.summary == null
              ? Prisma.DbNull
              : (candidate.summary as Prisma.InputJsonValue),
          sourceUpdatedAt: candidate.sourceUpdatedAt ?? undefined,
          deletedAt: candidate.deletedAt ?? null,
          snapshotId: candidate.snapshotId ?? undefined,
          metadata:
            candidate.metadata == null
              ? Prisma.DbNull
              : (candidate.metadata as Prisma.InputJsonValue),
        };
        const updateData: Prisma.ExternalHealthSessionUncheckedUpdateInput = {
          ...createData,
          connectionId:
            candidate.connectionId === undefined
              ? undefined
              : candidate.connectionId,
          calendarDate:
            candidate.calendarDate === undefined
              ? undefined
              : candidate.calendarDate,
          timezone:
            candidate.timezone === undefined ? undefined : candidate.timezone,
          startOffsetSeconds:
            candidate.startOffsetSeconds === undefined
              ? undefined
              : candidate.startOffsetSeconds,
          endOffsetSeconds:
            candidate.endOffsetSeconds === undefined
              ? undefined
              : candidate.endOffsetSeconds,
          score: candidate.score === undefined ? null : candidate.score,
          summary:
            candidate.summary == null
              ? Prisma.DbNull
              : (candidate.summary as Prisma.InputJsonValue),
          sourceUpdatedAt:
            candidate.sourceUpdatedAt === undefined
              ? undefined
              : candidate.sourceUpdatedAt,
          snapshotId:
            candidate.snapshotId === undefined
              ? undefined
              : candidate.snapshotId,
          metadata:
            candidate.metadata == null
              ? Prisma.DbNull
              : (candidate.metadata as Prisma.InputJsonValue),
        };
        const session = existing
          ? await this.health.providerSessions(tx).update({
              where: { id: existing.id },
              data: updateData,
            })
          : await this.health.providerSessions(tx).create({ data: createData });

        await this.health.providerSegments(tx).deleteMany({
          where: { sessionId: session.id },
        });
        if (!candidate.deletedAt && segments.length > 0) {
          await this.health.providerSegments(tx).createMany({
            data: segments.map((segment, position) => ({
              sessionId: session.id,
              position,
              segmentType: segment.segmentType,
              startTime: segment.startTime,
              endTime: segment.endTime,
              durationSeconds: durationSeconds(segment),
              status: segment.status ?? 'valid',
              sourceMessage: segment.sourceMessage ?? undefined,
              sourceIndex: segment.sourceIndex ?? undefined,
              metadata:
                segment.metadata == null
                  ? Prisma.DbNull
                  : (segment.metadata as Prisma.InputJsonValue),
            })),
          });
        }

        const canonicalSessionId = await this.associateWith(
          tx,
          args.userId,
          session,
        );
        if (
          existing?.canonicalSessionId &&
          existing.canonicalSessionId !== canonicalSessionId
        ) {
          await this.rebuildCanonicalWith(tx, existing.canonicalSessionId);
        }
        if (canonicalSessionId) {
          await this.rebuildCanonicalWith(tx, String(canonicalSessionId));
        }
        return {
          sessionId: session.id,
          canonicalSessionId,
          stale: false,
        };
      },
      { timeout: 30_000 },
    );
  }

  /** 来源变化后，重建某个本地日期下的规范 session。 */
  async reconcileCalendarDate(
    args: {
      userId: string;
      calendarDate: Date;
      sessionType?: ExternalHealthSessionType;
    },
    db?: PrismaTx,
  ) {
    if (!db) {
      return this.health.runTransaction((tx) =>
        this.reconcileCalendarDate(args, tx),
      );
    }
    if (args.sessionType) {
      await acquireHashtextAdvisoryXactLock(
        db,
        `health-session|${args.userId}|${args.sessionType}`,
      );
    }
    const sessions = await this.health.sessions(db).findMany({
      where: {
        userId: args.userId,
        calendarDate: args.calendarDate,
        deletedAt: null,
        ...(args.sessionType ? { sessionType: args.sessionType } : {}),
      },
      select: { id: true },
    });
    for (const session of sessions) {
      await this.rebuildCanonicalWith(db, session.id);
    }
    return { reconciledCount: sessions.length };
  }

  /**
   * 软删除曾由某快照生成、但在当前重放中已经不存在的 session，随后重建全部受影响
   * 的规范 session。
   */
  async tombstoneMissingSnapshotSessions(args: {
    snapshotId: string;
    retainedSessionIds: string[];
  }) {
    return this.health.runTransaction(async (tx) => {
      const scopes = await this.health.providerSessions(tx).findMany({
        where: { snapshotId: args.snapshotId },
        distinct: ['userId', 'sessionType'],
        select: { userId: true, sessionType: true },
      });
      if (scopes.length === 0) return { deletedCount: 0 };
      for (const scope of [...scopes].sort(
        (left, right) =>
          left.userId.localeCompare(right.userId) ||
          left.sessionType.localeCompare(right.sessionType),
      )) {
        await acquireHashtextAdvisoryXactLock(
          tx,
          `health-session|${scope.userId}|${scope.sessionType}`,
        );
      }
      const missing = await this.health.providerSessions(tx).findMany({
        where: {
          snapshotId: args.snapshotId,
          OR: scopes.map((scope) => ({
            userId: scope.userId,
            sessionType: scope.sessionType,
          })),
          deletedAt: null,
          ...(args.retainedSessionIds.length > 0
            ? { id: { notIn: args.retainedSessionIds } }
            : {}),
        },
        select: { id: true, canonicalSessionId: true },
      });
      if (missing.length === 0) return { deletedCount: 0 };
      const deletedAt = new Date();
      await this.health.providerSessions(tx).updateMany({
        where: { id: { in: missing.map((session) => session.id) } },
        data: { deletedAt },
      });
      for (const canonicalSessionId of new Set(
        missing
          .map((session) => session.canonicalSessionId)
          .filter((id): id is string => typeof id === 'string'),
      )) {
        await this.rebuildCanonicalWith(tx, String(canonicalSessionId));
      }
      return { deletedCount: missing.length };
    });
  }

  /**
   * 替换一个权威 provider、session、日期范围：软删除不在 `retainedExternalIds`
   * 中的事实，并重建受影响的规范 session。
   */
  async tombstoneProviderSessionScope(args: {
    userId: string;
    provider: HealthDataProvider;
    connectionId?: string | null;
    sourceNamespace?: string;
    externalIdPrefix?: string;
    sessionType: ExternalHealthSessionType;
    calendarDate: Date;
    retainedExternalIds: string[];
  }) {
    return this.health.runTransaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(
        tx,
        `health-session|${args.userId}|${args.sessionType}`,
      );
      const missing = await this.health.providerSessions(tx).findMany({
        where: {
          userId: args.userId,
          provider: args.provider,
          ...(args.connectionId !== undefined
            ? { connectionId: args.connectionId }
            : {}),
          ...(args.sourceNamespace
            ? { sourceNamespace: args.sourceNamespace }
            : {}),
          sessionType: args.sessionType,
          ...(args.externalIdPrefix ? {} : { calendarDate: args.calendarDate }),
          deletedAt: null,
          ...(args.externalIdPrefix || args.retainedExternalIds.length > 0
            ? {
                externalId: {
                  ...(args.externalIdPrefix
                    ? { startsWith: args.externalIdPrefix }
                    : {}),
                  ...(args.retainedExternalIds.length > 0
                    ? { notIn: args.retainedExternalIds }
                    : {}),
                },
              }
            : {}),
        },
        select: { id: true, canonicalSessionId: true },
      });
      if (missing.length === 0) return { deletedCount: 0 };
      await this.health.providerSessions(tx).updateMany({
        where: { id: { in: missing.map((session) => session.id) } },
        data: { deletedAt: new Date() },
      });
      for (const canonicalSessionId of new Set(
        missing
          .map((session) => session.canonicalSessionId)
          .filter((id): id is string => typeof id === 'string'),
      )) {
        await this.rebuildCanonicalWith(tx, String(canonicalSessionId));
      }
      return { deletedCount: missing.length };
    });
  }

  /** 将一条有效来源事实关联到最佳的已有或新建规范 session。 */
  private async associateWith(
    tx: PrismaTx,
    userId: string,
    source: ExternalHealthSession,
  ) {
    if (source.deletedAt && source.canonicalSessionId) {
      return source.canonicalSessionId;
    }
    if (source.deletedAt) return null;
    const marginMs =
      source.sessionType === ExternalHealthSessionType.SLEEP ||
      source.sessionType === ExternalHealthSessionType.NAP
        ? 6 * 60 * 60 * 1000
        : 30 * 60 * 1000;
    const canonicals = await this.health.sessions(tx).findMany({
      where: {
        userId,
        sessionType: source.sessionType,
        deletedAt: null,
        startTime: { lte: new Date(source.endTime.valueOf() + marginMs) },
        endTime: { gte: new Date(source.startTime.valueOf() - marginMs) },
      },
      select: { id: true, startTime: true, endTime: true },
    });
    const matches = canonicals
      .map((canonical) => ({
        ...canonical,
        score: healthSessionMatchScore(source, canonical),
      }))
      .filter(
        (canonical): canonical is typeof canonical & { score: number } =>
          canonical.score != null,
      )
      .sort(
        (a, b) =>
          b.score - a.score || String(a.id).localeCompare(String(b.id)),
      );
    const match = matches[0];
    const canonical = match
      ? match
      : await this.health.sessions(tx).create({
          data: {
            userId,
            sessionType: source.sessionType,
            startTime: source.startTime,
            endTime: source.endTime,
            calendarDate: source.calendarDate,
            timezone: source.timezone,
            durationSeconds: source.durationSeconds,
            score: source.score,
            summary:
              source.summary == null
                ? Prisma.DbNull
                : (source.summary as Prisma.InputJsonValue),
            selectedProvider: source.provider,
            computedAt: new Date(),
          },
          select: { id: true },
        });
    const duplicateCanonicalIds = matches
      .slice(1)
      .map((entry) => String(entry.id));
    if (duplicateCanonicalIds.length > 0) {
      await this.health.sessions(tx).updateMany({
        where: { id: { in: duplicateCanonicalIds } },
        data: {
          selectedProvider: null,
          selectedSourceId: null,
          deletedAt: new Date(),
          computedAt: new Date(),
        },
      });
      await this.health.providerSessions(tx).updateMany({
        where: { canonicalSessionId: { in: duplicateCanonicalIds } },
        data: { canonicalSessionId: canonical.id },
      });
    }
    await this.health.providerSessions(tx).update({
      where: { id: source.id },
      data: { canonicalSessionId: canonical.id },
    });
    return canonical.id;
  }

  /** 重新计算规范边界、代表字段和合并后的 segment。 */
  private async rebuildCanonicalWith(
    tx: PrismaTx,
    canonicalSessionId: string,
  ) {
    const sources = await this.health.providerSessions(tx).findMany({
      where: {
        canonicalSessionId,
        deletedAt: null,
        OR: [
          { snapshotId: null },
          {
            snapshot: {
              manifest: { path: ['status'], equals: 'READY' },
            },
          },
        ],
      },
      orderBy: [{ sourceUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
    });
    if (sources.length === 0) {
      const pendingSource = await this.health.providerSessions(tx).findFirst({
        where: { canonicalSessionId, deletedAt: null },
        select: { id: true },
      });
      if (pendingSource) return;
      await this.health.sessions(tx).update({
        where: { id: canonicalSessionId },
        data: {
          selectedProvider: null,
          selectedSourceId: null,
          deletedAt: new Date(),
          computedAt: new Date(),
        },
      });
      return;
    }

    const first = sources[0]!;
    const preferredProvider =
      first.sessionType === ExternalHealthSessionType.SLEEP &&
      first.calendarDate
        ? (
            await this.health.dailyMetrics(tx).findFirst({
              where: {
                userId: first.userId,
                date: first.calendarDate,
                metricType: { in: [...SLEEP_DAILY_METRICS] },
                selectedProvider: { not: null },
              },
              orderBy: { metricType: 'asc' },
              select: { selectedProvider: true },
            })
          )?.selectedProvider
        : null;
    const winner = [...sources].sort((a, b) => {
      const preferredDelta =
        Number(b.provider === preferredProvider) -
        Number(a.provider === preferredProvider);
      return (
        preferredDelta ||
        metadataQualityRank(b.metadata) - metadataQualityRank(a.metadata) ||
        healthDataProviderPriority(b.provider) -
          healthDataProviderPriority(a.provider) ||
        (b.sourceUpdatedAt?.valueOf() ?? b.updatedAt.valueOf()) -
          (a.sourceUpdatedAt?.valueOf() ?? a.updatedAt.valueOf()) ||
        String(a.id).localeCompare(String(b.id))
      );
    })[0]!;
    const sourceBreakdown = Object.fromEntries(
      sources.map((source) => [
        source.id,
        {
          provider: source.provider,
          connectionId: source.connectionId,
          sourceNamespace: source.sourceNamespace,
          externalId: source.externalId,
          startTime: source.startTime.toISOString(),
          endTime: source.endTime.toISOString(),
          durationSeconds: source.durationSeconds,
          score: source.score,
          selected: source.id === winner.id,
        },
      ]),
    );
    await this.health.sessions(tx).update({
      where: { id: canonicalSessionId },
      data: {
        startTime: winner.startTime,
        endTime: winner.endTime,
        calendarDate: winner.calendarDate,
        timezone: winner.timezone,
        durationSeconds: winner.durationSeconds,
        score: winner.score,
        summary:
          winner.summary == null
            ? Prisma.DbNull
            : (winner.summary as Prisma.InputJsonValue),
        selectedProvider: winner.provider,
        selectedSourceId: winner.id,
        sourceBreakdown,
        computedAt: new Date(),
        deletedAt: null,
      },
    });
  }
}

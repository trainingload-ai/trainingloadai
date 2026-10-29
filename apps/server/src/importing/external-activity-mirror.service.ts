import { Injectable } from '@nestjs/common';
import {
  ImportSourceKind,
  ImportSourceResolutionReason,
  ImportSourceResolutionStatus,
  Prisma,
  ThirdPartyProvider,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import {
  evaluateExternalActivityMirrorMatch,
  type ExternalActivityMatchCandidate,
} from './external-activity-mirror-match';
import {
  CROSS_SOURCE_ACTIVITY_MATCH_POLICY,
  rankUniqueCrossSourceMatch,
} from './cross-source-activity-match.policy';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function localStartKey(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw.replace(/\.\d{1,6}/, '').slice(0, 19);
}

function listActivity(rawPayload: unknown): JsonRecord {
  const raw = record(rawPayload);
  const direct = record(raw.listActivity ?? raw.activity);
  if (Object.keys(direct).length > 0) return direct;
  const original = record(raw.original);
  return record(original.listActivity ?? original.activity ?? original);
}

export type ExternalActivityMirrorDto = {
  id: string;
  kind: 'external_activity_mirror';
  title: string | null;
  startTime: string | null;
  discoveredVia: string;
  originProvider: string;
  status: 'ROUTING' | 'BLOCKED' | 'NOT_FOUND';
  reason: ImportSourceResolutionReason | null;
  action: 'WAIT' | 'MANAGE_CONNECTION' | 'RETRY';
};

export type ExternalActivityTimelineCursor = {
  startTime: Date | null;
  kind: 'activity' | 'external_activity_mirror';
  id: string;
};

export type ExternalActivityMirrorTimelineCandidate = {
  mirror: ExternalActivityMirrorDto;
  /** 仅供服务端统一时间线排序和生成游标，不是正式 Activity 字段。 */
  sortTime: Date | null;
};

type MirrorProjectionRow = {
  id: string;
  rawPayload: Prisma.JsonValue | null;
  timelineTitle: string | null;
  timelineStartTime: Date | null;
  resolutionStatus: ImportSourceResolutionStatus;
  resolutionReason: ImportSourceResolutionReason | null;
  sourceKind: ImportSourceKind;
  originProvider: ThirdPartyProvider | null;
};

function toMirrorDto(row: MirrorProjectionRow): ExternalActivityMirrorDto {
  const activity = listActivity(row.rawPayload);
  const status = row.resolutionStatus as ExternalActivityMirrorDto['status'];
  const action =
    status === 'ROUTING'
      ? 'WAIT'
      : row.resolutionReason ===
            ImportSourceResolutionReason.ORIGIN_ACTIVITY_NOT_FOUND ||
          row.resolutionReason ===
            ImportSourceResolutionReason.ORIGIN_ACTIVITY_AMBIGUOUS ||
          row.resolutionReason ===
            ImportSourceResolutionReason.ORIGIN_SYNC_FAILED
        ? 'RETRY'
        : 'MANAGE_CONNECTION';
  return {
    id: row.id,
    kind: 'external_activity_mirror',
    title: row.timelineTitle ?? text(activity.name),
    startTime:
      text(activity.start_date ?? activity.start_date_local) ??
      row.timelineStartTime?.toISOString() ??
      null,
    discoveredVia: row.sourceKind.toLowerCase(),
    originProvider: row.originProvider ?? 'unknown',
    status,
    reason: row.resolutionReason,
    action,
  };
}

type UnresolvedMirror = {
  id: string;
  sourceKind: ImportSourceKind;
  provider: ThirdPartyProvider | null;
  sourceUid: string;
  accountRef: string | null;
  externalId: string | null;
  originProvider: ThirdPartyProvider | null;
  rawPayload: Prisma.JsonValue | null;
};

type NearbyActivity = ExternalActivityMatchCandidate & {
  id: number;
  activitySources: Array<{
    sourceObjectId: string | null;
    provider: ThirdPartyProvider | null;
  }>;
};

type ResolutionContext = {
  importedRaw: JsonRecord;
  materializedProvider: ThirdPartyProvider | null;
  materializedSourceKind: ImportSourceKind;
  nearbyActivities: NearbyActivity[];
};

type MirrorMatch = NonNullable<
  ReturnType<typeof evaluateExternalActivityMirrorMatch>
>;

type MirrorAssessment =
  | { kind: 'NO_MATCH'; mirrorId: string }
  | { kind: 'AMBIGUOUS_ACTIVITY'; mirrorId: string }
  | { kind: 'MATCH'; mirror: UnresolvedMirror; match: MirrorMatch };

type MirrorResolutionDecision =
  | {
      kind: 'NO_MATCH';
      ambiguousActivityMirrorIds: string[];
    }
  | {
      kind: 'AMBIGUOUS_MIRRORS';
      ambiguousActivityMirrorIds: string[];
      competingMirrorIds: string[];
    }
  | {
      kind: 'RESOLVE';
      ambiguousActivityMirrorIds: string[];
      resolution: Extract<MirrorAssessment, { kind: 'MATCH' }>;
    };

export type ExternalActivityMirrorResolutionResult =
  | { kind: 'NO_MIRRORS' }
  | { kind: 'MISSING_CONTEXT' }
  | { kind: 'NO_MATCH' }
  | { kind: 'AMBIGUOUS_ACTIVITY'; mirrorIds: string[] }
  | { kind: 'AMBIGUOUS_MIRRORS'; mirrorIds: string[] }
  | { kind: 'RESOLVED'; mirrorId: string; activityId: number };

/** 对一个影子评估全部附近正式活动，只返回与本次触发活动有关的结论。 */
function assessMirrorAgainstActivities(args: {
  mirror: UnresolvedMirror;
  triggerActivityId: number;
  triggerSourceObjectId: string;
  context: ResolutionContext;
}): MirrorAssessment {
  const mirrorPayload = listActivity(args.mirror.rawPayload);
  const possibleActivities: Array<{
    formalActivity: NearbyActivity;
    match: MirrorMatch;
    confidence: number;
  }> = [];

  for (const formalActivity of args.context.nearbyActivities) {
    const isTriggerActivity = formalActivity.id === args.triggerActivityId;
    const providers = formalActivity.activitySources
      .map((source) => source.provider)
      .filter((provider): provider is ThirdPartyProvider => provider != null);
    if (isTriggerActivity && args.context.materializedProvider) {
      providers.push(args.context.materializedProvider);
    }

    const match = evaluateExternalActivityMirrorMatch({
      mirror: mirrorPayload,
      importedRaw: isTriggerActivity ? args.context.importedRaw : {},
      activity: formalActivity,
      providerAligned:
        args.mirror.originProvider != null &&
        providers.includes(args.mirror.originProvider),
      sameSourceObject:
        args.mirror.id === args.triggerSourceObjectId ||
        formalActivity.activitySources.some(
          (source) => source.sourceObjectId === args.mirror.id,
        ),
    });
    if (match) {
      possibleActivities.push({
        formalActivity,
        match,
        confidence: match.confidence,
      });
    }
  }

  const ranking = rankUniqueCrossSourceMatch(possibleActivities);
  if (
    !ranking.best ||
    ranking.best.formalActivity.id !== args.triggerActivityId
  ) {
    return { kind: 'NO_MATCH', mirrorId: args.mirror.id };
  }
  if (ranking.ambiguous) {
    return { kind: 'AMBIGUOUS_ACTIVITY', mirrorId: args.mirror.id };
  }
  return {
    kind: 'MATCH',
    mirror: args.mirror,
    match: ranking.best.match,
  };
}

/** 汇总单影子评估，额外阻止多个影子同时认领同一条正式 Activity。 */
function decideMirrorResolution(
  assessments: MirrorAssessment[],
): MirrorResolutionDecision {
  const ambiguousActivityMirrorIds = assessments.flatMap((assessment) =>
    assessment.kind === 'AMBIGUOUS_ACTIVITY' ? [assessment.mirrorId] : [],
  );
  const matches = assessments.filter(
    (assessment): assessment is Extract<MirrorAssessment, { kind: 'MATCH' }> =>
      assessment.kind === 'MATCH',
  );

  if (matches.length === 0) {
    return { kind: 'NO_MATCH', ambiguousActivityMirrorIds };
  }
  if (matches.length > 1) {
    return {
      kind: 'AMBIGUOUS_MIRRORS',
      ambiguousActivityMirrorIds,
      competingMirrorIds: matches.map(({ mirror }) => mirror.id),
    };
  }
  return {
    kind: 'RESOLVE',
    ambiguousActivityMirrorIds,
    resolution: matches[0],
  };
}

@Injectable()
export class ExternalActivityMirrorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importJobs: ImportingJobService,
  ) {}

  /**
   * 将未解析的 ImportSourceObject 投影为活动时间线 DTO。
   *
   * 这是只读展示模型：结果与 activities 分开返回，不进入 Activity 总数、PMC、
   * Workout 绑定、活动分析或任何以 t_activity 为事实来源的计算。
   */
  async listForUser(args: {
    userId: string;
    page?: number;
    search?: string;
    provider?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ExternalActivityMirrorDto[]> {
    if ((args.page ?? 1) !== 1) return [];
    const requestedOrigin =
      args.provider && !['all', 'intervals_icu'].includes(args.provider)
        ? (args.provider as ThirdPartyProvider)
        : null;
    const rows = await this.importJobs.sourceObjects().findMany({
      where: {
        userId: args.userId,
        sourceKind: ImportSourceKind.INTERVALS_ICU,
        originProvider: requestedOrigin ?? { not: null },
        resolvedActivityId: null,
        resolutionStatus: {
          in: [
            ImportSourceResolutionStatus.ROUTING,
            ImportSourceResolutionStatus.BLOCKED,
            ImportSourceResolutionStatus.NOT_FOUND,
          ],
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        rawPayload: true,
        timelineTitle: true,
        timelineStartTime: true,
        resolutionStatus: true,
        resolutionReason: true,
        sourceKind: true,
        originProvider: true,
      },
    });

    const query = args.search?.trim().toLowerCase();
    return rows.flatMap((row) => {
      const mirror = toMirrorDto(row);
      const title = mirror.title;
      const startTime = mirror.startTime;
      if (query && !title?.toLowerCase().includes(query)) return [];
      if (startTime) {
        const instant = new Date(startTime);
        if (
          Number.isFinite(instant.getTime()) &&
          ((args.startDate && instant < args.startDate) ||
            (args.endDate && instant > args.endDate))
        ) {
          return [];
        }
      }
      return [mirror];
    });
  }

  /**
   * 为统一活动时间线读取一页影子候选。
   *
   * 排序键由结构化 timelineStartTime + id 组成，不能再依赖 rawPayload 的
   * JSON 顺序。cursor 是整个时间线的最后一项，因此这里还要考虑同一时刻下
   * “正式 Activity 在前、影子在后”的跨类型稳定顺序。
   */
  async listTimelineCandidates(args: {
    userId: string;
    take: number;
    cursor?: ExternalActivityTimelineCursor | null;
    search?: string;
    provider?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ExternalActivityMirrorTimelineCandidate[]> {
    const requestedOrigin =
      args.provider && !['all', 'intervals_icu'].includes(args.provider)
        ? (args.provider as ThirdPartyProvider)
        : null;

    const where: Prisma.ImportSourceObjectWhereInput = {
      userId: args.userId,
      sourceKind: ImportSourceKind.INTERVALS_ICU,
      originProvider: requestedOrigin ?? { not: null },
      resolvedActivityId: null,
      resolutionStatus: {
        in: [
          ImportSourceResolutionStatus.ROUTING,
          ImportSourceResolutionStatus.BLOCKED,
          ImportSourceResolutionStatus.NOT_FOUND,
        ],
      },
    };
    if (args.search?.trim()) {
      where.timelineTitle = {
        contains: args.search.trim(),
        mode: 'insensitive',
      };
    }
    if (args.startDate || args.endDate) {
      where.timelineStartTime = {
        ...(args.startDate ? { gte: args.startDate } : {}),
        ...(args.endDate ? { lte: args.endDate } : {}),
      };
    }

    const cursorClause = this.timelineCursorWhere(args.cursor);
    if (cursorClause) where.AND = [cursorClause];

    const rows = await this.importJobs.sourceObjects().findMany({
      where,
      orderBy: [
        { timelineStartTime: { sort: 'desc', nulls: 'last' } },
        { id: 'desc' },
      ],
      take: args.take,
      select: {
        id: true,
        rawPayload: true,
        timelineTitle: true,
        timelineStartTime: true,
        resolutionStatus: true,
        resolutionReason: true,
        sourceKind: true,
        originProvider: true,
      },
    });

    return rows.map((row) => ({
      mirror: toMirrorDto(row),
      sortTime: row.timelineStartTime,
    }));
  }

  private timelineCursorWhere(
    cursor?: ExternalActivityTimelineCursor | null,
  ): Prisma.ImportSourceObjectWhereInput | null {
    if (!cursor) return null;
    if (cursor.startTime) {
      return {
        OR: [
          { timelineStartTime: { lt: cursor.startTime } },
          ...(cursor.kind === 'activity'
            ? [{ timelineStartTime: { equals: cursor.startTime } }]
            : [
                {
                  timelineStartTime: { equals: cursor.startTime },
                  id: { lt: cursor.id },
                },
              ]),
          { timelineStartTime: null },
        ],
      };
    }
    if (cursor.kind === 'activity') {
      return { timelineStartTime: null };
    }
    return { timelineStartTime: null, id: { lt: cursor.id } };
  }

  /**
   * 正式 Activity 物化后的统一解析入口。
   *
   * 不论正式数据来自哪个 Provider，都用同一套跨来源匹配策略
   * 检查未解析影子；本方法只能把影子关联到既有 Activity，不能创建 Activity。
   */
  async resolveForImportedActivity(args: {
    userId: string;
    activityId: number;
    provider: ThirdPartyProvider | null | undefined;
    sourceObjectId: string;
  }): Promise<ExternalActivityMirrorResolutionResult> {
    // 1. 找出可能被本次正式 Activity 认领的未解析影子。
    const mirrors = await this.findUnresolvedMirrors(args.userId);
    if (mirrors.length === 0) return { kind: 'NO_MIRRORS' };

    // 2. 加载本次物化来源，以及用于排除误匹配的附近正式活动。
    const context = await this.loadResolutionContext(args);
    if (!context) return { kind: 'MISSING_CONTEXT' };

    // 3. 纯评估：每个影子分别判断无匹配、正式活动歧义或唯一匹配。
    const assessments = mirrors.map((mirror) =>
      assessMirrorAgainstActivities({
        mirror,
        triggerActivityId: args.activityId,
        triggerSourceObjectId: args.sourceObjectId,
        context,
      }),
    );

    // 4. 汇总所有评估，避免多个影子同时认领同一条正式 Activity。
    const decision = decideMirrorResolution(assessments);
    return this.applyResolutionDecision(args, context, decision);
  }

  /** 查询该用户全部未解析的 Intervals 来源对象；真实来源类型不构成匹配限制。 */
  private findUnresolvedMirrors(userId: string): Promise<UnresolvedMirror[]> {
    // originProvider 只用于补数路由和审计，不限制哪个 Provider 可以完成解析。
    return this.importJobs.sourceObjects().findMany({
      where: {
        userId,
        sourceKind: ImportSourceKind.INTERVALS_ICU,
        originProvider: { not: null },
        resolvedActivityId: null,
        resolutionStatus: {
          in: [
            ImportSourceResolutionStatus.ROUTING,
            ImportSourceResolutionStatus.BLOCKED,
            ImportSourceResolutionStatus.NOT_FOUND,
          ],
        },
      },
      select: {
        id: true,
        sourceKind: true,
        provider: true,
        sourceUid: true,
        accountRef: true,
        externalId: true,
        originProvider: true,
        rawPayload: true,
      },
    });
  }

  /** 加载触发来源、触发活动，以及用于排除误匹配的附近正式活动。 */
  private async loadResolutionContext(args: {
    userId: string;
    activityId: number;
    provider: ThirdPartyProvider | null | undefined;
    sourceObjectId: string;
  }): Promise<ResolutionContext | null> {
    const [materializedSource, activity] = await Promise.all([
      this.importJobs.sourceObjects().findUnique({
        where: { id: args.sourceObjectId },
        select: { sourceKind: true, provider: true, rawPayload: true },
      }),
      this.prisma.activity.findFirst({
        where: { id: args.activityId, userId: args.userId },
        select: {
          id: true,
          startTime: true,
          timezone: true,
          sportType: true,
          elapsedTime: true,
          distance: true,
        },
      }),
    ]);
    if (!materializedSource || !activity?.startTime) return null;

    const nearbyActivities = await this.prisma.activity.findMany({
      where: {
        userId: args.userId,
        startTime: {
          gte: new Date(
            activity.startTime.getTime() -
              CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds * 1000,
          ),
          lte: new Date(
            activity.startTime.getTime() +
              CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds * 1000,
          ),
        },
        mergedIntoActivityId: null,
      },
      select: {
        id: true,
        startTime: true,
        timezone: true,
        sportType: true,
        elapsedTime: true,
        distance: true,
        activitySources: {
          where: { isActive: true },
          select: {
            sourceObjectId: true,
            provider: true,
          },
        },
      },
    });

    return {
      importedRaw: listActivity(materializedSource.rawPayload),
      materializedProvider: args.provider ?? materializedSource.provider,
      materializedSourceKind: materializedSource.sourceKind,
      nearbyActivities,
    };
  }

  /** 将纯决策转换为状态更新；只有 RESOLVE 分支会进入关联事务。 */
  private async applyResolutionDecision(
    args: { userId: string; activityId: number },
    context: ResolutionContext,
    decision: MirrorResolutionDecision,
  ): Promise<ExternalActivityMirrorResolutionResult> {
    if (decision.ambiguousActivityMirrorIds.length > 0) {
      await this.markMirrorsAmbiguous(decision.ambiguousActivityMirrorIds);
    }

    if (decision.kind === 'NO_MATCH') {
      return decision.ambiguousActivityMirrorIds.length > 0
        ? {
            kind: 'AMBIGUOUS_ACTIVITY',
            mirrorIds: decision.ambiguousActivityMirrorIds,
          }
        : { kind: 'NO_MATCH' };
    }

    if (decision.kind === 'AMBIGUOUS_MIRRORS') {
      await this.markMirrorsAmbiguous(decision.competingMirrorIds);
      return {
        kind: 'AMBIGUOUS_MIRRORS',
        mirrorIds: decision.competingMirrorIds,
      };
    }

    await this.persistResolution(args, context, decision.resolution);
    return {
      kind: 'RESOLVED',
      mirrorId: decision.resolution.mirror.id,
      activityId: args.activityId,
    };
  }

  private markMirrorsAmbiguous(mirrorIds: string[]) {
    // 宁可继续显示影子，也不能把一次训练静默挂到错误的正式 Activity。
    return this.importJobs.sourceObjects().updateMany({
      where: { id: { in: mirrorIds } },
      data: {
        resolutionStatus: ImportSourceResolutionStatus.NOT_FOUND,
        resolutionReason:
          ImportSourceResolutionReason.ORIGIN_ACTIVITY_AMBIGUOUS,
      },
    });
  }

  /** 原子写入次级来源关联并关闭影子，不创建新的 Activity。 */
  private async persistResolution(
    args: { userId: string; activityId: number },
    context: ResolutionContext,
    resolution: Extract<MirrorAssessment, { kind: 'MATCH' }>,
  ) {
    const { mirror, match } = resolution;
    const resolutionMetadata = {
      resolution: 'external_activity_match',
      originProvider: mirror.originProvider,
      materializedProvider: context.materializedProvider,
      materializedSourceKind: context.materializedSourceKind,
      confidence: match.confidence,
      evidence: match.evidence,
    } satisfies Prisma.InputJsonObject;
    // 解析必须原子完成：为正式 Activity 增加次级发现来源，同时关闭影子投影。
    // 不创建第二条 Activity，因此训练统计和计划课绑定仍只看到一个正式活动。
    await this.prisma.$transaction(async (tx) => {
      await tx.activitySource.upsert({
        where: {
          activity_source_identity_unique: {
            userId: args.userId,
            sourceKind: mirror.sourceKind,
            sourceUid: mirror.sourceUid,
          },
        },
        update: {
          activityId: args.activityId,
          sourceObjectId: mirror.id,
          provider: mirror.provider,
          accountRef: mirror.accountRef,
          externalId: mirror.externalId,
          isPrimary: false,
          isActive: true,
          metadata: resolutionMetadata,
          lastImportedAt: new Date(),
        },
        create: {
          activityId: args.activityId,
          userId: args.userId,
          sourceObjectId: mirror.id,
          sourceKind: mirror.sourceKind,
          provider: mirror.provider,
          sourceUid: mirror.sourceUid,
          accountRef: mirror.accountRef,
          externalId: mirror.externalId,
          metadata: resolutionMetadata,
          isPrimary: false,
          isActive: true,
          lastImportedAt: new Date(),
        },
      });
      await this.importJobs.sourceObjects(tx).update({
        where: { id: mirror.id },
        data: {
          resolvedActivityId: args.activityId,
          resolvedAt: new Date(),
          resolutionStatus: ImportSourceResolutionStatus.RESOLVED,
          resolutionReason: null,
        },
      });
    });
  }

  /**
   * 真实来源同步返回后，先按当地开始时间统计候选数量。
   * 0 条标记 NOT_FOUND，超过 1 条标记 AMBIGUOUS；唯一候选留给正式导入完成时解析。
   */
  async classifySyncRequestCandidates(
    requestId: string,
    candidateStartTimes: Array<string | null>,
  ) {
    const counts = new Map<string, number>();
    for (const startTime of candidateStartTimes) {
      const key = localStartKey(startTime);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const mirrors = await this.importJobs.sourceObjects().findMany({
      where: {
        originSyncRequestId: requestId,
        resolvedActivityId: null,
        resolutionStatus: ImportSourceResolutionStatus.ROUTING,
      },
      select: { id: true, rawPayload: true },
    });
    const notFoundIds: string[] = [];
    const ambiguousIds: string[] = [];
    for (const mirror of mirrors) {
      const activity = listActivity(mirror.rawPayload);
      const key = localStartKey(
        activity.start_date_local ?? activity.start_date,
      );
      const count = key ? (counts.get(key) ?? 0) : 0;
      if (count === 0) notFoundIds.push(mirror.id);
      if (count > 1) ambiguousIds.push(mirror.id);
    }
    await Promise.all([
      notFoundIds.length
        ? this.importJobs.sourceObjects().updateMany({
            where: { id: { in: notFoundIds } },
            data: {
              resolutionStatus: ImportSourceResolutionStatus.NOT_FOUND,
              resolutionReason:
                ImportSourceResolutionReason.ORIGIN_ACTIVITY_NOT_FOUND,
            },
          })
        : Promise.resolve(),
      ambiguousIds.length
        ? this.importJobs.sourceObjects().updateMany({
            where: { id: { in: ambiguousIds } },
            data: {
              resolutionStatus: ImportSourceResolutionStatus.NOT_FOUND,
              resolutionReason:
                ImportSourceResolutionReason.ORIGIN_ACTIVITY_AMBIGUOUS,
            },
          })
        : Promise.resolve(),
    ]);
  }

  async markOriginImportFailed(args: {
    userId: string;
    sourceObjectId: string;
  }) {
    const source = await this.importJobs.sourceObjects().findUnique({
      where: { id: args.sourceObjectId },
      select: { provider: true, rawPayload: true },
    });
    if (!source?.provider) return;
    const sourceActivity = listActivity(source.rawPayload);
    const start = localStartKey(
      sourceActivity.start_date_local ?? sourceActivity.start_date,
    );
    if (!start) return;
    const candidates = await this.importJobs.sourceObjects().findMany({
      where: {
        userId: args.userId,
        sourceKind: ImportSourceKind.INTERVALS_ICU,
        originProvider: source.provider,
        resolvedActivityId: null,
        resolutionStatus: ImportSourceResolutionStatus.ROUTING,
      },
      select: { id: true, rawPayload: true },
    });
    const ids = candidates
      .filter((candidate) => {
        const activity = listActivity(candidate.rawPayload);
        return (
          localStartKey(activity.start_date_local ?? activity.start_date) ===
          start
        );
      })
      .map((candidate) => candidate.id);
    if (!ids.length) return;
    await this.importJobs.sourceObjects().updateMany({
      where: { id: { in: ids } },
      data: {
        resolutionStatus: ImportSourceResolutionStatus.BLOCKED,
        resolutionReason: ImportSourceResolutionReason.ORIGIN_SYNC_FAILED,
      },
    });
  }

  async resolveForSyncRequest(requestId: string) {
    const request = await this.prisma.originActivitySyncRequest.findUnique({
      where: { id: requestId },
      select: { userId: true, provider: true },
    });
    if (!request) return;
    const sources = await this.importJobs.sourceObjects().findMany({
      where: {
        userId: request.userId,
        provider: request.provider,
        activitySources: { some: { isActive: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        activitySources: {
          where: { isActive: true },
          take: 1,
          select: { activityId: true },
        },
      },
    });
    for (const source of sources) {
      const activityId = source.activitySources[0]?.activityId;
      if (!activityId) continue;
      await this.resolveForImportedActivity({
        userId: request.userId,
        activityId,
        provider: request.provider,
        sourceObjectId: source.id,
      });
    }
  }
}

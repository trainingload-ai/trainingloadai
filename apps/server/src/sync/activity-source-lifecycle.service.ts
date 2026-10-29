import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from '@/importing/importing-job.service';
import {
  ImportSourceKind,
  Prisma,
  ThirdPartyProvider,
  type SportType,
} from '@prisma/client';
import type { CanonicalActivityPayload } from '@/importing/canonical-activity.types';
import { selectActivityGlobalRefreshScope } from '@/utils/activity-global-refresh-window';
import { evaluateActivityDataset } from '@/importing/activity-dataset-selector.service';
import {
  additionalActivitySourceExternalIdFilters,
  externalIdForActivitySource,
} from './activity-source-lifecycle-extension.port';

type SourceCandidate = {
  id: string;
  activityId: number;
  sourceKind: ImportSourceKind;
  sourceUid: string;
  provider: ThirdPartyProvider | null;
  externalId: string | null;
  sourceObjectId: string | null;
  isPrimary: boolean;
  createdAt: Date;
  metadata: unknown;
  canonicalSnapshot: { payload: unknown } | null;
};

function qualityScore(source: SourceCandidate) {
  const metadata = source.metadata as Record<string, unknown> | null;
  const quality = metadata?.datasetQuality as
    | Record<string, unknown>
    | undefined;
  const score = Number(quality?.score);
  if (Number.isFinite(score)) return score;
  const payload = source.canonicalSnapshot?.payload;
  if (payload && typeof payload === 'object') {
    try {
      return evaluateActivityDataset(
        payload as unknown as CanonicalActivityPayload,
      ).score;
    } catch {
      return -1;
    }
  }
  return -1;
}

export function selectFallbackActivitySource(
  sources: SourceCandidate[],
): SourceCandidate | null {
  return (
    [...sources]
      .filter((source) => source.canonicalSnapshot?.payload != null)
      .sort(
        (left, right) =>
          qualityScore(right) - qualityScore(left) ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      )[0] ?? null
  );
}

function selectBestActivitySource(
  sources: SourceCandidate[],
): SourceCandidate | null {
  return (
    [...sources].sort(
      (left, right) =>
        qualityScore(right) - qualityScore(left) ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )[0] ?? null
  );
}

function projectionSourceUid(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData))
    return null;
  const projection = (rawData as Record<string, unknown>).importProjection;
  if (
    !projection ||
    typeof projection !== 'object' ||
    Array.isArray(projection)
  )
    return null;
  const sourceUid = (projection as Record<string, unknown>).sourceUid;
  return typeof sourceUid === 'string' && sourceUid.trim()
    ? sourceUid.trim()
    : null;
}

function targetedSourceFilters(args: {
  provider: ThirdPartyProvider;
  externalIds: string[];
  sourceUids: string[];
}): Prisma.ActivitySourceWhereInput[] {
  const filters: Prisma.ActivitySourceWhereInput[] = args.sourceUids.map(
    (sourceUid) => ({ sourceUid }),
  );
  for (const externalId of args.externalIds) {
    filters.push({ externalId });
    filters.push(
      ...additionalActivitySourceExternalIdFilters({
        provider: args.provider,
        externalId,
      }),
    );
  }
  return filters;
}

function thirdPartyExternalIdForSource(source: SourceCandidate): string | null {
  return externalIdForActivitySource(source);
}

@Injectable()
export class ActivitySourceLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importJobs: ImportingJobService,
  ) {}

  async deactivateThirdPartyActivity(id: number) {
    const thirdPartyActivity = await this.prisma.thirdPartyActivity.findUnique({
      where: { id },
      select: { id: true, userId: true, provider: true, externalId: true },
    });
    if (!thirdPartyActivity) {
      return {
        thirdPartyActivities: 0,
        mappings: 0,
        activities: 0,
        requeuedActivities: 0,
      };
    }
    return this.deactivateProviderData({
      userId: thirdPartyActivity.userId,
      provider: thirdPartyActivity.provider,
      thirdPartyActivityIds: [thirdPartyActivity.id],
      externalIds: [thirdPartyActivity.externalId],
    });
  }

  async deactivateProviderData(args: {
    userId: string;
    provider: ThirdPartyProvider;
    thirdPartyActivityIds?: number[];
    externalIds?: string[];
  }) {
    const providerWide =
      !args.thirdPartyActivityIds?.length && !args.externalIds?.length;
    const thirdPartyWhere: Prisma.ThirdPartyActivityWhereInput = {
      userId: args.userId,
      provider: args.provider,
      ...(args.thirdPartyActivityIds?.length
        ? { id: { in: args.thirdPartyActivityIds } }
        : {}),
      ...(args.externalIds?.length
        ? { externalId: { in: args.externalIds } }
        : {}),
    };
    const thirdPartyActivities = await this.prisma.thirdPartyActivity.findMany({
      where: thirdPartyWhere,
      select: { id: true, externalId: true, rawData: true },
    });
    const thirdPartyActivityIds = thirdPartyActivities.map((item) => item.id);
    const externalIds = Array.from(
      new Set([
        ...(args.externalIds ?? []),
        ...thirdPartyActivities.map((item) => item.externalId),
      ]),
    );
    const sourceUids = Array.from(
      new Set(
        thirdPartyActivities
          .map((item) => projectionSourceUid(item.rawData))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const sourceFilters = targetedSourceFilters({
      provider: args.provider,
      externalIds,
      sourceUids,
    });

    return this.prisma.$transaction(async (tx) => {
      const mappings = thirdPartyActivityIds.length
        ? await tx.activityThirdPartyMapping.findMany({
            where: {
              thirdPartyActivityId: { in: thirdPartyActivityIds },
              OR: [{ isActive: true }, { isPrimary: true }],
            },
            select: { activityId: true },
          })
        : [];
      const sources = await tx.activitySource.findMany({
        where: {
          userId: args.userId,
          provider: args.provider,
          ...(providerWide
            ? {}
            : {
                OR: sourceFilters.length ? sourceFilters : [{ id: { in: [] } }],
              }),
          isActive: true,
        },
        select: { id: true, activityId: true, isPrimary: true },
      });
      const activityIds = Array.from(
        new Set([
          ...mappings.map((item) => item.activityId),
          ...sources.map((item) => item.activityId),
        ]),
      );
      const removedPrimaryActivityIds = new Set(
        sources
          .filter((source) => source.isPrimary)
          .map((source) => source.activityId),
      );
      const affectedActivities = activityIds.length
        ? await tx.activity.findMany({
            where: { id: { in: activityIds }, userId: args.userId },
            select: { id: true, sportType: true, startTime: true, state: true },
          })
        : [];
      const activityFacts = new Map(
        affectedActivities.map((activity) => [activity.id, activity]),
      );

      const thirdPartyUpdated = thirdPartyActivityIds.length
        ? await tx.thirdPartyActivity.updateMany({
            where: { id: { in: thirdPartyActivityIds }, state: 1 },
            data: { state: 0 },
          })
        : { count: 0 };
      const mappingsUpdated = thirdPartyActivityIds.length
        ? await tx.activityThirdPartyMapping.updateMany({
            where: {
              thirdPartyActivityId: { in: thirdPartyActivityIds },
              OR: [{ isActive: true }, { isPrimary: true }],
            },
            data: { isActive: false, isPrimary: false },
          })
        : { count: 0 };
      if (sources.length) {
        await tx.activitySource.updateMany({
          where: { id: { in: sources.map((source) => source.id) } },
          data: { isActive: false, isPrimary: false },
        });
      }

      const remainingSourceRows = activityIds.length
        ? ((await tx.activitySource.findMany({
            where: { activityId: { in: activityIds }, isActive: true },
            include: {
              canonicalSnapshot: { select: { payload: true } },
            },
            orderBy: { createdAt: 'asc' },
          })) as unknown as SourceCandidate[])
        : [];
      const remainingSourcesByActivity = new Map<number, SourceCandidate[]>();
      for (const source of remainingSourceRows) {
        const rows = remainingSourcesByActivity.get(source.activityId) ?? [];
        rows.push(source);
        remainingSourcesByActivity.set(source.activityId, rows);
      }
      const remainingMappings = activityIds.length
        ? await tx.activityThirdPartyMapping.findMany({
            where: { activityId: { in: activityIds }, isActive: true },
            select: {
              id: true,
              activityId: true,
              thirdPartyActivity: {
                select: {
                  provider: true,
                  externalId: true,
                  state: true,
                },
              },
            },
          })
        : [];
      const remainingMappingsByActivity = new Map<
        number,
        (typeof remainingMappings)[number][]
      >();
      for (const mapping of remainingMappings) {
        const rows = remainingMappingsByActivity.get(mapping.activityId) ?? [];
        rows.push(mapping);
        remainingMappingsByActivity.set(mapping.activityId, rows);
      }

      const hiddenActivityIds: number[] = [];
      const primaryReselectionActivityIds: number[] = [];
      const primarySourceIds: string[] = [];
      const primaryMappingIds: number[] = [];
      const globalRefreshCandidates: Array<{
        sportType: SportType;
        startTime: Date;
      }> = [];
      const rebuildItems: Array<{
        activityId: number;
        source: SourceCandidate;
        sourceObjectId: string;
        payload: CanonicalActivityPayload;
      }> = [];
      for (const activityId of activityIds) {
        const remainingSources =
          remainingSourcesByActivity.get(activityId) ?? [];
        const activityMappings =
          remainingMappingsByActivity.get(activityId) ?? [];
        const activePrimary = remainingSources.find(
          (source) => source.isPrimary,
        );

        if (!remainingSources.length) {
          if (!activityMappings.length) {
            hiddenActivityIds.push(activityId);
          }
          continue;
        }

        if (activePrimary && !removedPrimaryActivityIds.has(activityId)) {
          continue;
        }
        // 历史 ActivitySource 可能没有 canonical snapshot。它仍然是一个
        // 有效来源，不能因为无法立即 replay 就把用户原本可见的 Activity
        // 隐藏。优先选择可 replay 的来源；都不可 replay 时仍完成 primary
        // 选举，但保留当前已物化 Activity，等待该来源下次导入补齐 snapshot。
        const fallback =
          selectFallbackActivitySource(remainingSources) ??
          selectBestActivitySource(remainingSources)!;

        primaryReselectionActivityIds.push(activityId);
        primarySourceIds.push(fallback.id);
        const primaryExternalId = thirdPartyExternalIdForSource(fallback);
        if (fallback.provider && primaryExternalId) {
          const primaryMapping = activityMappings.find(
            (mapping) =>
              mapping.thirdPartyActivity.state === 1 &&
              mapping.thirdPartyActivity.provider === fallback.provider &&
              mapping.thirdPartyActivity.externalId === primaryExternalId,
          );
          if (primaryMapping) {
            primaryMappingIds.push(primaryMapping.id);
          }
        }

        // provider 生命周期操作不能改变用户已经隐藏/删除的 Activity 可见性。
        // 只完成来源 primary 选举，不触发会把 state 恢复为 1 的重建管线。
        if (activityFacts.get(activityId)?.state === 0) {
          continue;
        }

        if (!fallback.canonicalSnapshot?.payload) {
          continue;
        }

        const payload = fallback.canonicalSnapshot
          .payload as unknown as CanonicalActivityPayload;
        const sourceObject = fallback.sourceObjectId
          ? { id: fallback.sourceObjectId }
          : await this.importJobs.sourceObjects(tx).upsert({
              where: {
                import_source_object_identity_unique: {
                  userId: args.userId,
                  sourceKind: fallback.sourceKind,
                  sourceUid: fallback.sourceUid,
                },
              },
              update: {},
              create: {
                userId: args.userId,
                sourceKind: fallback.sourceKind,
                provider: fallback.provider,
                sourceUid: fallback.sourceUid,
                externalId: fallback.externalId,
                objectType: 'activity_rebuild',
              },
              select: { id: true },
            });
        rebuildItems.push({
          activityId,
          source: fallback,
          sourceObjectId: sourceObject.id,
          payload,
        });
      }

      const processingUpdatedAt = new Date();
      const hiddenActivities = hiddenActivityIds.length
        ? await tx.activity.updateMany({
            where: {
              id: { in: hiddenActivityIds },
              userId: args.userId,
              state: 1,
            },
            data: {
              state: 0,
              processingStatus: 'PARTIAL_FAILED',
              processingUpdatedAt,
              readyAt: null,
            },
          })
        : { count: 0 };
      for (const activityId of hiddenActivityIds) {
        const fact = activityFacts.get(activityId);
        if (fact?.state !== 1 || !fact.startTime) continue;
        globalRefreshCandidates.push({
          sportType: fact.sportType,
          startTime: fact.startTime,
        });
      }

      if (primaryReselectionActivityIds.length > 0) {
        await tx.activitySource.updateMany({
          where: {
            activityId: { in: primaryReselectionActivityIds },
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
        await tx.activitySource.updateMany({
          where: { id: { in: primarySourceIds } },
          data: { isPrimary: true },
        });
        await tx.activityThirdPartyMapping.updateMany({
          where: {
            activityId: { in: primaryReselectionActivityIds },
            isActive: true,
          },
          data: { isPrimary: false },
        });
        if (primaryMappingIds.length > 0) {
          await tx.activityThirdPartyMapping.updateMany({
            where: { id: { in: primaryMappingIds }, isActive: true },
            data: { isPrimary: true },
          });
        }
      }

      if (rebuildItems.length > 0) {
        await tx.activity.updateMany({
          where: { id: { in: rebuildItems.map((item) => item.activityId) } },
          data: {
            processingStatus: 'MATERIALIZED',
            processingUpdatedAt,
            readyAt: null,
          },
        });
      }

      const serializedRefreshCandidates = globalRefreshCandidates.map(
        (candidate) => ({
          sportType: candidate.sportType,
          startTime: candidate.startTime.toISOString(),
        }),
      );
      if (rebuildItems.length > 0) {
        const batch = await this.importJobs.batchJobs(tx).create({
          data: {
            userId: args.userId,
            sourceKind: ImportSourceKind.UNKNOWN,
            totalCount: rebuildItems.length,
            requestContext: {
              trigger: 'activity_source_primary_reselected',
              provider: args.provider,
              activityIds: rebuildItems.map((item) => item.activityId),
              globalRefreshCandidates: serializedRefreshCandidates,
              suppressCompletionNotification: true,
            },
          },
          select: { id: true },
        });
        await this.importJobs.itemJobs(tx).createMany({
          data: rebuildItems.map((item, position) => ({
            batchJobId: batch.id,
            userId: args.userId,
            sourceObjectId: item.sourceObjectId,
            sourceKind: item.source.sourceKind,
            sourceUid: item.source.sourceUid,
            position,
            sourceRef: {
              kind: 'canonical_payload',
              payload: item.payload,
            } as unknown as Prisma.InputJsonValue,
            analysisRequired: true,
          })),
        });
      } else {
        const refreshScope = selectActivityGlobalRefreshScope(
          globalRefreshCandidates,
        );
        if (refreshScope.eligibleCount > 0) {
          const batch = await this.importJobs.batchJobs(tx).create({
            data: {
              userId: args.userId,
              sourceKind: ImportSourceKind.UNKNOWN,
              status: 'POST_PROCESSING',
              totalCount: 0,
              completedAt: new Date(),
              requestContext: {
                trigger: 'activity_source_removed',
                provider: args.provider,
                globalRefreshCandidates: serializedRefreshCandidates,
                suppressCompletionNotification: true,
              },
            },
            select: { id: true },
          });
          await this.importJobs.postProcessJobs(tx).create({
            data: {
              userId: args.userId,
              batchJobId: batch.id,
              status: 'PENDING',
              recomputeFrom: refreshScope.recomputeFrom,
              recomputeTo: refreshScope.recomputeTo,
              affectedSportTypes: refreshScope.sportTypes,
              summary: {
                trigger: 'activity_source_removed',
                globalRefreshWindowDays: refreshScope.windowDays,
                globalRefreshEligibleCount: refreshScope.eligibleCount,
              },
            },
          });
        }
      }

      return {
        thirdPartyActivities: thirdPartyUpdated.count,
        mappings: mappingsUpdated.count,
        activities: hiddenActivities.count,
        requeuedActivities: rebuildItems.length,
      };
    });
  }
}

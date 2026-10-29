import { Injectable } from '@nestjs/common';
import type { Activity, MappingType, ThirdPartyProvider } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import type { CanonicalActivityPayload } from './canonical-activity.types';
import {
  CROSS_SOURCE_ACTIVITY_MATCH_POLICY,
  evaluateCrossSourceActivityMatch,
  rankUniqueCrossSourceMatch,
} from './cross-source-activity-match.policy';
import { providerFromSourceKind } from './external-provider-identity';

export type ActivityAssociationDecision = {
  activity: Activity | null;
  reason:
    | 'mapping'
    | 'source'
    | 'checksum'
    | 'dedupe'
    | 'provider'
    | 'fuzzy'
    | 'new';
  mappingType?: MappingType;
  confidence?: number;
  matchingFields?: Record<string, unknown>;
};

function coordinateNear(
  leftLat?: number | null,
  leftLng?: number | null,
  rightLat?: number | null,
  rightLng?: number | null,
) {
  if (
    leftLat == null ||
    leftLng == null ||
    rightLat == null ||
    rightLng == null
  )
    return false;
  // 约 200 米；只作为加分证据，不单独决定关联。
  return Math.hypot(leftLat - rightLat, leftLng - rightLng) <= 0.002;
}

@Injectable()
export class ActivityAssociationService {
  constructor(private readonly prisma: PrismaService) {}

  private async fuzzyMatch(args: {
    userId: string;
    payload: CanonicalActivityPayload;
    client?: PrismaTx;
  }): Promise<ActivityAssociationDecision | null> {
    const start = args.payload.summary.startTime;
    if (
      !start ||
      args.payload.summary.sportType === 'UNKNOWN' ||
      args.payload.source.kind === 'UNKNOWN'
    )
      return null;
    const startMs = new Date(start).getTime();
    if (!Number.isFinite(startMs)) return null;

    const candidates = await (args.client ?? this.prisma).activity.findMany({
      where: {
        userId: args.userId,
        sportType: args.payload.summary.sportType,
        startTime: {
          gte: new Date(
            startMs -
              CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds * 1000,
          ),
          lte: new Date(
            startMs +
              CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds * 1000,
          ),
        },
        activitySources: {
          some: {
            isActive: true,
            sourceKind: {
              notIn: [args.payload.source.kind, 'UNKNOWN'],
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const matches: ActivityAssociationDecision[] = [];
    for (const activity of candidates) {
      const startDiffSeconds =
        Math.abs(startMs - (activity.startTime?.getTime() ?? Number.NaN)) /
        1000;
      const endpointsNear =
        coordinateNear(
          args.payload.summary.startLat,
          args.payload.summary.startLng,
          activity.startLat,
          activity.startLng,
        ) &&
        coordinateNear(
          args.payload.summary.endLat,
          args.payload.summary.endLng,
          activity.endLat,
          activity.endLng,
        );
      const match = evaluateCrossSourceActivityMatch({
        startDiffSeconds,
        leftElapsedTime: args.payload.summary.elapsedTime,
        rightElapsedTime: activity.elapsedTime,
        leftDistance: args.payload.summary.distance,
        rightDistance: activity.distance,
        hasCoordinateEvidence:
          args.payload.summary.startLat != null && activity.startLat != null,
        endpointsNear,
        subSportMatches:
          args.payload.summary.subSportType != null &&
          args.payload.summary.subSportType === activity.sportDefinitionCode,
      });
      if (!match) continue;
      matches.push({
        activity,
        reason: 'fuzzy',
        mappingType: 'FUZZY',
        confidence: match.confidence,
        matchingFields: match.evidence,
      });
    }
    const ranking = rankUniqueCrossSourceMatch(
      matches.map((match) => ({
        ...match,
        confidence: match.confidence ?? 0,
      })),
    );
    const best = ranking.best;
    if (!best) return null;
    // 两个同样可信的候选通常是相邻的真实训练，宁可保留为新活动等待人工
    // 关联，也不能静默误合并。5 分置信度差是当前 matcher 的最小安全边际。
    if (ranking.ambiguous) return null;
    best.matchingFields = {
      ...(best.matchingFields ?? {}),
      runnerUpConfidence: ranking.runnerUp?.confidence ?? null,
      confidenceMargin: ranking.confidenceMargin,
    };
    return best;
  }

  async resolve(args: {
    userId: string;
    payload: CanonicalActivityPayload;
    thirdPartyActivityId?: number;
    client?: PrismaTx;
  }): Promise<ActivityAssociationDecision> {
    const db = args.client ?? this.prisma;
    if (args.thirdPartyActivityId) {
      const mapping = await db.activityThirdPartyMapping.findUnique({
        where: { thirdPartyActivityId: args.thirdPartyActivityId },
        include: { activity: true },
      });
      if (mapping?.activity) {
        if (mapping.activity.userId !== args.userId)
          throw new Error('Third-party mapping belongs to another user');
        return {
          activity: mapping.activity,
          reason: 'mapping',
          mappingType: mapping.mappingType,
          confidence: mapping.confidence,
          matchingFields:
            (mapping.matchingFields as Record<string, unknown>) ?? undefined,
        };
      }
    }

    const source = await db.activitySource.findUnique({
      where: {
        activity_source_identity_unique: {
          userId: args.userId,
          sourceKind: args.payload.source.kind,
          sourceUid: args.payload.source.sourceUid,
        },
      },
      include: { activity: true },
    });
    if (source?.activity)
      return { activity: source.activity, reason: 'source' };

    const checksum =
      args.payload.source.sourceChecksum ??
      args.payload.identity.datasetChecksum;
    const checksumSource = checksum
      ? await db.activitySource.findFirst({
          where: {
            userId: args.userId,
            sourceChecksum: checksum,
            isActive: true,
          },
          include: { activity: true },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    if (checksumSource?.activity) {
      return {
        activity: checksumSource.activity,
        reason: 'checksum',
        mappingType: 'EXACT',
        confidence: 1,
        matchingFields: { checksum, checksumAlgorithm: 'sha256' },
      };
    }

    const dedupeKey = args.payload.identity.dedupeKey;
    if (dedupeKey) {
      const dedupeSources = await db.activitySource.findMany({
        where: {
          userId: args.userId,
          dedupeKey,
          isActive: true,
          sourceKind: { not: args.payload.source.kind },
        },
        include: { activity: true },
        orderBy: { createdAt: 'asc' },
      });
      const candidates = Array.from(
        new Map(
          dedupeSources
            .filter((source) => source.activity)
            .map((source) => [source.activityId, source.activity]),
        ).values(),
      );
      if (candidates.length === 1) {
        return {
          activity: candidates[0]!,
          reason: 'dedupe',
          mappingType: 'FUZZY',
          confidence: 0.98,
          matchingFields: {
            dedupeKey,
            matcherVersion: 'canonical-core-v1',
          },
        };
      }
    }

    const provider =
      args.payload.source.provider ??
      providerFromSourceKind(args.payload.source.kind);
    const externalId = String(args.payload.source.externalId ?? '').trim();
    if (provider && externalId) {
      const legacy = await db.activity.findUnique({
        where: {
          provider_activity_unique: {
            thirdPartyProvider: provider,
            thirdPartyActivityId: externalId,
          },
        },
      });
      if (legacy) {
        if (legacy.userId !== args.userId)
          throw new Error('Legacy provider identity belongs to another user');
        return {
          activity: legacy,
          reason: 'provider',
          mappingType: 'EXACT',
          confidence: 1,
          matchingFields: { legacyProviderIdentity: true },
        };
      }
    }

    const fuzzy = await this.fuzzyMatch(args);
    if (fuzzy) return fuzzy;
    return { activity: null, reason: 'new' };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ImportSourceResolutionReason,
  ImportSourceResolutionStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import type { ImportSourceDataUnavailableError } from './import-item-provider.port';
import { importJsonValue } from './import-item-job.types';
import type { IntervalsIcuActivityListItem as IntervalsActivity } from '@/integrations/intervals-icu/intervals-icu.client';
import {
  getExternalActivityOriginRoutingExtension,
  type ExternalActivityDiscoveryArgs,
  type ExternalActivityDiscoveryReason,
  type ExternalActivityRouteDecision,
} from './external-activity-origin-routing.port';

export type { ExternalActivityRouteDecision } from './external-activity-origin-routing.port';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function listActivity(rawPayload: unknown): IntervalsActivity | null {
  const raw = record(rawPayload);
  const activity = record(raw.listActivity ?? raw.activity);
  if (Object.keys(activity).length > 0) return activity as IntervalsActivity;
  const original = record(raw.original);
  const nested = record(original.listActivity ?? original.activity ?? original);
  return Object.keys(nested).length > 0 ? (nested as IntervalsActivity) : null;
}

/**
 * Core discovery routing stays provider-neutral. Deployment-specific origin
 * fallback is optional and registered by the composition root.
 */
@Injectable()
export class ExternalActivitySourceRouter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importJobs: ImportingJobService,
  ) {}

  async routeIntervalsDiscovery(
    args: ExternalActivityDiscoveryArgs,
    tx?: PrismaTx,
  ): Promise<ExternalActivityRouteDecision> {
    const current = await this.importJobs.sourceObjects(tx).findUnique({
      where: { id: args.sourceObjectId },
      select: { resolvedActivityId: true },
    });
    if (current?.resolvedActivityId) {
      await this.importJobs.sourceObjects(tx).update({
        where: { id: args.sourceObjectId },
        data: { lastSeenAt: new Date() },
      });
      return {
        kind: 'ALREADY_RESOLVED',
        activityId: current.resolvedActivityId,
      };
    }

    const deploymentDecision =
      await getExternalActivityOriginRoutingExtension()?.route(
        tx ?? this.prisma,
        args,
      );
    if (deploymentDecision) return deploymentDecision;

    if (args.confirmedOriginUnavailable) {
      await this.importJobs.sourceObjects(tx).update({
        where: { id: args.sourceObjectId },
        data: {
          lastSeenAt: new Date(),
          originProvider: null,
          suggestedProvider: null,
          originSyncRequestId: null,
          resolutionStatus: ImportSourceResolutionStatus.BLOCKED,
          resolutionReason:
            ImportSourceResolutionReason.ORIGIN_CONNECTION_REQUIRED,
        },
      });
      return {
        kind: 'KEEP_BLOCKED_SOURCE',
        reason: ImportSourceResolutionReason.ORIGIN_CONNECTION_REQUIRED,
      };
    }

    await this.importJobs.sourceObjects(tx).update({
      where: { id: args.sourceObjectId },
      data: {
        lastSeenAt: new Date(),
        originProvider: null,
        suggestedProvider: null,
        originSyncRequestId: null,
        resolutionStatus: ImportSourceResolutionStatus.IMPORTABLE,
        resolutionReason: null,
      },
    });
    return { kind: 'IMPORT_VIA_DISCOVERY_PROVIDER' };
  }

  async retryMirror(userId: string, sourceObjectId: string) {
    return this.routePersistedIntervalsDiscovery({
      userId,
      sourceObjectId,
      reason: 'manual',
      forceRetry: true,
      confirmedOriginUnavailable: true,
    });
  }

  async routePersistedIntervalsDiscovery(
    args: {
      userId: string;
      sourceObjectId: string;
      reason: ExternalActivityDiscoveryReason;
      forceRetry?: boolean;
      confirmedOriginUnavailable?: boolean;
    },
    tx?: PrismaTx,
  ) {
    const source = await this.importJobs.sourceObjects(tx).findFirst({
      where: {
        id: args.sourceObjectId,
        userId: args.userId,
        resolvedActivityId: null,
      },
      select: {
        id: true,
        provider: true,
        rawPayload: true,
        originSyncRequest: {
          select: { windowStart: true, windowEnd: true },
        },
      },
    });
    if (!source) {
      throw new NotFoundException('EXTERNAL_ACTIVITY_MIRROR_NOT_FOUND');
    }
    const activity = listActivity(source.rawPayload);
    if (!activity) {
      throw new NotFoundException('EXTERNAL_ACTIVITY_DISCOVERY_MISSING');
    }
    return this.routeIntervalsDiscovery(
      {
        userId: args.userId,
        sourceObjectId: args.sourceObjectId,
        activity,
        reason: args.reason,
        discoveryWindow: source.originSyncRequest
          ? {
              start: source.originSyncRequest.windowStart,
              end: source.originSyncRequest.windowEnd,
            }
          : undefined,
        forceRetry: args.forceRetry,
        confirmedOriginUnavailable: args.confirmedOriginUnavailable,
        discoveryProvider: source.provider ?? undefined,
      },
      tx,
    );
  }

  /** Keep the existing source as a mirror without degrading a materialized activity. */
  async keepUnavailableSource(
    args: {
      userId: string;
      sourceObjectId: string;
      error: ImportSourceDataUnavailableError;
    },
    tx: PrismaTx,
  ) {
    const sources = this.importJobs.sourceObjects(tx);
    const source = await sources.findFirst({
      where: { id: args.sourceObjectId, userId: args.userId },
      select: {
        provider: true,
        metadata: true,
        resolvedActivityId: true,
        activitySources: {
          where: { isActive: true },
          select: { activityId: true },
          take: 1,
        },
      },
    });
    if (!source?.provider)
      throw new NotFoundException('IMPORT_SOURCE_NOT_FOUND');
    const activityId =
      source.resolvedActivityId ?? source.activitySources[0]?.activityId;
    await sources.update({
      where: { id: args.sourceObjectId },
      data: {
        lastSeenAt: new Date(),
        metadata: importJsonValue({
          ...record(source.metadata),
          dataAvailability: {
            code: args.error.code,
            stage: args.error.stage,
            status: args.error.status ?? null,
            checkedAt: new Date().toISOString(),
          },
        }),
        ...(activityId
          ? {
              resolvedActivityId: activityId,
              resolvedAt: new Date(),
              resolutionStatus: ImportSourceResolutionStatus.RESOLVED,
              resolutionReason: null,
            }
          : {
              originProvider: source.provider,
              suggestedProvider: source.provider,
              originSyncRequestId: null,
              resolutionStatus: ImportSourceResolutionStatus.BLOCKED,
              resolutionReason:
                ImportSourceResolutionReason.UPSTREAM_DATA_UNAVAILABLE,
            }),
      },
    });
  }
}

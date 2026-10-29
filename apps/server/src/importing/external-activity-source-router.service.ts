import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ImportSourceResolutionReason,
  ImportSourceResolutionStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
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
  const nested = record(original.listActivity ?? original.activity);
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
  ): Promise<ExternalActivityRouteDecision> {
    const current = await this.importJobs.sourceObjects().findUnique({
      where: { id: args.sourceObjectId },
      select: { resolvedActivityId: true },
    });
    if (current?.resolvedActivityId) {
      await this.importJobs.sourceObjects().update({
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
        this.prisma,
        args,
      );
    if (deploymentDecision) return deploymentDecision;

    if (args.confirmedOriginUnavailable) {
      await this.importJobs.sourceObjects().update({
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

    await this.importJobs.sourceObjects().update({
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

  async routePersistedIntervalsDiscovery(args: {
    userId: string;
    sourceObjectId: string;
    reason: ExternalActivityDiscoveryReason;
    forceRetry?: boolean;
    confirmedOriginUnavailable?: boolean;
  }) {
    const source = await this.importJobs.sourceObjects().findFirst({
      where: {
        id: args.sourceObjectId,
        userId: args.userId,
        resolvedActivityId: null,
      },
      select: {
        id: true,
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
    return this.routeIntervalsDiscovery({
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
    });
  }
}

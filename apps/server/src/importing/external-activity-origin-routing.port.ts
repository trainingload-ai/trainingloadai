import type {
  ImportSourceResolutionReason,
  ThirdPartyProvider,
} from '@prisma/client';
import type { PrismaService } from '@/prisma/prisma.service';
import type { IntervalsIcuActivityListItem as IntervalsActivity } from '@/integrations/intervals-icu/intervals-icu.client';

export type ExternalActivityDiscoveryReason =
  | 'initial'
  | 'manual'
  | 'scheduled'
  | 'webhook'
  | 'backfill'
  | 'fallback';

export type ExternalActivityRouteDecision =
  | { kind: 'IMPORT_VIA_DISCOVERY_PROVIDER' }
  | { kind: 'ROUTE_TO_ORIGIN'; provider: ThirdPartyProvider }
  | {
      kind: 'KEEP_BLOCKED_SOURCE';
      reason: ImportSourceResolutionReason;
    }
  | { kind: 'ALREADY_RESOLVED'; activityId: number };

export type ExternalActivityDiscoveryArgs = {
  userId: string;
  sourceObjectId: string;
  activity: IntervalsActivity;
  reason: ExternalActivityDiscoveryReason;
  discoveryWindow?: { start: Date; end: Date };
  forceRetry?: boolean;
  confirmedOriginUnavailable?: boolean;
};

export interface ExternalActivityOriginRoutingExtension {
  route(
    prisma: PrismaService,
    args: ExternalActivityDiscoveryArgs,
  ): Promise<ExternalActivityRouteDecision | null>;
  matchesUnavailableOriginError?(error: {
    discoveryProvider: string;
    status: number;
    message: string;
    body?: string | null;
  }): boolean;
}

let deploymentExtension: ExternalActivityOriginRoutingExtension | undefined;

export function registerExternalActivityOriginRoutingExtension(
  extension: ExternalActivityOriginRoutingExtension,
): () => void {
  if (deploymentExtension) {
    throw new Error('External activity origin routing already registered');
  }
  deploymentExtension = extension;
  return () => {
    if (deploymentExtension === extension) deploymentExtension = undefined;
  };
}

export function getExternalActivityOriginRoutingExtension():
  | ExternalActivityOriginRoutingExtension
  | undefined {
  return deploymentExtension;
}

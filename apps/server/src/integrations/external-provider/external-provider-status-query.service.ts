import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ThirdPartyProvider } from '@prisma/client';
import {
  type ThirdPartyCapabilities,
  type ThirdPartyCapabilityMode,
  type ThirdPartyConnectionState,
  type ThirdPartyProviderId,
  type ThirdPartySettings,
  type ThirdPartySyncState,
} from '@shared/third-party-integration';
import {
  THIRD_PARTY_CAPABILITIES,
  THIRD_PARTY_PROVIDER_IDS,
} from '@deployment/provider-catalog';
import { canonicalConnectionStatus } from './external-provider-contract';
import { ExternalProviderConnectionService } from './external-provider-connection.service';
import {
  EXTERNAL_PROVIDER_CAPABILITY_RESOLVER,
  type ExternalProviderCapabilityResolver,
} from './external-provider-capability-resolver.port';
import {
  EXTERNAL_PROVIDER_STATUS_EXTENSION,
  type ExternalProviderStatusExtension,
} from './external-provider-status-extension.port';

export type ThirdPartyOperationState =
  | 'UNSUPPORTED'
  | 'INTEGRATION_DISABLED'
  | 'NOT_CONNECTED'
  | 'MISSING_PERMISSION'
  | 'MANUAL_AVAILABLE'
  | 'MANUAL_REQUIRES_CONNECTION'
  | 'AUTOMATIC_DISABLED'
  | 'AUTOMATIC_ENABLED';

export type ThirdPartyOperationAvailability = {
  productMode: ThirdPartyCapabilityMode;
  effectiveMode: ThirdPartyCapabilityMode;
  requiresConnection: boolean;
  state: ThirdPartyOperationState;
};

export type ExternalProviderStatusSnapshot = {
  provider: ThirdPartyProviderId;
  enabled: boolean;
  connected: boolean;
  connectionState: ThirdPartyConnectionState;
  productCapabilities: ThirdPartyCapabilities;
  effectiveCapabilities: ThirdPartyCapabilities;
  settings: ThirdPartySettings;
  operations: {
    completedActivities: {
      import: ThirdPartyOperationAvailability;
      export: ThirdPartyOperationAvailability;
    };
    plannedWorkouts: {
      import: ThirdPartyOperationAvailability;
      export: ThirdPartyOperationAvailability;
    };
    wellness: {
      import: ThirdPartyOperationAvailability;
      export: ThirdPartyOperationAvailability;
    };
    athleteProfile: {
      import: ThirdPartyOperationAvailability;
      export: ThirdPartyOperationAvailability;
    };
  };
  sync: ThirdPartySyncState;
};

function operationAvailability(args: {
  productMode: ThirdPartyCapabilityMode;
  effectiveMode: ThirdPartyCapabilityMode;
  enabled: boolean;
  connected: boolean;
  automaticSetting: boolean;
  requiresConnection: boolean;
}): ThirdPartyOperationAvailability {
  const { productMode, effectiveMode } = args;
  let state: ThirdPartyOperationState;
  if (productMode === 'UNSUPPORTED') state = 'UNSUPPORTED';
  else if (!args.enabled) state = 'INTEGRATION_DISABLED';
  else if (productMode === 'MANUAL' && !args.requiresConnection)
    state = 'MANUAL_AVAILABLE';
  else if (productMode === 'MANUAL' && !args.connected)
    state = 'MANUAL_REQUIRES_CONNECTION';
  else if (!args.connected) state = 'NOT_CONNECTED';
  else if (effectiveMode === 'UNSUPPORTED') state = 'MISSING_PERMISSION';
  else if (effectiveMode === 'MANUAL') state = 'MANUAL_AVAILABLE';
  else if (args.automaticSetting) state = 'AUTOMATIC_ENABLED';
  else state = 'AUTOMATIC_DISABLED';
  return {
    productMode,
    effectiveMode,
    requiresConnection: args.requiresConnection,
    state,
  };
}

function operationRequiresConnection(
  provider: ThirdPartyProviderId,
  group: keyof ThirdPartyCapabilities,
  direction: 'import' | 'export',
  extension?: ExternalProviderStatusExtension,
) {
  return (
    extension?.operationRequiresConnection({ provider, group, direction }) ??
    true
  );
}

function operationsSnapshot(args: {
  provider: ThirdPartyProviderId;
  product: ThirdPartyCapabilities;
  effective: ThirdPartyCapabilities;
  enabled: boolean;
  connected: boolean;
  settings: ThirdPartySettings;
  extension?: ExternalProviderStatusExtension;
}): ExternalProviderStatusSnapshot['operations'] {
  const operation = (
    group: keyof ThirdPartyCapabilities,
    direction: 'import' | 'export',
    automaticSetting: boolean,
  ) =>
    operationAvailability({
      productMode: args.product[group][direction],
      effectiveMode: args.effective[group][direction],
      enabled: args.enabled,
      connected: args.connected,
      automaticSetting,
      requiresConnection: operationRequiresConnection(
        args.provider,
        group,
        direction,
        args.extension,
      ),
    });

  return {
    completedActivities: {
      import: operation(
        'completedActivities',
        'import',
        args.settings.importActivitiesAutomatically,
      ),
      export: operation(
        'completedActivities',
        'export',
        args.settings.exportActivitiesAutomatically,
      ),
    },
    plannedWorkouts: {
      import: operation(
        'plannedWorkouts',
        'import',
        args.settings.importPlannedWorkouts,
      ),
      export: operation(
        'plannedWorkouts',
        'export',
        args.settings.exportPlannedWorkouts,
      ),
    },
    wellness: {
      import: operation('wellness', 'import', args.settings.importWellness),
      export: operation('wellness', 'export', args.settings.exportWellness),
    },
    athleteProfile: {
      import: operation(
        'athleteProfile',
        'import',
        args.settings.importAthleteProfile,
      ),
      export: operation(
        'athleteProfile',
        'export',
        args.settings.exportAthleteProfile,
      ),
    },
  };
}

@Injectable()
export class ExternalProviderStatusQueryService {
  constructor(
    private readonly connections: ExternalProviderConnectionService,
    @Optional()
    @Inject(EXTERNAL_PROVIDER_CAPABILITY_RESOLVER)
    private readonly capabilityResolver?: ExternalProviderCapabilityResolver,
    @Optional()
    @Inject(EXTERNAL_PROVIDER_STATUS_EXTENSION)
    private readonly statusExtension?: ExternalProviderStatusExtension,
  ) {}

  async listForUser(
    userId: string,
    provider?: ThirdPartyProviderId,
  ): Promise<ExternalProviderStatusSnapshot[]> {
    if (
      provider &&
      !(THIRD_PARTY_PROVIDER_IDS as readonly string[]).includes(provider)
    ) {
      return [];
    }
    const providers: ThirdPartyProvider[] = provider
      ? [provider as ThirdPartyProvider]
      : [...THIRD_PARTY_PROVIDER_IDS] as ThirdPartyProvider[];
    const [connectionRows, connectionOverrides] = await Promise.all([
      this.connections.model().findMany({
        where: { userId, provider: { in: providers } },
      }),
      this.statusExtension?.loadConnectionOverrides(userId, providers) ??
        Promise.resolve(new Map()),
    ]);

    const connectionByProvider = new Map(
      connectionRows.map((connection) => [connection.provider, connection]),
    );
    return providers.map((providerId) => {
      const connection = connectionByProvider.get(providerId) ?? null;
      const connectionOverride = connectionOverrides.get(providerId);
      const productCapabilities = THIRD_PARTY_CAPABILITIES[providerId];
      const effectiveCapabilities =
        this.capabilityResolver?.resolve({
          provider: providerId,
          connection,
          productCapabilities,
        }) ?? productCapabilities;
      const enabled =
        this.statusExtension?.isProviderEnabled(providerId) ?? true;
      const canonical = canonicalConnectionStatus(providerId, connection, {
        enabled,
        ...(connectionOverride?.connected !== undefined
          ? { connected: connectionOverride.connected }
          : {}),
        externalAccountId:
          connection?.externalAthleteId ??
          connectionOverride?.externalAccountId ??
          null,
        capabilities: effectiveCapabilities,
      });
      const connected = canonical.connected && canonical.state === 'ACTIVE';
      const connectionState =
        connected || canonical.state !== 'ACTIVE'
          ? canonical.state
          : 'NOT_CONNECTED';

      return {
        provider: providerId,
        enabled,
        connected,
        connectionState,
        productCapabilities,
        effectiveCapabilities,
        settings: canonical.settings,
        operations: operationsSnapshot({
          provider: providerId,
          product: productCapabilities,
          effective: effectiveCapabilities,
          enabled,
          connected,
          settings: canonical.settings,
          extension: this.statusExtension,
        }),
        sync: canonical.sync,
      };
    });
  }
}

import type {
  ThirdPartyCapabilities,
  ThirdPartyConnectionState,
  ThirdPartyConnectionStatus,
  ThirdPartyProviderId,
  ThirdPartySettings,
  ThirdPartySettingsPatch,
} from '@shared/third-party-integration';
import {
  constrainThirdPartySettings,
  defaultThirdPartySettings,
} from '@shared/third-party-integration';
import {
  THIRD_PARTY_CAPABILITIES,
  UNSUPPORTED_THIRD_PARTY_CAPABILITIES,
} from '@deployment/provider-catalog';

type JsonObject = Record<string, unknown>;

/**
 * 对外只暴露稳定错误码；具体异常仅保留在服务端日志和数据库中。
 * 连接状态接口会被 Web 与移动端直接展示，不能返回 ORM、SQL 或厂商响应原文。
 */
export const THIRD_PARTY_SYNC_FAILED = 'THIRD_PARTY_SYNC_FAILED';

export function publicThirdPartySyncError(error: unknown): string | null {
  return typeof error === 'string' && error.trim()
    ? THIRD_PARTY_SYNC_FAILED
    : null;
}

export type ExternalProviderConnectionContractSource = {
  status?: string | null;
  externalAthleteId?: string | null;
  syncScheduledActivities?: boolean | null;
  syncWellness?: boolean | null;
  exportActivities?: boolean | null;
  exportWellness?: boolean | null;
  syncSportSettings?: boolean | null;
  exportSportSettings?: boolean | null;
  lastSyncStartedAt?: Date | string | null;
  lastSyncCompletedAt?: Date | string | null;
  lastSyncedActivityAt?: Date | string | null;
  lastError?: string | null;
  metadata?: unknown;
} | null;

export type CanonicalStatusOptions = {
  enabled?: boolean;
  connected?: boolean;
  externalAccountId?: string | null;
  capabilities?: ThirdPartyCapabilities;
  settings?: Partial<ThirdPartySettings>;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function connectionState(
  connection: ExternalProviderConnectionContractSource,
  connectedOverride?: boolean,
): ThirdPartyConnectionState {
  if (connectedOverride === false && !connection) return 'NOT_CONNECTED';
  switch (connection?.status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'INVALID':
      return 'INVALID';
    case 'REVOKED':
    case 'DISCONNECTED':
      return 'REVOKED';
    default:
      return connectedOverride ? 'ACTIVE' : 'NOT_CONNECTED';
  }
}

function planSettings(metadataValue: unknown) {
  const metadata = asObject(metadataValue);
  const canonical = asObject(asObject(metadata.integration).settings);
  const planSync = asObject(metadata.planSync);
  return {
    importPlannedWorkouts: bool(
      canonical.importPlannedWorkouts,
      bool(planSync.syncPlannedWorkouts, false),
    ),
    exportPlannedWorkouts: bool(
      canonical.exportPlannedWorkouts,
      bool(planSync.exportPlannedWorkouts, false),
    ),
  };
}

/** Translate the legacy physical columns into the canonical product settings. */
export function canonicalSettingsFromConnection(
  provider: ThirdPartyProviderId,
  connection: ExternalProviderConnectionContractSource,
  overrides: Partial<ThirdPartySettings> = {},
  capabilities =
    THIRD_PARTY_CAPABILITIES[provider] ??
    UNSUPPORTED_THIRD_PARTY_CAPABILITIES,
): ThirdPartySettings {
  const defaults = defaultThirdPartySettings(capabilities);
  const plan = planSettings(connection?.metadata);
  const metadata = asObject(connection?.metadata);
  const canonical = asObject(asObject(metadata.integration).settings);
  const settings: ThirdPartySettings = {
    importActivitiesAutomatically: bool(
      canonical.importActivitiesAutomatically,
      bool(
        connection?.syncScheduledActivities,
        defaults.importActivitiesAutomatically,
      ),
    ),
    exportActivitiesAutomatically: bool(
      canonical.exportActivitiesAutomatically,
      bool(
        connection?.exportActivities,
        defaults.exportActivitiesAutomatically,
      ),
    ),
    importPlannedWorkouts: plan.importPlannedWorkouts,
    exportPlannedWorkouts: plan.exportPlannedWorkouts,
    importWellness: bool(
      canonical.importWellness,
      bool(connection?.syncWellness, defaults.importWellness),
    ),
    exportWellness: bool(
      canonical.exportWellness,
      bool(connection?.exportWellness, defaults.exportWellness),
    ),
    importAthleteProfile: bool(
      canonical.importAthleteProfile,
      bool(connection?.syncSportSettings, defaults.importAthleteProfile),
    ),
    exportAthleteProfile: bool(
      canonical.exportAthleteProfile,
      bool(connection?.exportSportSettings, defaults.exportAthleteProfile),
    ),
    ...overrides,
  };
  return constrainThirdPartySettings(settings, capabilities);
}

/** Add one stable status/settings shape to any provider-specific response. */
export function canonicalConnectionStatus(
  provider: ThirdPartyProviderId,
  connection: ExternalProviderConnectionContractSource,
  options: CanonicalStatusOptions = {},
): ThirdPartyConnectionStatus {
  const state = connectionState(connection, options.connected);
  const capabilities =
    options.capabilities ??
    THIRD_PARTY_CAPABILITIES[provider] ??
    UNSUPPORTED_THIRD_PARTY_CAPABILITIES;
  return {
    provider,
    enabled: options.enabled ?? true,
    connected: options.connected ?? state === 'ACTIVE',
    state,
    externalAccountId:
      options.externalAccountId ?? connection?.externalAthleteId ?? null,
    capabilities,
    settings: canonicalSettingsFromConnection(
      provider,
      connection,
      options.settings,
      capabilities,
    ),
    sync: {
      startedAt: connection?.lastSyncStartedAt ?? null,
      completedAt: connection?.lastSyncCompletedAt ?? null,
      latestActivityAt: connection?.lastSyncedActivityAt ?? null,
      lastError: publicThirdPartySyncError(connection?.lastError),
    },
  };
}

/**
 * Persist canonical settings in metadata while mirroring the legacy columns
 * until the physical schema migration can remove those columns.
 */
export function canonicalSettingsUpdateData(args: {
  provider: ThirdPartyProviderId;
  connection: ExternalProviderConnectionContractSource;
  patch: ThirdPartySettingsPatch;
  capabilities?: ThirdPartyCapabilities;
}) {
  const capabilities =
    args.capabilities ??
    THIRD_PARTY_CAPABILITIES[args.provider] ??
    UNSUPPORTED_THIRD_PARTY_CAPABILITIES;
  const current = canonicalSettingsFromConnection(
    args.provider,
    args.connection,
    {},
    capabilities,
  );
  const definedPatch = Object.fromEntries(
    Object.entries(args.patch).filter(
      ([, value]) => typeof value === 'boolean',
    ),
  ) as ThirdPartySettingsPatch;
  const settings = constrainThirdPartySettings(
    { ...current, ...definedPatch },
    capabilities,
  );
  const metadata = asObject(args.connection?.metadata);
  const integration = asObject(metadata.integration);
  const planSync = asObject(metadata.planSync);

  return {
    settings,
    data: {
      syncScheduledActivities: settings.importActivitiesAutomatically,
      exportActivities: settings.exportActivitiesAutomatically,
      syncWellness: settings.importWellness,
      exportWellness: settings.exportWellness,
      syncSportSettings: settings.importAthleteProfile,
      exportSportSettings: settings.exportAthleteProfile,
      metadata: {
        ...metadata,
        integration: {
          ...integration,
          schemaVersion: 1,
          settings,
        },
        planSync: {
          ...planSync,
          syncPlannedWorkouts: settings.importPlannedWorkouts,
          exportPlannedWorkouts: settings.exportPlannedWorkouts,
        },
      },
    },
  };
}

/** Compatibility adapter for old clients while they migrate to settings.*. */
export function legacySettingsPatch(
  value: Record<string, unknown>,
): ThirdPartySettingsPatch {
  const pick = (canonical: keyof ThirdPartySettings, legacy: string) => {
    const raw = value[canonical] ?? value[legacy];
    return typeof raw === 'boolean' ? raw : undefined;
  };
  return {
    importActivitiesAutomatically: pick(
      'importActivitiesAutomatically',
      'syncScheduledActivities',
    ),
    exportActivitiesAutomatically: pick(
      'exportActivitiesAutomatically',
      'exportActivities',
    ),
    importPlannedWorkouts: pick('importPlannedWorkouts', 'syncPlannedWorkouts'),
    exportPlannedWorkouts: pick(
      'exportPlannedWorkouts',
      'exportPlannedWorkouts',
    ),
    importWellness: pick('importWellness', 'syncWellness'),
    exportWellness: pick('exportWellness', 'exportWellness'),
    importAthleteProfile: pick('importAthleteProfile', 'syncSportSettings'),
    exportAthleteProfile: pick('exportAthleteProfile', 'exportSportSettings'),
  };
}

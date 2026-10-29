import type {
  ThirdPartyCapabilities,
  ThirdPartyConnectionStatus,
  ThirdPartyProviderId,
  ThirdPartySettings,
  ThirdPartySettingsPatch,
} from "@shared/third-party-integration";
import {
  defaultThirdPartySettings,
} from "@shared/third-party-integration";
import { THIRD_PARTY_CAPABILITIES } from "@deployment/provider-catalog";

const UNSUPPORTED_CAPABILITIES: ThirdPartyCapabilities = {
  completedActivities: { import: "UNSUPPORTED", export: "UNSUPPORTED" },
  plannedWorkouts: { import: "UNSUPPORTED", export: "UNSUPPORTED" },
  wellness: { import: "UNSUPPORTED", export: "UNSUPPORTED" },
  athleteProfile: { import: "UNSUPPORTED", export: "UNSUPPORTED" },
};

/**
 * During the API transition every provider still returns legacy top-level
 * fields as well as the canonical nested contract.
 */
export type ThirdPartyConnectionEnvelope =
  Partial<ThirdPartyConnectionStatus> & {
    connected: boolean;
    status?: string | null;
    externalAthleteId?: string | null;
    lastSyncStartedAt?: string | null;
    lastSyncCompletedAt?: string | null;
    lastSyncedActivityAt?: string | null;
    lastError?: string | null;
    syncScheduledActivities?: boolean;
    syncWellness?: boolean;
    exportActivities?: boolean;
    exportWellness?: boolean;
    syncSportSettings?: boolean;
    exportSportSettings?: boolean;
    syncPlannedWorkouts?: boolean;
    exportPlannedWorkouts?: boolean;
  };

export function thirdPartySettingsFromStatus(
  provider: ThirdPartyProviderId,
  status: ThirdPartyConnectionEnvelope,
): ThirdPartySettings {
  const defaults = defaultThirdPartySettings(
    thirdPartyCapabilitiesFromStatus(provider, status),
  );
  return {
    importActivitiesAutomatically:
      status.settings?.importActivitiesAutomatically ??
      status.syncScheduledActivities ??
      defaults.importActivitiesAutomatically,
    exportActivitiesAutomatically:
      status.settings?.exportActivitiesAutomatically ??
      status.exportActivities ??
      defaults.exportActivitiesAutomatically,
    importPlannedWorkouts:
      status.settings?.importPlannedWorkouts ??
      status.syncPlannedWorkouts ??
      defaults.importPlannedWorkouts,
    exportPlannedWorkouts:
      status.settings?.exportPlannedWorkouts ??
      status.exportPlannedWorkouts ??
      defaults.exportPlannedWorkouts,
    importWellness:
      status.settings?.importWellness ??
      status.syncWellness ??
      defaults.importWellness,
    exportWellness:
      status.settings?.exportWellness ??
      status.exportWellness ??
      defaults.exportWellness,
    importAthleteProfile:
      status.settings?.importAthleteProfile ??
      status.syncSportSettings ??
      defaults.importAthleteProfile,
    exportAthleteProfile:
      status.settings?.exportAthleteProfile ??
      status.exportSportSettings ??
      defaults.exportAthleteProfile,
  };
}

export function thirdPartyCapabilitiesFromStatus(
  provider: ThirdPartyProviderId,
  status: ThirdPartyConnectionEnvelope,
): ThirdPartyCapabilities {
  return (
    status.capabilities ??
    THIRD_PARTY_CAPABILITIES[provider] ??
    UNSUPPORTED_CAPABILITIES
  );
}

/** The only legacy-field mapping allowed in the web client. */
export function legacyThirdPartySettingsPayload(
  patch: ThirdPartySettingsPatch,
) {
  return {
    ...(patch.importActivitiesAutomatically == null
      ? {}
      : {
          syncScheduledActivities: patch.importActivitiesAutomatically,
        }),
    ...(patch.exportActivitiesAutomatically == null
      ? {}
      : { exportActivities: patch.exportActivitiesAutomatically }),
    ...(patch.importPlannedWorkouts == null
      ? {}
      : { syncPlannedWorkouts: patch.importPlannedWorkouts }),
    ...(patch.exportPlannedWorkouts == null
      ? {}
      : { exportPlannedWorkouts: patch.exportPlannedWorkouts }),
    ...(patch.importWellness == null
      ? {}
      : { syncWellness: patch.importWellness }),
    ...(patch.exportWellness == null
      ? {}
      : { exportWellness: patch.exportWellness }),
    ...(patch.importAthleteProfile == null
      ? {}
      : { syncSportSettings: patch.importAthleteProfile }),
    ...(patch.exportAthleteProfile == null
      ? {}
      : { exportSportSettings: patch.exportAthleteProfile }),
  };
}

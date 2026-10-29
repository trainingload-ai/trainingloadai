/**
 * Canonical third-party integration contract shared by the API, web client,
 * and native app.
 *
 * Directions are always relative to Trainingload.ai:
 * - import: provider -> Trainingload.ai
 * - export: Trainingload.ai -> provider
 *
 * A historical import is an action, not a persistent setting.
 */

/**
 * Provider identifiers belong to the deployment composition.  The public
 * contract deliberately treats them as opaque strings so this package does
 * not disclose Managed-only integrations.
 */
export type ThirdPartyProviderId = string;

export type ThirdPartyConnectionState =
  | "NOT_CONNECTED"
  | "ACTIVE"
  | "INVALID"
  | "REVOKED";

export type ThirdPartyCapabilityMode = "UNSUPPORTED" | "MANUAL" | "AUTOMATIC";

export type ThirdPartyDirectionalCapability = {
  import: ThirdPartyCapabilityMode;
  export: ThirdPartyCapabilityMode;
};

export type ThirdPartyCapabilities = {
  completedActivities: ThirdPartyDirectionalCapability;
  plannedWorkouts: ThirdPartyDirectionalCapability;
  wellness: ThirdPartyDirectionalCapability;
  athleteProfile: ThirdPartyDirectionalCapability;
};

export type ThirdPartySettings = {
  importActivitiesAutomatically: boolean;
  exportActivitiesAutomatically: boolean;
  importPlannedWorkouts: boolean;
  exportPlannedWorkouts: boolean;
  importWellness: boolean;
  exportWellness: boolean;
  importAthleteProfile: boolean;
  exportAthleteProfile: boolean;
};

export type ThirdPartySyncState = {
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  latestActivityAt: string | Date | null;
  lastError: string | null;
};

export type ThirdPartyConnectionStatus = {
  provider: ThirdPartyProviderId;
  enabled: boolean;
  connected: boolean;
  state: ThirdPartyConnectionState;
  externalAccountId: string | null;
  capabilities: ThirdPartyCapabilities;
  settings: ThirdPartySettings;
  sync: ThirdPartySyncState;
};

export type ThirdPartySettingsPatch = Partial<ThirdPartySettings>;

export type ThirdPartyOperationItemStatus =
  | "SUCCEEDED"
  | "QUEUED"
  | "SKIPPED"
  | "FAILED";

export type ThirdPartyOperationItem = {
  localId?: string | number;
  externalId?: string;
  status: ThirdPartyOperationItemStatus;
  reason?: string;
};

export type ThirdPartyOperationResult = {
  provider: ThirdPartyProviderId;
  operation:
    | "IMPORT_ACTIVITIES"
    | "EXPORT_ACTIVITIES"
    | "IMPORT_PLANNED_WORKOUTS"
    | "EXPORT_PLANNED_WORKOUTS"
    | "IMPORT_WELLNESS"
    | "IMPORT_ATHLETE_PROFILE"
    | "EXPORT_ATHLETE_PROFILE";
  status: ThirdPartyOperationItemStatus;
  queuedCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  items?: ThirdPartyOperationItem[];
};

export const NO_THIRD_PARTY_DIRECTION: ThirdPartyDirectionalCapability = {
  import: "UNSUPPORTED",
  export: "UNSUPPORTED",
};

export function thirdPartyDirections(
  importMode: ThirdPartyCapabilityMode,
  exportMode: ThirdPartyCapabilityMode,
): ThirdPartyDirectionalCapability {
  return { import: importMode, export: exportMode };
}

export const DEFAULT_THIRD_PARTY_SETTINGS: ThirdPartySettings = {
  importActivitiesAutomatically: false,
  exportActivitiesAutomatically: false,
  importPlannedWorkouts: false,
  exportPlannedWorkouts: false,
  importWellness: false,
  exportWellness: false,
  importAthleteProfile: false,
  exportAthleteProfile: false,
};

export function defaultThirdPartySettings(
  capabilities: ThirdPartyCapabilities,
): ThirdPartySettings {
  return {
    ...DEFAULT_THIRD_PARTY_SETTINGS,
    importActivitiesAutomatically:
      capabilities.completedActivities.import === "AUTOMATIC",
  };
}

export function capabilitySupportsAutomaticSetting(
  capabilities: ThirdPartyCapabilities,
  key: keyof ThirdPartySettings,
) {
  switch (key) {
    case "importActivitiesAutomatically":
      return capabilities.completedActivities.import === "AUTOMATIC";
    case "exportActivitiesAutomatically":
      return capabilities.completedActivities.export === "AUTOMATIC";
    case "importPlannedWorkouts":
      return capabilities.plannedWorkouts.import === "AUTOMATIC";
    case "exportPlannedWorkouts":
      return capabilities.plannedWorkouts.export === "AUTOMATIC";
    case "importWellness":
      return capabilities.wellness.import === "AUTOMATIC";
    case "exportWellness":
      return capabilities.wellness.export === "AUTOMATIC";
    case "importAthleteProfile":
      return capabilities.athleteProfile.import === "AUTOMATIC";
    case "exportAthleteProfile":
      return capabilities.athleteProfile.export === "AUTOMATIC";
  }
}

export function constrainThirdPartySettings(
  settings: ThirdPartySettings,
  capabilities: ThirdPartyCapabilities,
): ThirdPartySettings {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      capabilitySupportsAutomaticSetting(
        capabilities,
        key as keyof ThirdPartySettings,
      )
        ? Boolean(value)
        : false,
    ]),
  ) as ThirdPartySettings;
}

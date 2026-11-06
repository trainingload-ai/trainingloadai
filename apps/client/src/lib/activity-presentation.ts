import type { SportDefinition } from "@/api/sports";
import { resolveSportDefinition } from "@/api/sports";

export type ActivitySportIdentity = {
  sportType?: string | null;
  subSportType?: string | null;
  sportDefinitionCode?: string | null;
};

export function isGenericActivityClassification(
  activity: ActivitySportIdentity | null | undefined,
) {
  if (!activity) return false;
  const code = String(
    activity.subSportType ?? activity.sportDefinitionCode ?? "",
  ).toUpperCase();
  return (
    code === "OTHER" ||
    code === "GENERIC" ||
    (!code && activity.sportType === "UNKNOWN")
  );
}

export function activitySupportsDistance(
  catalog: SportDefinition[],
  activity: ActivitySportIdentity,
) {
  const definition = resolveSportDefinition(catalog, activity);
  if (definition) return definition.supportsDistance;
  return ["RUN", "CYCLING", "SWIM"].includes(
    String(activity.sportType ?? "").toUpperCase(),
  );
}

/** OTHER-family sports still display measurements explicitly supported by their catalog entry. */
export function getOtherActivitySummaryCapabilities(
  catalog: SportDefinition[],
  activity: ActivitySportIdentity & {
    distance?: number | null;
    averageSpeed?: number | null;
  },
) {
  const definition = resolveSportDefinition(catalog, activity);
  return {
    showDistance:
      definition?.supportsDistance === true &&
      typeof activity.distance === "number" &&
      Number.isFinite(activity.distance) &&
      activity.distance > 0,
    showSpeed:
      definition?.supportsSpeed === true &&
      typeof activity.averageSpeed === "number" &&
      Number.isFinite(activity.averageSpeed) &&
      activity.averageSpeed > 0,
  };
}

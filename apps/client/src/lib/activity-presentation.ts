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

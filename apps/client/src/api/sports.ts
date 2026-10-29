import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PlanSportType } from "@/api/plans";
import type { WorkoutStructureKind } from "@shared/workout-structure";

export type SportDefinition = {
  code: string;
  family: PlanSportType;
  displayName: string;
  description?: string | null;
  zoneFamily?: PlanSportType | null;
  paceBasisMeters?: number | null;
  cadenceUnit?: "SPM" | "RPM" | null;
  isDefaultForFamily: boolean;
  supportsPlanning: boolean;
  supportsStructuredWorkout: boolean;
  defaultWorkoutStructureKind?: WorkoutStructureKind | null;
  supportsDistance: boolean;
  supportsPace: boolean;
  supportsSpeed: boolean;
  supportsPower: boolean;
  supportsCadence: boolean;
  sortOrder: number;
};

export const MANUAL_WORKOUT_SPORT_DEFINITION_CODES = [
  "ROAD_RUNNING",
  "TRAIL_RUNNING",
  "TREADMILL_RUNNING",
  "ROAD_CYCLING",
  "MOUNTAIN_BIKING",
  "INDOOR_CYCLING",
  "POOL_SWIMMING",
  "OPEN_WATER_SWIMMING",
  "STRENGTH_TRAINING",
] as const;

const MANUAL_WORKOUT_SPORT_FALLBACKS: Record<
  (typeof MANUAL_WORKOUT_SPORT_DEFINITION_CODES)[number],
  SportDefinition
> = {
  ROAD_RUNNING: createFallbackSport("ROAD_RUNNING", "RUN", 10),
  TRAIL_RUNNING: createFallbackSport("TRAIL_RUNNING", "RUN", 20),
  TREADMILL_RUNNING: createFallbackSport("TREADMILL_RUNNING", "RUN", 30),
  ROAD_CYCLING: createFallbackSport("ROAD_CYCLING", "CYCLING", 40),
  MOUNTAIN_BIKING: createFallbackSport("MOUNTAIN_BIKING", "CYCLING", 50),
  INDOOR_CYCLING: createFallbackSport("INDOOR_CYCLING", "CYCLING", 60),
  POOL_SWIMMING: createFallbackSport("POOL_SWIMMING", "SWIM", 70),
  OPEN_WATER_SWIMMING: createFallbackSport("OPEN_WATER_SWIMMING", "SWIM", 80),
  STRENGTH_TRAINING: createFallbackSport(
    "STRENGTH_TRAINING",
    "UNKNOWN",
    90,
    "STRENGTH",
  ),
};

function createFallbackSport(
  code: string,
  family: PlanSportType,
  sortOrder: number,
  structureKind: WorkoutStructureKind = "ENDURANCE",
): SportDefinition {
  return {
    code,
    family,
    displayName: code,
    description: null,
    zoneFamily: structureKind === "ENDURANCE" ? family : null,
    paceBasisMeters: null,
    cadenceUnit: null,
    isDefaultForFamily: false,
    supportsPlanning: true,
    supportsStructuredWorkout: true,
    defaultWorkoutStructureKind: structureKind,
    supportsDistance: structureKind === "ENDURANCE",
    supportsPace: structureKind === "ENDURANCE" && family !== "CYCLING",
    supportsSpeed: structureKind === "ENDURANCE",
    supportsPower: structureKind === "ENDURANCE" && family === "CYCLING",
    supportsCadence: structureKind === "ENDURANCE",
    sortOrder,
  };
}

/** The deliberately small sport list exposed by the manual workout editor. */
export function getManualWorkoutSportCatalog(catalog: SportDefinition[]) {
  const byCode = new Map(catalog.map((sport) => [sport.code, sport]));
  return MANUAL_WORKOUT_SPORT_DEFINITION_CODES.map(
    (code) => byCode.get(code) ?? MANUAL_WORKOUT_SPORT_FALLBACKS[code],
  );
}

const LOCALIZED_SPORT_DEFINITION_CODES = new Set([
  "ROAD_RUNNING",
  "TRAIL_RUNNING",
  "TREADMILL_RUNNING",
  "ROAD_CYCLING",
  "MOUNTAIN_BIKING",
  "GRAVEL_CYCLING",
  "INDOOR_CYCLING",
  "E_BIKING",
  "POOL_SWIMMING",
  "OPEN_WATER_SWIMMING",
  "STRETCHING",
  "WALKING",
  "HIKING",
  "STRENGTH_TRAINING",
  "HIIT",
  "YOGA",
  "ROWING",
  "ELLIPTICAL",
  "OTHER",
]);

type SportCatalogTranslator = (key: string) => string;

export function getLocalizedSportFamilyName(
  family: PlanSportType,
  t: SportCatalogTranslator,
) {
  return t(`families.${family}`);
}

export function getLocalizedSportDefinitionName(
  sport: Pick<SportDefinition, "code" | "displayName">,
  t: SportCatalogTranslator,
) {
  return LOCALIZED_SPORT_DEFINITION_CODES.has(sport.code)
    ? t(`sports.${sport.code}`)
    : sport.displayName;
}

export function getLocalizedSportDefinitionCodeName(
  code: string | null | undefined,
  fallbackFamily: PlanSportType,
  t: SportCatalogTranslator,
) {
  return code && LOCALIZED_SPORT_DEFINITION_CODES.has(code)
    ? t(`sports.${code}`)
    : getLocalizedSportFamilyName(fallbackFamily, t);
}

/**
 * STRENGTH_TRAINING shipped together with the Strength DSL/editor. Keep the
 * client compatible with a catalog response cached before that migration.
 */
export function getPlanningWorkoutStructureKind(
  sport: Pick<SportDefinition, "code" | "defaultWorkoutStructureKind">,
): WorkoutStructureKind {
  if (sport.code === "STRENGTH_TRAINING") return "STRENGTH";
  return sport.defaultWorkoutStructureKind ?? "ENDURANCE";
}

export function canCreateStructuredWorkout(
  sport: Pick<SportDefinition, "code" | "supportsStructuredWorkout">,
) {
  return sport.supportsStructuredWorkout || sport.code === "STRENGTH_TRAINING";
}

export function getSportDisplayName(
  catalog: SportDefinition[],
  value: {
    sportType?: string | null;
    subSportType?: string | null;
    sportDefinitionCode?: string | null;
  },
  t: SportCatalogTranslator,
) {
  const code = value.subSportType ?? value.sportDefinitionCode;
  const definition = code
    ? catalog.find((sport) => sport.code === code)
    : catalog.find(
        (sport) => sport.family === value.sportType && sport.isDefaultForFamily,
      );
  if (definition) {
    return getLocalizedSportDefinitionName(definition, t);
  }
  if (code) {
    const displayName = code
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return getLocalizedSportDefinitionName({ code, displayName }, t);
  }
  const family = value.sportType as PlanSportType | null | undefined;
  return family && ["RUN", "CYCLING", "SWIM", "STRETCHING"].includes(family)
    ? getLocalizedSportFamilyName(family, t)
    : getLocalizedSportFamilyName("UNKNOWN", t);
}

export function useSportCatalog(planning = false) {
  return useQuery<SportDefinition[]>({
    queryKey: ["sports", "catalog", planning ? "planning" : "all"],
    queryFn: async () =>
      (await apiFetch<SportDefinition[]>(
        `/sports/catalog${planning ? "?planning=true" : ""}`,
      )) ?? [],
    staleTime: 30 * 60 * 1000,
  });
}

export function usePlanningSportCatalog() {
  return useSportCatalog(true);
}

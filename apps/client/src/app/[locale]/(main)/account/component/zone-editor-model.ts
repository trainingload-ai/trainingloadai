import { SportType } from "@/api/activities";
import type { ZoneSetting, UserProfile } from "@/api/settings";
import { BenchmarkType } from "./zoneSettings";

export const DEFAULT_ZONE_COLORS = [
  "#94a3b8",
  "#10b981",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#000000",
];

export function createDefaultZones() {
  return [
    { name: "Z1", min: 0, max: 55, id: "1" },
    { name: "Z2", min: 55, max: 75, id: "2" },
    { name: "Z3", min: 75, max: 90, id: "3" },
    { name: "Z4", min: 90, max: 105, id: "4" },
    { name: "Z5", min: 105, max: 120, id: "5" },
  ];
}

export function mapLoadedZones(zones: ZoneSetting[] | undefined) {
  if (!Array.isArray(zones)) {
    return createDefaultZones();
  }

  return zones.map((zone, index) => ({
    ...zone,
    id: index.toString(),
  }));
}

export function findValidBenchmark(args: {
  benchmarks: Array<{
    value: BenchmarkType;
    isDisabled?: (profile?: UserProfile) => boolean;
  }>;
  desired: BenchmarkType | undefined;
  profile: UserProfile | undefined;
}) {
  const candidate = args.benchmarks.find((b) => b.value === args.desired);
  if (
    candidate &&
    (!candidate.isDisabled || !candidate.isDisabled(args.profile))
  ) {
    return args.desired ?? BenchmarkType.CUSTOM;
  }

  const firstValid = args.benchmarks.find(
    (b) => !b.isDisabled || !b.isDisabled(args.profile),
  );

  return firstValid?.value || BenchmarkType.CUSTOM;
}

export function isZoneListDirty(
  zones: Array<{ name: string; min: number; max: number; id?: string }>,
  originalZones: string,
) {
  return JSON.stringify(zones) !== originalZones;
}

export function getZoneUnit(args: {
  isCustom: boolean;
  sportType: string;
  zoneType: string;
}) {
  if (!args.isCustom) return "%";

  switch (args.zoneType) {
    case "POWER":
      return "W";
    case "HEART_RATE":
      return "bpm";
    case "PACE":
      return args.sportType === SportType.SWIM ? "sec/100m" : "sec/km";
    default:
      return "";
  }
}

export function getZoneEditorSportOptions(zoneType: string) {
  return [SportType.RUN, SportType.CYCLING].concat(
    zoneType !== "POWER" ? [SportType.SWIM] : [],
  );
}

export function getZoneEditorSportLabel(args: {
  sportType: SportType | string;
  t: (key: string) => string;
}) {
  if (args.sportType === SportType.RUN) return args.t("sports.run");
  if (args.sportType === SportType.CYCLING) return args.t("sports.cycling");
  if (args.sportType === SportType.SWIM) return args.t("sports.swim");
  return args.t("selectSport");
}

export function calculateZoneAbsoluteValue(args: {
  benchmarkVal: number;
  isCustom: boolean;
  pct: number;
  sportType: string;
  zoneType: string;
}): string | number | null {
  if (args.isCustom) return null;
  if (!args.benchmarkVal) return "-";

  if (args.zoneType === "PACE") {
    if (args.sportType === SportType.SWIM) {
      if (args.pct <= 0) return "-";
      const speed = args.benchmarkVal * (args.pct / 100);
      if (speed <= 0) return "-";
      const paceSec100m = 100 / speed;
      const min = Math.floor(paceSec100m / 60);
      const sec = Math.round(paceSec100m % 60);
      return `${min}:${sec.toString().padStart(2, "0")}/100m`;
    }

    if (args.pct <= 0) return "-";
    const speed = args.benchmarkVal * (args.pct / 100);
    if (speed <= 0) return "-";
    const paceSec = 1000 / speed;
    const min = Math.floor(paceSec / 60);
    const sec = Math.round(paceSec % 60);
    return `${min}:${sec.toString().padStart(2, "0")}/km`;
  }

  return Math.round((args.benchmarkVal * args.pct) / 100);
}

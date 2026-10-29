import type { BodyMetricType, UserProfile } from "@/api/settings";
import {
  BodyMetricTypes,
  DefaultVdotSource,
  HeartRateZoneModel,
  PaceZoneModel,
  PowerZoneModel,
} from "@/api/settings";

type TranslateFn = (key: string) => string;

export type LoadSource = NonNullable<UserProfile["loadSources"]>[number];

export type UserProfileSport = "DEFAULT" | "RUN" | "CYCLING" | "SWIM";

export const ORDERED_LOAD_SOURCES = [
  "POWER",
  "HEART_RATE",
  "PACE",
  "SESSIONRPE",
] as const satisfies LoadSource[];

export function getLoadSourceOptions(t: TranslateFn) {
  return [
    { value: "POWER", label: t("fields.loadSources.options.POWER") },
    {
      value: "HEART_RATE",
      label: t("fields.loadSources.options.HEART_RATE"),
    },
    { value: "PACE", label: t("fields.loadSources.options.PACE") },
    {
      value: "SESSIONRPE",
      label: t("fields.loadSources.options.SESSIONRPE"),
    },
  ] as const satisfies Array<{ value: LoadSource; label: string }>;
}

export function normalizeLoadSources(sources: LoadSource[]) {
  const allowed = new Set<LoadSource>(ORDERED_LOAD_SOURCES);
  const seen = new Set<LoadSource>();
  const normalized: LoadSource[] = [];

  for (const source of sources) {
    if (!allowed.has(source) || seen.has(source)) continue;
    seen.add(source);
    normalized.push(source);
  }

  return normalized;
}

export function getHeartRateZoneModelOptions(t: TranslateFn) {
  return [
    {
      value: HeartRateZoneModel.MHR,
      label: t("fields.heartRateZoneModel.options.mhr"),
    },
    {
      value: HeartRateZoneModel.KARVONEN,
      label: t("fields.heartRateZoneModel.options.karvonen"),
    },
    {
      value: HeartRateZoneModel.FRIEL,
      label: t("fields.heartRateZoneModel.options.friel"),
    },
  ] as const;
}

export function getPowerZoneModelOptions(t: TranslateFn) {
  return [
    {
      value: PowerZoneModel.FRIEL,
      label: t("fields.powerZoneModel.options.friel"),
    },
    {
      value: PowerZoneModel.VANCE,
      label: t("fields.powerZoneModel.options.vance"),
    },
    {
      value: PowerZoneModel.STRYD,
      label: t("fields.powerZoneModel.options.stryd"),
    },
  ] as const;
}

export function getPaceZoneModelOptions(t: TranslateFn) {
  return [
    {
      value: PaceZoneModel.FRIEL,
      label: t("fields.paceZoneModel.options.friel"),
    },
    {
      value: PaceZoneModel.DANIELS,
      label: t("fields.paceZoneModel.options.daniels"),
    },
  ] as const;
}

export function getDefaultVdotSourceOptions(t: TranslateFn) {
  return [
    {
      value: DefaultVdotSource.FACTOR,
      label: t("fields.defaultVdotSource.options.FACTOR"),
    },
    {
      value: DefaultVdotSource.STANDARD,
      label: t("fields.defaultVdotSource.options.STANDARD"),
    },
  ] as const;
}

export function getCurrentDefaultVdotSource(value: string | undefined) {
  if (value === DefaultVdotSource.STANDARD) return DefaultVdotSource.STANDARD;
  return DefaultVdotSource.FACTOR;
}

export function getCurrentHeartRateZoneModel(value: string | undefined) {
  if (value === HeartRateZoneModel.FRIEL) return HeartRateZoneModel.FRIEL;
  if (value === HeartRateZoneModel.KARVONEN) return HeartRateZoneModel.KARVONEN;
  return HeartRateZoneModel.MHR;
}

export function getCurrentPowerZoneModel(value: string | undefined) {
  if (value === PowerZoneModel.VANCE) return PowerZoneModel.VANCE;
  if (value === PowerZoneModel.STRYD) return PowerZoneModel.STRYD;
  return PowerZoneModel.FRIEL;
}

export function getCurrentPaceZoneModel(value: string | undefined) {
  return value === PaceZoneModel.FRIEL
    ? PaceZoneModel.FRIEL
    : PaceZoneModel.DANIELS;
}

export function getBaseMetricLabel(args: {
  t: TranslateFn;
  type: BodyMetricType;
}) {
  const { t, type } = args;
  if (type === BodyMetricTypes.WEIGHT) return t("fields.weight.label");
  if (type === BodyMetricTypes.HEIGHT) return t("fields.height.label");
  if (type === BodyMetricTypes.BIRTHDAY) return t("fields.birthDate.label");
  if (type === BodyMetricTypes.GENDER) return t("fields.gender.label");
  return t("fields.timezone.label");
}

export function formatBaseMetricValue(args: {
  profile: UserProfile;
  t: TranslateFn;
  type: BodyMetricType;
}) {
  const { profile, t, type } = args;
  if (type === BodyMetricTypes.WEIGHT)
    return profile.weight != null ? String(profile.weight) : "-";
  if (type === BodyMetricTypes.HEIGHT)
    return profile.height != null ? String(profile.height) : "-";
  if (type === BodyMetricTypes.BIRTHDAY)
    return profile.birthDate ? String(profile.birthDate) : "-";
  if (type === BodyMetricTypes.TIMEZONE)
    return profile.timezone ? String(profile.timezone) : "-";

  const gender = profile.gender ? String(profile.gender).toLowerCase() : "";
  if (gender === "male") return t("fields.gender.options.male");
  if (gender === "female") return t("fields.gender.options.female");
  if (gender === "other") return t("fields.gender.options.other");
  return profile.gender ? String(profile.gender) : "-";
}

export function getPaceUnitLabel(sport: UserProfileSport) {
  return sport === "SWIM" ? "(min/100m)" : "(min/km)";
}

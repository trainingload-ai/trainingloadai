import {
  BodyMetricType,
  BodyMetricTypes,
  type MetricSource,
  type TrainingSettingSourceInfo,
} from "@/api/settings";
import {
  formatTimezoneOffsetLabel,
  getTimezoneOffsetMinutes as getSharedTimezoneOffsetMinutes,
  getTimezoneOptions as getSharedTimezoneOptions,
  sortTimezonesFromUtc,
} from "@shared/timezone-options";

export type MetricHistoryRow = {
  effectiveDate: string;
  value: string;
  source?: MetricSource;
  editable?: boolean;
  sourceInfo?: TrainingSettingSourceInfo | null;
};

export const KNOWN_METRIC_SOURCE_LABEL_KEYS = new Set([
  "manual",
  "auto",
  "imported",
  "intervals_icu",
  "unknown",
]);

export function normalizeMetricNumber(value: unknown): number | null {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function formatPaceSeconds(totalSeconds: number | undefined | null) {
  if (totalSeconds === undefined || totalSeconds === null) return "";
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const h = hours.toString().padStart(2, "0");
  const m = minutes.toString().padStart(2, "0");
  const s = seconds.toString().padStart(2, "0");
  const time = `${h}:${m}:${s}`;

  return hours === 0 ? time.slice(3) : time;
}

export function toPaceSeconds(
  speed: number | undefined | null,
  distanceMeters: number,
) {
  if (speed === undefined || speed === null) return undefined;
  if (!Number.isFinite(speed) || speed <= 0) return undefined;
  return Math.round(distanceMeters / speed);
}

export function parseMetricDateInput(value: string) {
  if (!value) return undefined;

  const parts = value.split("-");
  if (parts.length !== 3) return undefined;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (![year, month, day].every((n) => Number.isFinite(n))) return undefined;

  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function formatMetricDateInput(date: Date) {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDefaultMetricEffectiveDate(hasExistingRows: boolean) {
  return hasExistingRows ? new Date().toISOString().slice(0, 10) : "1970-01-01";
}

const STANDARD_TIMEZONE_OPTIONS = getSharedTimezoneOptions();

export function getTimezoneOptions(additionalValues: readonly string[] = []) {
  const validAdditionalValues = additionalValues.filter(
    (timezone) => getSharedTimezoneOffsetMinutes(timezone) !== null,
  );
  if (validAdditionalValues.length === 0) return STANDARD_TIMEZONE_OPTIONS;
  return sortTimezonesFromUtc(
    Array.from(
      new Set([...STANDARD_TIMEZONE_OPTIONS, ...validAdditionalValues]),
    ),
  );
}

export function getTimezoneOffsetMinutes(timezone: string, date = new Date()) {
  return getSharedTimezoneOffsetMinutes(timezone, date) ?? 0;
}

export function formatTimezoneOffset(timezone: string, date = new Date()) {
  return formatTimezoneOffsetLabel(timezone, date);
}

export function filterTimezoneOptions(
  options: string[],
  query: string,
  filteredLimit = Number.POSITIVE_INFINITY,
  defaultLimit = Number.POSITIVE_INFINITY,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((tz) => {
        const offset = formatTimezoneOffset(tz).toLowerCase();
        const searchable = [
          tz,
          tz.replace(/_/g, " "),
          offset,
          offset.replace(/^utc/, "gmt"),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
    : options;

  return filtered.slice(0, normalizedQuery ? filteredLimit : defaultLimit);
}

export function mapFitnessMetricEffectiveRows(
  rows:
    | Array<{
        recordedAt: string;
        effectiveDate?: string;
        value: number;
        source?: MetricSource;
        editable?: boolean;
        sourceInfo?: TrainingSettingSourceInfo | null;
      }>
    | null
    | undefined,
): MetricHistoryRow[] {
  return (
    rows?.map((row) => {
      const date = new Date(row.recordedAt);
      const serverEffectiveDate = String(row.effectiveDate ?? "").slice(0, 10);
      const effectiveDate = serverEffectiveDate
        ? serverEffectiveDate
        : Number.isFinite(date.getTime())
          ? date.toISOString().slice(0, 10)
          : "";

      return {
        effectiveDate,
        value: String(row.value),
        source: row.source,
        editable: row.editable,
        sourceInfo: row.sourceInfo ?? null,
      };
    }) ?? []
  );
}

export function mapBodyMetricRows(args: {
  data:
    | Array<{
        effectiveDate: string;
        value: unknown;
        sourceInfo?: TrainingSettingSourceInfo | null;
      }>
    | null
    | undefined;
  type: BodyMetricType;
}): MetricHistoryRow[] {
  return (
    args.data?.map((row) => {
      const date = new Date(row.effectiveDate);
      const effectiveDate = Number.isFinite(date.getTime())
        ? date.toISOString().slice(0, 10)
        : "";
      const rawValue = row.value ?? "";
      const value = (() => {
        if (args.type === BodyMetricTypes.GENDER) {
          return String(rawValue).toLowerCase();
        }
        if (args.type === BodyMetricTypes.BIRTHDAY) {
          const birthday = new Date(String(rawValue));
          return Number.isFinite(birthday.getTime())
            ? birthday.toISOString().slice(0, 10)
            : "";
        }
        return String(rawValue);
      })();

      return {
        effectiveDate,
        value,
        sourceInfo: row.sourceInfo ?? null,
      };
    }) ?? []
  );
}

export function metricSourceLabelKey(
  sourceInfo: TrainingSettingSourceInfo | null | undefined,
  source?: MetricSource,
) {
  const provider = String(sourceInfo?.originProvider ?? "").trim();
  if (provider) return provider;
  if (source === "AUTO" || source === "ESTIMATED") return "auto";

  switch (sourceInfo?.changeSource) {
    case "SYSTEM_CALCULATED":
      return "auto";
    case "SYSTEM_IMPORTED":
      return "imported";
    case "USER_MANUAL":
      return "manual";
    default:
      return "manual";
  }
}

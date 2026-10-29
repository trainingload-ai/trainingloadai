"use client";

import { formatValue } from "@/hooks/useFormatterBySettings";
import type {
  FitnessStatusLayoutItem,
  FitnessStatusMetricKey,
} from "@/hooks/useFitnessStatusConfig";

export function parseFitnessStatusLayout(
  raw: string,
  validKeys: readonly FitnessStatusMetricKey[],
): FitnessStatusLayoutItem[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    const validKeySet = new Set(validKeys);
    const validSpans = new Set([1, 2, 4]);

    const seen = new Set<string>();
    const result: FitnessStatusLayoutItem[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const key = (item as any).key;
      const span = (item as any).span;
      if (!validKeySet.has(key)) continue;
      if (!validSpans.has(span)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, span });
    }

    // An explicit empty array is a valid user layout: the editor allows every
    // status card to be removed. Only malformed or missing settings fall back
    // to the default layout. Treating `[]` as invalid made a saved empty grid
    // silently repopulate after the next hydration.
    if (parsed.length === 0) return [];
    if (result.length === 0) return null;
    if (validKeySet.has("paceZones") && !seen.has("paceZones")) {
      const vo2Index = result.findIndex((item) => item.key === "vo2Max");
      result.splice(vo2Index >= 0 ? vo2Index + 1 : 0, 0, {
        key: "paceZones",
        span: 1,
      });
    }
    return result;
  } catch {
    return null;
  }
}

export function formatW(v: unknown, systemUnit: "metric" | "imperial"): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return formatValue(n, "power", systemUnit);
}

export function formatBpm(
  v: unknown,
  systemUnit: "metric" | "imperial",
): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return formatValue(n, "heartRate", systemUnit);
}

export function formatPaceSeconds(
  v: unknown,
  systemUnit: "metric" | "imperial",
): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return formatValue(n, "paceSeconds", systemUnit);
}

export function getACRatioStatus(
  t: (key: string) => string,
  value: number | undefined,
) {
  if (value === undefined) return t("acRatio.description");
  if (value < 0.8) return t("acRatio.status.low");
  if (value <= 1.3) return t("acRatio.status.optimal");
  if (value <= 1.5) return t("acRatio.status.high");
  return t("acRatio.status.danger");
}

export function getMonotonyStatus(
  t: (key: string) => string,
  value: number | undefined,
) {
  if (value === undefined) return t("monotony.description");
  if (value < 0.6) return t("monotony.status.low");
  if (value <= 0.8) return t("monotony.status.moderate");
  return t("monotony.status.high");
}

export function getIntensityStatus(
  t: (key: string) => string,
  value: number | undefined,
) {
  if (value === undefined) return t("intensity.description");
  if (value < 600) return t("intensity.status.low");
  if (value <= 1000) return t("intensity.status.optimal");
  return t("intensity.status.high");
}

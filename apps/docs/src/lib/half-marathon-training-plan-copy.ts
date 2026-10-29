export const HALF_MARATHON_INDEXED_LOCALES = [
  "en",
  "zh",
  "zh-hant",
  "ja",
] as const;

export type HalfMarathonIndexedLocale =
  (typeof HALF_MARATHON_INDEXED_LOCALES)[number];

export function isHalfMarathonIndexedLocale(
  lang: string,
): lang is HalfMarathonIndexedLocale {
  return (HALF_MARATHON_INDEXED_LOCALES as readonly string[]).includes(lang);
}

/** Official finish-half-marathon template facts. Do not invent sessions. */
export const HALF_MARATHON_PLAN_FACTS = {
  weeks: 14,
  runsPerWeek: 4,
  openingEasyMinutes: 60,
  peakLongRunMinutes: 110,
  peakWeek: 11,
  taperWeeks: 2,
  howToTotalTime: "P14W",
} as const;

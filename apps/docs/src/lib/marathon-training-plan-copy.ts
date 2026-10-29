export const MARATHON_INDEXED_LOCALES = ["en", "zh", "zh-hant", "ja"] as const;

export type MarathonIndexedLocale = (typeof MARATHON_INDEXED_LOCALES)[number];

export function isMarathonIndexedLocale(
  lang: string,
): lang is MarathonIndexedLocale {
  return (MARATHON_INDEXED_LOCALES as readonly string[]).includes(lang);
}

/** Official finish-marathon template facts. Do not invent sessions. */
export const MARATHON_PLAN_FACTS = {
  weeks: 18,
  runsPerWeek: 4,
  openingEasyMinutes: 40,
  openingLongRunMinutes: 90,
  peakLongRunMinutes: 165,
  peakWeek: 14,
  taperWeeks: 3,
  howToTotalTime: "P18W",
} as const;

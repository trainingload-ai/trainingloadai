export const TEN_K_INDEXED_LOCALES = ["en", "zh", "zh-hant", "ja"] as const;

export type TenKIndexedLocale = (typeof TEN_K_INDEXED_LOCALES)[number];

export function isTenKIndexedLocale(lang: string): lang is TenKIndexedLocale {
  return (TEN_K_INDEXED_LOCALES as readonly string[]).includes(lang);
}

/** Official finish-10k template facts. Do not invent sessions. */
export const TEN_K_PLAN_FACTS = {
  weeks: 10,
  runsPerWeek: 3,
  openingEasyMinutes: 30,
  openingLongRunMinutes: 45,
  peakLongRunMinutes: 65,
  peakWeek: 7,
  steadyWeeks: [4, 6, 8] as const,
  taperWeeks: 2,
  howToTotalTime: "P10W",
} as const;

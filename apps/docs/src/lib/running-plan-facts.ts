/** Officialfinish-10k template facts. Do not invent sessions. */
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

/** Officialfinish-half-marathon template facts. Do not invent sessions. */
export const HALF_MARATHON_PLAN_FACTS = {
  weeks: 14,
  runsPerWeek: 4,
  openingEasyMinutes: 60,
  peakLongRunMinutes: 110,
  peakWeek: 11,
  taperWeeks: 2,
  howToTotalTime: "P14W",
} as const;

/** Officialfinish-marathon template facts. Do not invent sessions. */
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

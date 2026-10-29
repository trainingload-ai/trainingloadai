import {
  type RacePreset,
  formatClock,
  formatPaceClock,
  paceToSpeed,
  secPerKmToPace,
  raceDistanceKm,
  solveDistanceKm,
  solvePaceSecPerKm,
  solveTimeSec,
} from "./running-pace";

export const PACE_RACE_KEYS: RacePreset[] = ["5k", "10k", "half", "marathon"];

const GOAL_TIMES: Record<RacePreset, readonly number[]> = {
  "5k": [20 * 60, 25 * 60, 30 * 60, 35 * 60],
  "10k": [40 * 60, 45 * 60, 50 * 60, 60 * 60],
  half: [90 * 60, 105 * 60, 120 * 60, 135 * 60],
  marathon: [180 * 60, 210 * 60, 240 * 60, 270 * 60, 300 * 60],
};

/** Keep full precision until display, as the interactive calculator does. */
export function getRacePaceGoals(race: RacePreset) {
  return GOAL_TIMES[race].map((timeSec) => {
    const secPerKm = solvePaceSecPerKm(raceDistanceKm(race), timeSec)!;
    return {
      timeSec,
      secPerKm,
      time: formatClock(timeSec),
      perKm: formatPaceClock(secPerKm),
      perMile: formatPaceClock(secPerKmToPace(secPerKm, "min_per_mi")),
    };
  });
}

export function getPaceConversions() {
  return [240, 270, 300, 330, 360, 390, 420, 480].map((secPerKm) => ({
    perKm: formatPaceClock(secPerKm),
    perMile: formatPaceClock(secPerKmToPace(secPerKm, "min_per_mi")),
    kmh: paceToSpeed(secPerKm, "km/h")!,
    mph: paceToSpeed(secPerKm, "mph")!,
  }));
}

export function getPaceCalculationExamples() {
  return {
    pace: formatPaceClock(solvePaceSecPerKm(5, 25 * 60)!),
    time: formatClock(solveTimeSec(10, 330)!),
    distance: solveDistanceKm(40 * 60, 300)!,
    weightedPace: formatPaceClock(solvePaceSecPerKm(10, 6 * 300 + 4 * 360)!),
  };
}

export const PACE_SOURCES = {
  units: "https://www.nist.gov/document/2026-hb-133-appendix-e",
  distances:
    "https://worldathletics.org/download/download?filename=175739a3-b6be-4e84-914c-15d7ce791665.pdf&urlslug=Terms%2Band%2Babbreviations",
} as const;

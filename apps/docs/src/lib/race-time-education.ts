import {
  displayedRaceTimeSec,
  formatPredictedClock,
  predictRaceTimes,
  type PredictRaceKey,
} from "./race-time-predictor";
import { RACE_DISTANCES_KM } from "./running-pace";

const EXAMPLE_INPUTS = [
  ["5k", 20 * 60],
  ["5k", 25 * 60],
  ["5k", 30 * 60],
  ["10k", 45 * 60],
  ["10k", 50 * 60],
  ["10k", 60 * 60],
  ["half", 90 * 60],
  ["half", 105 * 60],
  ["half", 120 * 60],
] as const;

/** The page and llms-full.txt use the calculator's model and display rounding. */
export function getRacePredictionExamples() {
  return EXAMPLE_INPUTS.map(([source, timeSec]) => {
    const prediction = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM[source],
      timeSec,
    });
    if (!prediction?.vdotSupported) {
      throw new Error("Unsupported race prediction example");
    }
    const times = Object.fromEntries(
      prediction.rows.map((row) => [
        row.key,
        formatPredictedClock(displayedRaceTimeSec(row, timeSec)!),
      ]),
    ) as Record<PredictRaceKey, string>;
    return { source, sourceTime: formatPredictedClock(timeSec), times };
  });
}

export const RACE_PREDICTION_SOURCES = [
  {
    key: "vdot",
    label: "V.O2 — VDOT Running Calculator",
    href: "https://vdoto2.com/calculator",
  },
  {
    key: "research",
    label:
      "Vickers & Vertosick (2016). An empirical study of race times in recreational endurance runners.",
    href: "https://link.springer.com/article/10.1186/s13102-016-0052-y",
  },
  {
    key: "garmin",
    label:
      "Garmin — How to Train for Your Next Race with the Garmin Race Widget",
    href: "https://www.garmin.com/en-AU/blog/how-to-train-for-your-next-race-with-the-garmin-race-widget/",
  },
] as const;

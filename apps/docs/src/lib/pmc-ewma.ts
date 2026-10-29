export const CTL_TIME_CONSTANT_DAYS = 42;
export const ATL_TIME_CONSTANT_DAYS = 7;
export const MIN_PMC_DAYS = 7;
export const MAX_PMC_DAYS = 14;

export type TsbBand = "fatigue" | "maintaining" | "freshening";

export type PmcDayInput = {
  tss: number;
};

export type PmcDayPoint = {
  dayIndex: number;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
};

export type PmcProjection = {
  startingCtl: number;
  startingAtl: number;
  startingTsb: number;
  days: PmcDayPoint[];
  final: PmcDayPoint;
  tsbBand: TsbBand;
  ctlDelta: number;
};

export const EXAMPLE_PMC_STARTING_CTL = 55;
export const EXAMPLE_PMC_STARTING_ATL = 48;
export const EXAMPLE_PMC_WEEK_TSS = [0, 70, 45, 90, 0, 130, 55] as const;

/**
 * TrainingPeaks-style EWMA update:
 * X_today = X_yesterday + (dailyTSS − X_yesterday) / τ
 *
 * τ is 42 days for CTL and 7 days for ATL. TSB is same-day CTL − ATL.
 */
export function nextTrainingPeaksLoad(
  previousLoad: number,
  dailyTss: number,
  timeConstantDays: number,
): number {
  if (!Number.isFinite(previousLoad) || !Number.isFinite(dailyTss)) {
    throw new RangeError("PMC loads must be finite numbers");
  }
  if (!Number.isFinite(timeConstantDays) || timeConstantDays <= 0) {
    throw new RangeError("PMC time constant must be a positive finite number");
  }
  return previousLoad + (dailyTss - previousLoad) / timeConstantDays;
}

export function trainingStressBalance(ctl: number, atl: number): number {
  return ctl - atl;
}

export function interpretTsb(tsb: number): TsbBand {
  if (tsb < -10) return "fatigue";
  if (tsb > 10) return "freshening";
  return "maintaining";
}

export function projectPmc(input: {
  startingCtl: number;
  startingAtl: number;
  dailyTss: number[];
}): PmcProjection | null {
  const { startingCtl, startingAtl, dailyTss } = input;
  if (!Number.isFinite(startingCtl) || startingCtl < 0) return null;
  if (!Number.isFinite(startingAtl) || startingAtl < 0) return null;
  if (dailyTss.length < 1 || dailyTss.length > MAX_PMC_DAYS) return null;
  if (dailyTss.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }

  const days: PmcDayPoint[] = [];
  let ctl = startingCtl;
  let atl = startingAtl;

  for (let index = 0; index < dailyTss.length; index += 1) {
    const tss = dailyTss[index]!;
    ctl = nextTrainingPeaksLoad(ctl, tss, CTL_TIME_CONSTANT_DAYS);
    atl = nextTrainingPeaksLoad(atl, tss, ATL_TIME_CONSTANT_DAYS);
    days.push({
      dayIndex: index,
      tss,
      ctl,
      atl,
      tsb: trainingStressBalance(ctl, atl),
    });
  }

  const final = days.at(-1);
  if (!final) return null;

  return {
    startingCtl,
    startingAtl,
    startingTsb: trainingStressBalance(startingCtl, startingAtl),
    days,
    final,
    tsbBand: interpretTsb(final.tsb),
    ctlDelta: final.ctl - startingCtl,
  };
}

export function examplePmcWeek(): number[] {
  return [...EXAMPLE_PMC_WEEK_TSS];
}

export function formatPmcValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  padding = 4,
): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerWidth = Math.max(width - padding * 2, 1);
  const innerHeight = Math.max(height - padding * 2, 1);

  return values
    .map((value, index) => {
      const x =
        padding +
        (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
      const y = padding + ((max - value) / range) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

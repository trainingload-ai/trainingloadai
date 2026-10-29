export type Vo2Method = "cooper" | "rockport" | "beep" | "restingHr" | "race";
export type Vo2Sex = "male" | "female";
export type CooperUnit = "m" | "km";
export type RaceDistance = "5k" | "10k" | "half";
export type FitnessLevelKey =
  | "excellent"
  | "veryGood"
  | "good"
  | "fair"
  | "poor";
export type MaxHeartRateSource = "estimated" | "entered";

export type Vo2FieldError =
  | "age"
  | "sex"
  | "cooper-distance"
  | "rockport-weight"
  | "rockport-hr"
  | "rockport-time"
  | "beep-level"
  | "beep-shuttle"
  | "resting-hr"
  | "max-hr"
  | "race-time"
  | "compute";

export type Vo2Draft = {
  units: "metric" | "imperial";
  method: Vo2Method;
  age: string;
  sex: "" | Vo2Sex;
  cooperDistance: string;
  cooperUnit: CooperUnit;
  weightKg: string;
  rockportHr: string;
  rockportMin: string;
  rockportSec: string;
  beepLevel: string;
  beepShuttle: string;
  restingHr: string;
  maxHr: string;
  raceDistance: RaceDistance;
  raceHours: string;
  raceMin: string;
  raceSec: string;
};

export type FitnessThresholds = {
  excellent: number;
  veryGood: number;
  good: number;
  fair: number;
};

export type FitnessReading = {
  levelKey: FitnessLevelKey;
  percentile: number;
  bandIndex: number;
  thresholds: FitnessThresholds;
};

export type Vo2Detail =
  | { kind: "cooper"; distanceM: number }
  | { kind: "rockport"; minutes: number; seconds: number; hrBpm: number }
  | {
      kind: "beep";
      level: number;
      shuttle: number | null;
      speedKmh: number;
    }
  | {
      kind: "restingHr";
      restingHr: number;
      maxHr: number;
      maxHrSource: MaxHeartRateSource;
    }
  | {
      kind: "race";
      event: RaceDistance;
      hours: number;
      minutes: number;
      seconds: number;
    };

export type Vo2Result = {
  method: Vo2Method;
  vo2max: number;
  age: number;
  sex: Vo2Sex;
  fitness: FitnessReading;
  detail: Vo2Detail;
};

export type Vo2Calculation =
  | { ok: true; value: Vo2Result }
  | { ok: false; error: Vo2FieldError };

const MALE_THRESHOLDS = {
  excellent: [55.4, 54.0, 52.5, 48.9, 45.7, 42.1],
  veryGood: [51.1, 48.3, 46.4, 43.4, 39.5, 36.7],
  good: [45.4, 44.0, 42.4, 39.2, 35.5, 32.3],
  fair: [41.7, 40.5, 38.5, 35.6, 32.3, 29.4],
} as const;

const FEMALE_THRESHOLDS = {
  excellent: [49.6, 47.4, 45.3, 41.1, 37.8, 36.7],
  veryGood: [43.9, 42.4, 39.7, 36.7, 33.0, 30.9],
  good: [39.5, 37.8, 36.3, 33.0, 30.0, 28.1],
  fair: [36.1, 34.4, 33.0, 30.1, 27.5, 25.9],
} as const;

export const RACE_DISTANCE_METERS: Record<RaceDistance, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
};

const RACE_TIME_LIMITS_MIN: Record<RaceDistance, readonly [number, number]> = {
  "5k": [12, 90],
  "10k": [24, 180],
  half: [55, 300],
};

const METHODS = new Set<Vo2Method>([
  "cooper",
  "rockport",
  "beep",
  "restingHr",
  "race",
]);

export function createVo2Draft(): Vo2Draft {
  return {
    units: "metric",
    method: "cooper",
    age: "",
    sex: "",
    cooperDistance: "2800",
    cooperUnit: "m",
    weightKg: "70",
    rockportHr: "150",
    rockportMin: "14",
    rockportSec: "30",
    beepLevel: "10",
    beepShuttle: "",
    restingHr: "60",
    maxHr: "",
    raceDistance: "5k",
    raceHours: "0",
    raceMin: "20",
    raceSec: "00",
  };
}

export function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function ageBandIndex(age: number) {
  if (age < 30) return 0;
  if (age < 40) return 1;
  if (age < 50) return 2;
  if (age < 60) return 3;
  if (age < 70) return 4;
  return 5;
}

export function fitnessThresholds(sex: Vo2Sex, age: number): FitnessThresholds {
  const table = sex === "male" ? MALE_THRESHOLDS : FEMALE_THRESHOLDS;
  const index = ageBandIndex(age);
  return {
    excellent: table.excellent[index],
    veryGood: table.veryGood[index],
    good: table.good[index],
    fair: table.fair[index],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function readFitness(input: {
  vo2max: number;
  sex: Vo2Sex;
  age: number;
}): FitnessReading {
  const thresholds = fitnessThresholds(input.sex, input.age);
  const { vo2max } = input;
  const levelKey: FitnessLevelKey =
    vo2max >= thresholds.excellent
      ? "excellent"
      : vo2max >= thresholds.veryGood
        ? "veryGood"
        : vo2max >= thresholds.good
          ? "good"
          : vo2max >= thresholds.fair
            ? "fair"
            : "poor";

  const { fair, good, veryGood, excellent } = thresholds;
  let percentile: number;
  if (vo2max < fair) {
    const ratio = clamp(vo2max / fair, 0, 0.999);
    percentile = 1 + (20 - 1) * ratio;
  } else if (vo2max < good) {
    const ratio = clamp((vo2max - fair) / (good - fair), 0, 0.999);
    percentile = 20 + (45 - 20) * ratio;
  } else if (vo2max < veryGood) {
    const ratio = clamp((vo2max - good) / (veryGood - good), 0, 0.999);
    percentile = 45 + (70 - 45) * ratio;
  } else if (vo2max < excellent) {
    const ratio = clamp((vo2max - veryGood) / (excellent - veryGood), 0, 0.999);
    percentile = 70 + (88 - 70) * ratio;
  } else {
    const ratio = clamp((vo2max - excellent) / excellent, 0, 1);
    percentile = 88 + (99 - 88) * ratio;
  }

  return {
    levelKey,
    percentile: Math.round(percentile),
    bandIndex: ageBandIndex(input.age),
    thresholds,
  };
}

/** Cooper 12-minute run: (distance_m − 504.9) / 44.73. */
export function cooperVo2maxFromDistanceMeters(distanceM: number) {
  return (distanceM - 504.9) / 44.73;
}

/** Rockport 1-mile walk (Kline et al.). Weight is kilograms. Time is minutes. */
export function rockportVo2max(input: {
  age: number;
  sex: Vo2Sex;
  weightKg: number;
  timeMin: number;
  hrBpm: number;
}) {
  const weightLb = input.weightKg * 2.2046226218;
  const sex = input.sex === "male" ? 1 : 0;
  return (
    132.853 -
    0.0769 * weightLb -
    0.3877 * input.age +
    6.315 * sex -
    3.2649 * input.timeMin -
    0.1565 * input.hrBpm
  );
}

/**
 * Léger et al. (1988), PMID 3184250: one-minute 20 m stages starting at 8.5 km/h.
 * The published adult model holds equation age at 18; younger participants use age.
 * This stage-speed equation does not interpolate partial-stage shuttle counts.
 */
export function beepVo2maxFromLevel(level: number, age: number) {
  const speedKmh = 8 + 0.5 * level;
  const modelAge = Math.min(age, 18);
  return {
    speedKmh,
    vo2max:
      31.025 +
      3.238 * speedKmh -
      3.248 * modelAge +
      0.1536 * modelAge * speedKmh,
  };
}

/** Uth–Sørensen–Overgaard–Pedersen: 15.3 × HRmax / HRrest. */
export function restingHrVo2max(restingHr: number, maxHr: number) {
  return 15.3 * (maxHr / restingHr);
}

export function estimatedMaxHeartRate(age: number) {
  return 220 - age;
}

/**
 * Daniels/Gilbert race-performance VO2 (VDOT scale).
 * Velocity is meters per minute. Output stays a VO2 figure — pace tables live on the VDOT calculator.
 */
export function raceVo2max(input: { distanceM: number; timeMin: number }) {
  const velocity = input.distanceM / input.timeMin;
  const oxygenCost =
    -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  const fraction =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * input.timeMin) +
    0.2989558 * Math.exp(-0.1932605 * input.timeMin);
  return oxygenCost / fraction;
}

function parsePositiveNumber(raw: string) {
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseIntegerInRange(raw: string, min: number, max: number) {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function parseClock(input: {
  hours?: string;
  minutes: string;
  seconds: string;
}) {
  const minutes = parseIntegerInRange(input.minutes, 0, 599);
  const seconds = parseIntegerInRange(
    input.seconds === "" ? "0" : input.seconds,
    0,
    59,
  );
  const hours =
    input.hours == null || input.hours.trim() === ""
      ? 0
      : parseIntegerInRange(input.hours, 0, 6);
  if (minutes == null || seconds == null || hours == null) return null;
  const totalMin = hours * 60 + minutes + seconds / 60;
  if (totalMin <= 0) return null;
  return { hours, minutes, seconds, totalMin };
}

function fail(error: Vo2FieldError): Vo2Calculation {
  return { ok: false, error };
}

function succeed(input: {
  method: Vo2Method;
  vo2: number;
  age: number;
  sex: Vo2Sex;
  detail: Vo2Detail;
}): Vo2Calculation {
  if (!Number.isFinite(input.vo2) || input.vo2 <= 0 || input.vo2 > 100) {
    return fail("compute");
  }
  const vo2max = round1(input.vo2);
  return {
    ok: true,
    value: {
      method: input.method,
      vo2max,
      age: input.age,
      sex: input.sex,
      fitness: readFitness({ vo2max, sex: input.sex, age: input.age }),
      detail: input.detail,
    },
  };
}

function readProfile(
  draft: Vo2Draft,
): { age: number; sex: Vo2Sex } | Vo2FieldError {
  const age = parseIntegerInRange(draft.age, 10, 99);
  if (age == null) return "age";
  if (draft.sex !== "male" && draft.sex !== "female") return "sex";
  return { age, sex: draft.sex };
}

export function calculateVo2(draft: Vo2Draft): Vo2Calculation {
  const profile = readProfile(draft);
  if (typeof profile === "string") return fail(profile);

  if (draft.method === "cooper") {
    const distance = parsePositiveNumber(draft.cooperDistance);
    if (distance == null) return fail("cooper-distance");
    const distanceM = draft.cooperUnit === "km" ? distance * 1000 : distance;
    return succeed({
      method: "cooper",
      vo2: cooperVo2maxFromDistanceMeters(distanceM),
      age: profile.age,
      sex: profile.sex,
      detail: { kind: "cooper", distanceM: Math.round(distanceM) },
    });
  }

  if (draft.method === "rockport") {
    const weightKg = parsePositiveNumber(draft.weightKg);
    if (weightKg == null || weightKg > 250) return fail("rockport-weight");
    const hrBpm = parseIntegerInRange(draft.rockportHr, 40, 220);
    if (hrBpm == null) return fail("rockport-hr");
    const clock = parseClock({
      minutes: draft.rockportMin,
      seconds: draft.rockportSec,
    });
    if (clock == null || clock.totalMin < 8 || clock.totalMin > 40) {
      return fail("rockport-time");
    }
    return succeed({
      method: "rockport",
      vo2: rockportVo2max({
        age: profile.age,
        sex: profile.sex,
        weightKg,
        timeMin: clock.totalMin,
        hrBpm,
      }),
      age: profile.age,
      sex: profile.sex,
      detail: {
        kind: "rockport",
        minutes: clock.minutes,
        seconds: clock.seconds,
        hrBpm,
      },
    });
  }

  if (draft.method === "beep") {
    const level = parseIntegerInRange(draft.beepLevel, 1, 21);
    if (level == null) return fail("beep-level");
    const shuttle =
      draft.beepShuttle.trim() === ""
        ? null
        : parseIntegerInRange(draft.beepShuttle, 1, 30);
    if (draft.beepShuttle.trim() !== "" && shuttle == null)
      return fail("beep-shuttle");
    const beep = beepVo2maxFromLevel(level, profile.age);
    return succeed({
      method: "beep",
      vo2: beep.vo2max,
      age: profile.age,
      sex: profile.sex,
      detail: {
        kind: "beep",
        level,
        shuttle,
        speedKmh: round1(beep.speedKmh),
      },
    });
  }

  if (draft.method === "restingHr") {
    const restingHr = parseIntegerInRange(draft.restingHr, 30, 120);
    if (restingHr == null) return fail("resting-hr");
    const entered = draft.maxHr.trim() !== "";
    const maxHr = entered
      ? parseIntegerInRange(draft.maxHr, 120, 230)
      : estimatedMaxHeartRate(profile.age);
    if (maxHr == null || maxHr <= restingHr + 10) return fail("max-hr");
    return succeed({
      method: "restingHr",
      vo2: restingHrVo2max(restingHr, maxHr),
      age: profile.age,
      sex: profile.sex,
      detail: {
        kind: "restingHr",
        restingHr,
        maxHr,
        maxHrSource: entered ? "entered" : "estimated",
      },
    });
  }

  const clock = parseClock({
    hours: draft.raceHours,
    minutes: draft.raceMin,
    seconds: draft.raceSec,
  });
  if (clock == null) return fail("race-time");
  const [minTime, maxTime] = RACE_TIME_LIMITS_MIN[draft.raceDistance];
  if (clock.totalMin < minTime || clock.totalMin > maxTime)
    return fail("race-time");
  return succeed({
    method: "race",
    vo2: raceVo2max({
      distanceM: RACE_DISTANCE_METERS[draft.raceDistance],
      timeMin: clock.totalMin,
    }),
    age: profile.age,
    sex: profile.sex,
    detail: {
      kind: "race",
      event: draft.raceDistance,
      hours: clock.hours,
      minutes: clock.minutes,
      seconds: clock.seconds,
    },
  });
}

function methodFromQuery(value: string | null): Vo2Method | null {
  if (value === "hr") return "restingHr";
  if (value && METHODS.has(value as Vo2Method)) return value as Vo2Method;
  return null;
}

export function applyVo2Search(search: string): Vo2Draft | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const method = methodFromQuery(params.get("method"));
  if (!method) return null;
  const draft = createVo2Draft();
  draft.method = method;
  draft.units = params.get("units") === "imperial" ? "imperial" : "metric";
  const age = params.get("age");
  if (age != null) draft.age = age;
  const sex = params.get("sex");
  if (sex === "male" || sex === "female") draft.sex = sex;

  if (method === "cooper") {
    const distance = params.get("distance");
    if (distance != null) draft.cooperDistance = distance;
    const unit = params.get("unit");
    if (unit === "m" || unit === "km") draft.cooperUnit = unit;
  } else if (method === "rockport") {
    const weight = params.get("weight");
    if (weight != null) draft.weightKg = weight;
    const hr = params.get("hr");
    if (hr != null) draft.rockportHr = hr;
    const minutes = params.get("min");
    if (minutes != null) draft.rockportMin = minutes;
    const seconds = params.get("sec");
    if (seconds != null) draft.rockportSec = seconds;
  } else if (method === "beep") {
    const level = params.get("level");
    if (level != null) draft.beepLevel = level;
    const shuttle = params.get("shuttle");
    if (shuttle != null) draft.beepShuttle = shuttle;
  } else if (method === "restingHr") {
    const resting = params.get("rhr");
    if (resting != null) draft.restingHr = resting;
    const maxHr = params.get("mhr");
    if (maxHr != null) draft.maxHr = maxHr;
  } else {
    const event = params.get("event");
    if (event === "5k" || event === "10k" || event === "half")
      draft.raceDistance = event;
    const hours = params.get("h");
    if (hours != null) draft.raceHours = hours;
    const minutes = params.get("min");
    if (minutes != null) draft.raceMin = minutes;
    const seconds = params.get("sec");
    if (seconds != null) draft.raceSec = seconds;
  }
  return draft;
}

export function vo2SearchFromDraft(draft: Vo2Draft) {
  const params = new URLSearchParams();
  params.set("method", draft.method === "restingHr" ? "hr" : draft.method);
  params.set("units", draft.units);
  params.set("age", draft.age.trim());
  params.set("sex", draft.sex);
  if (draft.method === "cooper") {
    params.set("distance", draft.cooperDistance.trim());
    params.set("unit", draft.cooperUnit);
  } else if (draft.method === "rockport") {
    params.set("weight", draft.weightKg.trim());
    params.set("hr", draft.rockportHr.trim());
    params.set("min", draft.rockportMin.trim());
    params.set("sec", draft.rockportSec.trim());
  } else if (draft.method === "beep") {
    params.set("level", draft.beepLevel.trim());
    if (draft.beepShuttle.trim() !== "")
      params.set("shuttle", draft.beepShuttle.trim());
  } else if (draft.method === "restingHr") {
    params.set("rhr", draft.restingHr.trim());
    if (draft.maxHr.trim() !== "") params.set("mhr", draft.maxHr.trim());
  } else {
    params.set("event", draft.raceDistance);
    params.set(
      "h",
      draft.raceHours.trim() === "" ? "0" : draft.raceHours.trim(),
    );
    params.set("min", draft.raceMin.trim());
    params.set("sec", draft.raceSec.trim() === "" ? "0" : draft.raceSec.trim());
  }
  return `?${params.toString()}`;
}

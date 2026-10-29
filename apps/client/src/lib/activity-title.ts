export type ActivityTitleInput = {
  title?: string | null;
  activityName?: string | null;
  sportType?: string | null;
  startTime?: string | Date | null;
  timezone?: string | null;
};

export type ActivityTitleTranslationKey =
  | "untitled"
  | "periods.morning"
  | "periods.noon"
  | "periods.afternoon"
  | "periods.evening"
  | "periods.night"
  | "sports.run"
  | "sports.ride"
  | "sports.swim"
  | "sports.workout"
  | `demo.base.${DemoActivityBase}`
  | `demo.detail.${DemoActivityDetail}`
  | `demo.note.${DemoWorkoutNote}`;

export type ActivityTitleTranslator = (
  key: ActivityTitleTranslationKey,
  values?: Record<string, string | number>,
) => string;

type ActivityPeriod = "morning" | "noon" | "afternoon" | "evening" | "night";

type ActivitySport = "run" | "ride" | "swim" | "workout";

type DemoActivityBase =
  | "recoveryWalk"
  | "recoveryRun"
  | "poolSwim"
  | "easyRun"
  | "longEasyRun"
  | "baseRun"
  | "thresholdRun"
  | "longRun"
  | "unplannedEasyRun"
  | "tempoRun"
  | "progressiveLongRun"
  | "treadmillRun"
  | "treadmillTempo"
  | "peakLongRun"
  | "fatigueRecoveryWalk"
  | "taperRun"
  | "goalRace10K";

type DemoActivityDetail =
  | "minutes"
  | "kilometers"
  | "meters"
  | "shortened"
  | "moved"
  | "skipped";

type DemoWorkoutNote = "skippedRecovery" | "postponedDay" | "shortened";

const DEMO_ACTIVITY_BASES: Record<string, DemoActivityBase> = {
  "Recovery Walk": "recoveryWalk",
  "Recovery Run": "recoveryRun",
  "Pool Swim": "poolSwim",
  "Easy Run": "easyRun",
  "Long Easy Run": "longEasyRun",
  "Base Run": "baseRun",
  "Threshold Run": "thresholdRun",
  "Long Run": "longRun",
  "Unplanned Easy Run": "unplannedEasyRun",
  "Tempo Run": "tempoRun",
  "Progressive Long Run": "progressiveLongRun",
  "Treadmill Run": "treadmillRun",
  "Treadmill Tempo": "treadmillTempo",
  "Peak Long Run": "peakLongRun",
  "Fatigue Recovery Walk": "fatigueRecoveryWalk",
  "Taper Run": "taperRun",
  "10K Goal Race": "goalRace10K",
};

const DEMO_WORKOUT_NOTES: Record<string, DemoWorkoutNote> = {
  "Demo scenario: skipped because recovery indicators were poor.":
    "skippedRecovery",
  "Demo scenario: postponed by one day.": "postponedDay",
  "Demo scenario: athlete shortened the prescribed session.": "shortened",
};

const GENERATED_ACTIVITY_TITLE_PATTERN =
  /^(Morning|Noon|Afternoon|Evening|Night)\s+(Run|Ride|Swim|Workout)$/i;

function sportFromType(sportType: string | null | undefined) {
  switch (
    String(sportType ?? "")
      .trim()
      .toUpperCase()
  ) {
    case "RUN":
      return "run";
    case "CYCLING":
      return "ride";
    case "SWIM":
      return "swim";
    case "STRETCHING":
      return "workout";
    default:
      return null;
  }
}

function parseGeneratedActivityTitle(value: string) {
  const match = value.match(GENERATED_ACTIVITY_TITLE_PATTERN);
  if (!match) return null;

  return {
    period: match[1].toLowerCase() as ActivityPeriod,
    sport: match[2].toLowerCase() as ActivitySport,
  };
}

function localizeDemoActivityTitle(
  value: string,
  translate: ActivityTitleTranslator,
) {
  const [rawBase, rawDetail, ...rest] = value.split(" · ");
  const base = DEMO_ACTIVITY_BASES[rawBase];
  if (!base || rest.length > 0) return null;
  if (!rawDetail) return translate(`demo.base.${base}`);

  let detail: string;
  const amount = rawDetail.match(/^([\d,.]+)\s+(min|km|m)$/);
  if (amount) {
    const key =
      amount[2] === "min"
        ? "minutes"
        : amount[2] === "km"
          ? "kilometers"
          : "meters";
    detail = translate(`demo.detail.${key}`, { value: amount[1] });
  } else if (["Shortened", "Moved", "Skipped"].includes(rawDetail)) {
    detail = translate(
      `demo.detail.${rawDetail.toLowerCase() as "shortened" | "moved" | "skipped"}`,
    );
  } else {
    return null;
  }

  return `${translate(`demo.base.${base}`)} · ${detail}`;
}

export function getLocalizedDemoWorkoutNote(
  note: string | null | undefined,
  translate: ActivityTitleTranslator,
) {
  const value = String(note ?? "").trim();
  const key = DEMO_WORKOUT_NOTES[value];
  return key ? translate(`demo.note.${key}`) : value;
}

function periodFromHour(hour: number): ActivityPeriod {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

function periodFromActivityTime(
  startTime: string | Date | null | undefined,
  timezone: string | null | undefined,
): ActivityPeriod | null {
  const normalizedTimezone = timezone?.trim();
  if (!startTime || !normalizedTimezone) return null;

  const date = startTime instanceof Date ? startTime : new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: normalizedTimezone,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isFinite(hour) ? periodFromHour(hour) : null;
  } catch {
    return null;
  }
}

/**
 * Localizes only exact server-generated fallback titles. User and provider
 * supplied titles remain untouched, including longer names that merely start
 * with a generated-looking phrase.
 */
export function getLocalizedActivityTitle(
  activity: ActivityTitleInput | null | undefined,
  translate: ActivityTitleTranslator,
  fallback = translate("untitled"),
) {
  for (const candidate of [activity?.title, activity?.activityName]) {
    const value = candidate?.trim();
    if (!value || value.toUpperCase() === "UNKNOWN") continue;

    const generated = parseGeneratedActivityTitle(value);
    if (!generated) return localizeDemoActivityTitle(value, translate) ?? value;

    const sport = sportFromType(activity?.sportType) ?? generated.sport;
    const period =
      periodFromActivityTime(activity?.startTime, activity?.timezone) ??
      generated.period;
    return translate(`periods.${period}`, {
      sport: translate(`sports.${sport}`),
    });
  }

  return fallback;
}

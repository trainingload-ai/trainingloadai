import { isRecord } from "./ai-coach-run-contract";

export type CoachCompetitionEvents = {
  kind: "competition_events";
  startDate: string;
  endDate: string;
  total: number;
  events: Array<{ title: string; startDate: string; endDate: string | null }>;
};

const ymd = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Explicit public projection: never expose notes, user IDs or internal data. */
export function projectCoachCompetitionEvents(
  input: unknown,
  output: unknown,
): CoachCompetitionEvents | null {
  if (
    !isRecord(input) ||
    !ymd(input.startDate) ||
    !ymd(input.endDate) ||
    !isRecord(output) ||
    !Array.isArray(output.events) ||
    !output.events.every(
      (event) =>
        isRecord(event) &&
        typeof event.title === "string" &&
        event.title.trim().length > 0 &&
        ymd(event.startDate) &&
        (event.endDate == null || ymd(event.endDate)),
    )
  )
    return null;
  return {
    kind: "competition_events",
    startDate: input.startDate,
    endDate: input.endDate,
    total: output.events.length,
    events: output.events.slice(0, 100).map((event) => ({
      title: event.title.slice(0, 200),
      startDate: event.startDate,
      endDate: event.endDate ?? null,
    })),
  };
}

export function parseCoachCompetitionEvents(
  value: unknown,
): CoachCompetitionEvents | null {
  if (!isRecord(value) || value.kind !== "competition_events") return null;
  const projected = projectCoachCompetitionEvents(value, value);
  if (
    !projected ||
    !Number.isSafeInteger(value.total) ||
    (value.total as number) < projected.total
  )
    return null;
  return { ...projected, total: value.total as number };
}

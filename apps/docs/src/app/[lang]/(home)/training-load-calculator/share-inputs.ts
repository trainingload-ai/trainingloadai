import {
  EXAMPLE_PMC_STARTING_ATL,
  EXAMPLE_PMC_STARTING_CTL,
  examplePmcWeek,
  MAX_PMC_DAYS,
  MIN_PMC_DAYS,
} from "@/lib/pmc-ewma";
import { parseNonNegativeNumber } from "@/lib/tss";

export type TrainingLoadInputs = { ctl: string; atl: string; tss: string[] };

function readNumber(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= 32 && parseNonNegativeNumber(text) != null
    ? text
    : null;
}

export function readTrainingLoadInputs(
  params: Record<string, string | string[] | undefined>,
): TrainingLoadInputs {
  const days =
    typeof params.tss === "string" && params.tss.length <= MAX_PMC_DAYS * 33
      ? params.tss.split(",").map(readNumber)
      : [];
  return {
    ctl: readNumber(params.ctl) ?? String(EXAMPLE_PMC_STARTING_CTL),
    atl: readNumber(params.atl) ?? String(EXAMPLE_PMC_STARTING_ATL),
    tss:
      days.length >= MIN_PMC_DAYS &&
      days.length <= MAX_PMC_DAYS &&
      days.every((day) => day !== null)
        ? (days as string[])
        : examplePmcWeek().map(String),
  };
}

import { createHash } from "node:crypto";
import type {
  PmcProjectionPoint,
  PmcProjectionResult,
  PmcProjectionScope,
  PmcProjectionScenario,
} from "../../../../packages/shared/pmc-projection";
import {
  advancePmc,
  projectPmc,
  projectionModel,
  shiftPmcDay,
} from "../../../server/src/training-load/pmc-projection";

// Explicit synthetic athlete data. Browser checks validate presentation, not predictive accuracy.
export function pmcFixture(
  scope: PmcProjectionScope = "ALL",
  scenario: PmcProjectionScenario = "AUTO",
  historyDays = 60,
  state: "ready" | "partial" | "cold" | "missing" | "empty" = "ready",
): PmcProjectionResult {
  const today = "2026-11-11";
  const loads = new Map<string, number | null>();
  const plans = new Map<
    string,
    { load: number | null; approximate: boolean }
  >();
  const history: PmcProjectionPoint[] = [];
  const factor =
    scope === "RUN"
      ? 0.62
      : scope === "SWIM"
        ? 0.25
        : scope === "CYCLING"
          ? 0.8
          : 1;
  const week = [74, 0, 64, 58, 70, 0, 105];
  let seed =
    state === "cold" || state === "empty"
      ? { ctl: 0, atl: 0, tsb: 0 }
      : { ctl: 42 * factor, atl: 48 * factor, tsb: -6 * factor };
  let yesterday = seed;
  for (
    let i = state === "cold" ? -12 : state === "empty" ? 1 : -90;
    i <= 0;
    i++
  ) {
    const date = shiftPmcDay(today, i);
    const load = (i === 0 ? 28 : week[new Date(date).getUTCDay()]) * factor;
    loads.set(date, load);
    seed = advancePmc(seed.ctl, seed.atl, load);
    if (i < 0) yesterday = seed;
    if (i >= -historyDays && (state !== "cold" || i >= -12))
      history.push({
        date,
        load,
        ...seed,
        basis: "ACTUAL",
        plannedLoad: null,
        habitLoad: null,
      });
  }
  if (state === "missing") {
    loads.set(shiftPmcDay(today, -4), null);
    for (const point of history) {
      if (point.date >= shiftPmcDay(today, -4))
        Object.assign(point, { ctl: null, atl: null, tsb: null });
      if (point.date === shiftPmcDay(today, -4)) point.load = null;
    }
  }
  for (let i = 0; i <= 28; i++) {
    const date = shiftPmcDay(today, i);
    const weekday = new Date(date).getUTCDay();
    if (weekday === 2 || weekday === 4 || weekday === 6)
      plans.set(date, {
        load: 72 * factor * (i < 21 ? 1.12 : 0.7),
        approximate: false,
      });
  }
  if (state === "partial")
    plans.set(shiftPmcDay(today, 4), { load: null, approximate: false });
  if (state === "empty") plans.clear();
  const result = {
    ...projectPmc({
      today,
      scenario,
      historyStart:
        state === "empty"
          ? null
          : state === "cold"
            ? shiftPmcDay(today, -12)
            : "2026-06-01",
      loads,
      plans,
      yesterday,
      baselineMissing: state === "missing",
    }),
    asOf: "2026-11-11T04:00:00Z",
    today,
    targetDate: shiftPmcDay(today, 28),
    timezone: "Asia/Shanghai",
    scope,
    scenario,
    model: projectionModel,
    current: history.at(-1) ?? null,
    history,
    baseline: {
      date: shiftPmcDay(today, -1),
      ctl: yesterday.ctl,
      atl: yesterday.atl,
      initializedFromZero: false,
    },
    loadSources: {
      actual: ["POWER", "HEART_RATE"],
      planned: ["POWER", "PACE"],
    },
  };
  return {
    ...result,
    projectionId: createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex"),
  };
}

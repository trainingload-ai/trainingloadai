"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { addCalendarDays } from "@shared/plan-calendar";
import { calendarMonthEnd, type RollingMonthDraft } from "@shared/rolling-plan";

function WeeklyTargetRanges({
  loadRange,
  durationMinutesRange,
}: Pick<
  RollingMonthDraft["weekFocus"][number],
  "loadRange" | "durationMinutesRange"
>) {
  const t = useTranslations("RollingPlan");
  const format = useFormatter();
  if (loadRange === undefined && durationMinutesRange === undefined)
    return null;

  return (
    <p className="text-muted-foreground">
      {loadRange
        ? `${t("unit")} ${format.number(loadRange.min)}–${format.number(loadRange.max)}`
        : `${t("unit")} · ${t("unknown")}`}
      {durationMinutesRange
        ? ` · ${format.number(durationMinutesRange.min)}–${format.number(durationMinutesRange.max, { style: "unit", unit: "minute" })}`
        : null}
    </p>
  );
}

type TargetRange = NonNullable<RollingMonthDraft["durationMinutesRange"]>;

const trendIcons = {
  higher: TrendingUp,
  lower: TrendingDown,
  steady: Minus,
};

function compareTargetRanges(
  range: TargetRange,
  previous?: TargetRange | null,
): keyof typeof trendIcons | null {
  if (!previous) return null;
  if (range.min === previous.min && range.max === previous.max) return "steady";
  if (range.min >= previous.min && range.max >= previous.max) return "higher";
  if (range.min <= previous.min && range.max <= previous.max) return "lower";
  return null;
}

export function RollingMonthTargets({
  month,
  effectiveFrom,
  previousMonth,
  showWeeklyTargets = false,
}: {
  month: RollingMonthDraft;
  effectiveFrom: string;
  previousMonth?: Omit<RollingMonthDraft, "monthStart"> | null;
  showWeeklyTargets?: boolean;
}) {
  const t = useTranslations("RollingPlan");
  const format = useFormatter();
  const monthEnd = calendarMonthEnd(month.monthStart);
  const firstDay =
    effectiveFrom > month.monthStart ? effectiveFrom : month.monthStart;
  const targets = [
    {
      label: t("targetDistance"),
      range: month.runningDistanceKmRange,
      previous: previousMonth?.runningDistanceKmRange,
      unit: "kilometer",
    },
    {
      label: t("targetDuration"),
      range: month.durationMinutesRange,
      previous: previousMonth?.durationMinutesRange,
      unit: "minute",
    },
    {
      label: t("targetLoad"),
      range: month.loadRange,
      previous: previousMonth?.loadRange,
    },
  ].flatMap(({ label, range, previous, unit }) => {
    if (!range) return [];
    const numberOptions = { maximumFractionDigits: 1 };
    const high = format.number(range.max, unit
      ? { ...numberOptions, style: "unit", unit }
      : numberOptions);
    return [{
      label,
      value: range.min === range.max
        ? high
        : `${format.number(range.min, numberOptions)}–${high}`,
      trend: compareTargetRanges(range, previous),
    }];
  });
  const changeReason = targets.some(({ trend }) => trend === "higher" || trend === "lower")
    ? month.monthOverMonthReason?.trim()
    : undefined;

  return (
    <>
      <p className="leading-relaxed">{month.objective}</p>
      {targets.length > 0 ? (
        <div className="space-y-2">
          {firstDay > month.monthStart ? (
            <p className="text-xs text-muted-foreground">
              {t("targetWindow", { from: firstDay, through: monthEnd })}
            </p>
          ) : null}
          <dl className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
            {targets.map(({ label, value, trend }) => {
              const TrendIcon = trend ? trendIcons[trend] : null;
              return (
                <div key={label} className="min-w-0 space-y-1 rounded-surface bg-background/80 px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-base font-semibold tabular-nums">{value}</span>
                    {previousMonth !== undefined ? (
                      <span className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {TrendIcon ? <TrendIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                        {t(`targetTrend.${trend ?? "unavailable"}`)}
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          {changeReason ? <p className="leading-relaxed text-muted-foreground">{changeReason}</p> : null}
        </div>
      ) : null}
      {showWeeklyTargets && month.weekFocus.length > 0 ? (
        <ul className="space-y-1">
          {month.weekFocus.map((week) => {
            const weekEnd = addCalendarDays(week.weekStart, 6);
            const from = firstDay > week.weekStart ? firstDay : week.weekStart;
            const through = monthEnd < weekEnd ? monthEnd : weekEnd;
            if (from > through) return null;
            const range = from === through ? from : `${from} – ${through}`;
            return (
              <li key={week.weekStart}>
                <p>
                  {range} · {week.focus}
                </p>
                <WeeklyTargetRanges {...week} />
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

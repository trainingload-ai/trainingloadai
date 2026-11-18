"use client";

import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { addCalendarDays } from "@shared/plan-calendar";
import { calendarMonthEnd } from "@shared/rolling-plan";
import { getPlanWindowSnapshot, type TrainingPlanDetail } from "@/api/plans";
import { queryKeys } from "@/lib/query-keys";
import { isRollingPlan } from "@/lib/rolling-plan";
import { Button } from "@/components/ui/button";
import { formatPlanLoadDisplay } from "./detail/plan-detail-utils";

const SOURCE_KEYS: Record<string, "POWER" | "HR" | "PACE" | "RPE"> = {
  POWER: "POWER",
  HEART_RATE: "HR",
  HR: "HR",
  PACE: "PACE",
  SESSIONRPE: "RPE",
  SESSION_RPE: "RPE",
  RPE: "RPE",
};

export function RollingPlanLoadSummary({ plan }: { plan: TrainingPlanDetail }) {
  if (!isRollingPlan(plan) || !plan.startDate || plan.status === "DRAFT")
    return null;
  return <MonthLoad plan={plan} />;
}

function MonthLoad({ plan }: { plan: TrainingPlanDetail }) {
  const t = useTranslations("RollingPlan");
  const sourceT = useTranslations("WorkoutLoadEstimate");
  const start = plan.startDate!.slice(0, 10);
  const current =
    plan.currentWeekIndex && plan.currentDayIndex
      ? addCalendarDays(
          start,
          (plan.currentWeekIndex - 1) * 7 + plan.currentDayIndex - 1,
        )
      : dayjs().format("YYYY-MM-DD");
  const month = current > start ? current : start;
  const from =
    `${month.slice(0, 7)}-01` > start ? `${month.slice(0, 7)}-01` : start;
  const through = calendarMonthEnd(month);
  const snapshot = useQuery({
    queryKey: queryKeys.plans.windowSnapshot(plan.id, from, through),
    queryFn: async () => {
      const result = await getPlanWindowSnapshot(plan.id, from, through);
      if (!result?.load) throw new Error("Plan load snapshot unavailable");
      return result;
    },
    retry: false,
  });
  return (
    <section className="space-y-2 pt-2">
      <h2 className="text-sm font-semibold">{t("loadTitle")}</h2>
      <p className="text-xs text-muted-foreground">
        {snapshot.data?.window.from ?? from} –{" "}
        {snapshot.data?.window.through ?? through}
      </p>
      {snapshot.isError ? (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>{t("loadError")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void snapshot.refetch()}
          >
            {t("retryLoad")}
          </Button>
        </div>
      ) : null}
      <dl className="grid gap-3 pc:grid-cols-3">
        {(["actual", "remainingPlanned", "ungeneratedForecast"] as const).map(
          (key) => {
            const metric = snapshot.data?.load[key];
            return (
              <div key={key} className="min-w-0 space-y-1">
                <dt className="text-xs text-muted-foreground">{t(key)}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  <span>
                    {metric?.value == null
                      ? t("unknown")
                      : formatPlanLoadDisplay(metric.value)}
                  </span>
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {t("unit")}
                  </span>
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {t(`coverage.${metric?.coverage ?? "UNKNOWN"}`)}
                  {metric?.totalCount != null
                    ? ` · ${t("observedCount", { known: metric.knownCount ?? 0, total: metric.totalCount })}`
                    : null}
                </dd>
                {metric?.sources?.length ? (
                  <dd className="text-xs text-muted-foreground">
                    {t("sources", {
                      sources: metric.sources
                        .map((source) =>
                          SOURCE_KEYS[source]
                            ? sourceT(`source.${SOURCE_KEYS[source]}`)
                            : t("unknown"),
                        )
                        .join(" · "),
                    })}
                  </dd>
                ) : null}
              </div>
            );
          },
        )}
      </dl>
      <p className="text-xs leading-5 text-muted-foreground">{t("loadHint")}</p>
    </section>
  );
}

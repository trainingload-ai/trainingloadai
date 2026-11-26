"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { findComparablePreviousMonth } from "@shared/rolling-plan";
import type { PlanMonthDirection, TrainingPlanDetail } from "@/api/plans";
import {
  AdaptiveDialog,
  AdaptiveDialogClose,
  AdaptiveDialogContent,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { isRollingPlan } from "@/lib/rolling-plan";
import { getRollingPlanCurrentDate } from "./detail/plan-detail-utils";
import { RollingMonthTargets } from "./rolling-month-targets";

export function RollingPlanMonthDirection({
  plan,
}: {
  plan: TrainingPlanDetail;
}) {
  const t = useTranslations("RollingPlan");
  const shared = useTranslations("SharedUI");
  const historyTitleId = useId();
  if (!isRollingPlan(plan)) return null;
  const currentMonth = `${getRollingPlanCurrentDate(plan).slice(0, 7)}-01`;
  const directions = (plan.monthDirections ?? []).filter((month) => month.strategy.objective.trim());
  const current = directions.find((month) => month.monthStart === currentMonth);
  const history = directions.filter((month) => month.monthStart < currentMonth)
    .sort((a, b) => b.monthStart.localeCompare(a.monthStart));
  if (!current && history.length === 0) return null;

  return (
    <div className="space-y-1">
      {current ? (
        <MonthDirectionDetails direction={current} directions={directions} label={t("currentMonthDirection")} />
      ) : null}
      {history.length > 0 ? (
        <div className="flex justify-end">
          <AdaptiveDialog>
            <AdaptiveDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                {t("monthHistory")}
              </Button>
            </AdaptiveDialogTrigger>
            <AdaptiveDialogContent
              className="flex max-h-[86dvh] flex-col gap-3"
              desktopClassName="max-w-2xl"
              mobileClassName="px-3 pb-4"
              desktopProps={{
                "aria-labelledby": historyTitleId,
                "aria-describedby": undefined,
                showCloseButton: false,
              }}
              mobileProps={{ "aria-labelledby": historyTitleId, "aria-describedby": undefined }}
            >
              <AdaptiveDialogHeader className="shrink-0 text-left">
                <AdaptiveDialogTitle id={historyTitleId}>{t("monthHistory")}</AdaptiveDialogTitle>
              </AdaptiveDialogHeader>
              <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain">
                {history.map((month) => (
                  <MonthDirectionDetails
                    key={month.monthStart}
                    direction={month}
                    directions={directions}
                    label={t("monthDirection", { month: month.monthStart.slice(0, 7) })}
                  />
                ))}
              </div>
              <AdaptiveDialogFooter className="shrink-0">
                <AdaptiveDialogClose asChild>
                  <Button variant="outline" size="sm">{shared("close")}</Button>
                </AdaptiveDialogClose>
              </AdaptiveDialogFooter>
            </AdaptiveDialogContent>
          </AdaptiveDialog>
        </div>
      ) : null}
    </div>
  );
}

function MonthDirectionDetails({ direction, directions, label }: {
  direction: PlanMonthDirection;
  directions: PlanMonthDirection[];
  label: string;
}) {
  const previousMonth = findComparablePreviousMonth(direction, directions);

  return (
    <details className="rounded-surface bg-neutral-100 px-3 dark:bg-muted/45">
      <summary className="cursor-pointer py-2.5 text-sm font-semibold">
        {label}
      </summary>
      <div className="space-y-3 pb-3 text-sm">
        <RollingMonthTargets
          month={{ ...direction.strategy, monthStart: direction.monthStart }}
          effectiveFrom={direction.effectiveFrom}
          previousMonth={previousMonth?.strategy ?? null}
        />
      </div>
    </details>
  );
}

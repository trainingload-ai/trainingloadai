"use client";

import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { addCalendarDays } from "@shared/plan-calendar";
import type { TrainingPlanDetail } from "@/api/plans";
import { isRollingPlan } from "@/lib/rolling-plan";

export function RollingPlanMonthDirection({
  plan,
}: {
  plan: TrainingPlanDetail;
}) {
  const t = useTranslations("RollingPlan");
  if (!isRollingPlan(plan)) return null;
  const currentDate =
    plan.startDate && plan.currentWeekIndex && plan.currentDayIndex
      ? addCalendarDays(
          plan.startDate.slice(0, 10),
          (plan.currentWeekIndex - 1) * 7 + plan.currentDayIndex - 1,
        )
      : dayjs().format("YYYY-MM-DD");
  const directions = plan.monthDirections ?? [];
  const current =
    directions.find(
      (month) => month.monthStart.slice(0, 7) === currentDate.slice(0, 7),
    ) ??
    directions
      .filter((month) => month.monthStart > currentDate)
      .sort((a, b) => a.monthStart.localeCompare(b.monthStart))[0];
  if (!current?.strategy.objective.trim()) return null;
  return (
    <section className="space-y-1">
      <h2 className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
        {t("monthDirection", { month: current.monthStart.slice(0, 7) })}
      </h2>
      <p className="text-sm leading-5 text-foreground">
        {current.strategy.objective}
      </p>
    </section>
  );
}

"use client";

import dayjs from "dayjs";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PlanStatus } from "@/api/plans";
import type { WeekGroup } from "./plan-detail-utils";
import { PlanCycleProgressChart } from "../plan-cycle-progress-chart";
import { summarizePlanCycleProgress } from "../plan-cycle-progress-model";

export function detailCycleProgress(
  weeks: WeekGroup[],
  todayKey: string,
  status: PlanStatus,
) {
  const currentWeek =
    status === "ACTIVE"
      ? weeks.find((week) => week.days.some((day) => day.dateKey === todayKey))
          ?.weekIndex
      : undefined;
  const data = weeks.map((week) => {
    const dates = week.days.flatMap((day) =>
      day.dateKey ? [day.dateKey] : [],
    );
    const phase =
      dates.length && dates.every((date) => date < todayKey)
        ? "past"
        : dates.some((date) => date <= todayKey)
          ? "current"
          : "future";
    return {
      week: week.weekIndex,
      ...summarizePlanCycleProgress(
        week.days.flatMap((day) => day.workouts),
        {
          phase,
          todayKey,
          currentDayIndex:
            week.days.find((day) => day.dateKey === todayKey)?.dayIndex ?? null,
        },
      ),
    };
  });
  return {
    data,
    currentKey: currentWeek == null ? undefined : String(currentWeek),
  };
}

export function PlanDetailCycleProgress({
  weeks,
  status,
}: {
  weeks: WeekGroup[];
  status: PlanStatus;
}) {
  const t = useTranslations("V2PlanPage");
  const { data, currentKey } = detailCycleProgress(
    weeks,
    dayjs().format("YYYY-MM-DD"),
    status,
  );
  const [selected, setSelected] = useState<string>();
  return (
    <PlanCycleProgressChart
      ariaLabel={t("weekStrip.title")}
      currentKey={currentKey}
      selectedKey={selected ?? currentKey ?? String(weeks[0]?.weekIndex ?? "")}
      onPointSelect={(key) => {
        setSelected(key);
        document
          .getElementById(`plan-detail-week-${key}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}
      labels={{
        completed: t("workout.status.done"),
        missed: t("workout.status.overdue"),
        skipped: t("workout.status.skipped"),
        moved: t("workout.status.moved"),
        pending: t("workout.status.planned"),
      }}
      data={data.map(({ week, ...counts }) => ({
        ...counts,
        key: String(week),
        selectionKey: String(week),
        label: t("weekLoad.currentWeek", { week }),
      }))}
    />
  );
}

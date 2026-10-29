"use client";

import React from "react";
import { Dayjs } from "dayjs";
import type { Activity, SportType } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import { getSportTypeIcon } from "@/utils/sportTypeUtils";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import { getCalendarSportSurfaceClass } from "./calendar-ui-utils";
import { getSportDisplayName, type SportDefinition } from "@/api/sports";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

interface DayCellProps {
  date: Dayjs;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities?: Activity[];
  planWorkouts?: PlanWorkout[];
  className?: string;
  tss?: number;
  isSelected?: boolean;
  onSelect?: () => void;
  sportCatalog?: SportDefinition[];
}

const DayCell: React.FC<DayCellProps> = ({
  date,
  isCurrentMonth,
  isToday,
  activities = [],
  planWorkouts = [],
  className,
  tss = 0,
  isSelected = false,
  onSelect,
  sportCatalog = [],
}) => {
  const { systemUnit } = useStore();
  const t = useTranslations("DayCell");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tSports = useTranslations("SportCatalog");
  const activityBars = activities?.slice(0, 1) || [];
  const planBars = planWorkouts?.slice(0, 1) || [];

  const getTssClasses = (tss: number) => {
    if (tss === 0) return "hidden";
    if (tss < 50)
      return "bg-[hsl(var(--purple-50))] border-[hsl(var(--purple-100))] text-[hsl(var(--purple-600))] dark:bg-[hsl(var(--purple-900))]/20 dark:border-[hsl(var(--purple-800))]/50 dark:text-[hsl(var(--purple-400))]";
    if (tss < 100)
      return "bg-[hsl(var(--purple-200))] border-[hsl(var(--purple-300))] text-[hsl(var(--purple-800))] dark:bg-[hsl(var(--purple-800))]/60 dark:border-[hsl(var(--purple-700))] dark:text-[hsl(var(--purple-200))]";
    return "bg-[hsl(var(--purple-500))] border-[hsl(var(--purple-600))] text-white dark:bg-[hsl(var(--purple-600))] dark:border-[hsl(var(--purple-500))] dark:text-white";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        "relative flex h-full min-h-[108px] flex-col gap-1 rounded-md p-1.5 transition-colors md:p-2",
        isSelected && "bg-primary/5 ring-1 ring-primary/40",
        !isCurrentMonth &&
          "opacity-60 bg-neutral-100/80 dark:bg-neutral-900/50",
        isToday && "border-2 border-primary/50",
        className,
      )}
    >
      <div className="flex items-center justify-between shrink-0 gap-2">
        {isToday ? (
          <div className="rounded-xs bg-primary px-1.5 py-0.5 text-mobile-unit pc:text-[10px] text-primary-foreground">
            {date.format("DD")}
          </div>
        ) : (
          <span className="text-mobile-caption pc:text-xs text-muted-foreground">
            {date.format("DD")}
          </span>
        )}
        {tss > 0 ? (
          <div
            className={`text-mobile-unit pc:text-[10px] min-w-7 text-center px-1.5 py-0.5 rounded-xs border ${getTssClasses(tss)} font-extrabold`}
          >
            {Math.round(tss)}
          </div>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-1 mt-1 min-h-0">
          {planBars.map((planWorkout) => (
            <div
              key={planWorkout.id}
              className={cn(
                "min-h-5 p-1 w-full rounded-xs text-mobile-caption pc:text-[11px] font-medium",
                getCalendarSportSurfaceClass(planWorkout.sportType),
              )}
              title={`${t("planTitle")}｜${planWorkout.notes || planWorkout.text || ""}`}
            >
              <span className="line-clamp-2 break-words">
                {planWorkout.notes?.trim() ||
                  planWorkout.name?.trim() ||
                  planWorkout.text}
              </span>
            </div>
          ))}
          {planWorkouts.length > planBars.length ? (
            <div className="text-mobile-unit pc:text-[10px] text-muted-foreground/80">
              +{planWorkouts.length - planBars.length} {t("moreTraining")}
            </div>
          ) : null}
          {activityBars.map((act, idx) => (
            <Link
              key={idx}
              href={`/activities/${act.hashId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "min-h-5 p-1 w-full rounded-xs text-mobile-caption pc:text-[11px] cursor-pointer",
                getCalendarSportSurfaceClass(act.sportType),
              )}
              title={`${getLocalizedActivityTitle(act, tActivityTitle, t("activity"))} ｜ ${getSportDisplayName(sportCatalog, act, tSports)} ｜ ${t("distance")} ${formatValue(act.distance || 0, "distance", systemUnit)} ｜ ${t("duration")} ${formatValue(act.duration || 0, "duration", systemUnit)}`}
            >
              <div className="flex items-center gap-1 overflow-hidden">
                {getSportTypeIcon(
                  act.sportType as SportType,
                  "w-3 h-3 shrink-0",
                )}
                <span className="whitespace-nowrap truncate">
                  {getSportDisplayName(sportCatalog, act, tSports)} ·{" "}
                  {formatValue(act.distance || 0, "distance", systemUnit)}{" "}
                  {getUnit("distance", systemUnit)} ·{" "}
                  {formatValue(act.duration || 0, "duration", systemUnit)}{" "}
                  {getUnit("duration", systemUnit)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DayCell;

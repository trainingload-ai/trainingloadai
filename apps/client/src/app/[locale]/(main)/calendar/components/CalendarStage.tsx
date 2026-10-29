"use client";

import React from "react";
import dayjs, { type Dayjs } from "dayjs";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import { cn } from "@/lib/utils";
import { CalendarDayButton } from "./CalendarDayButton";
import type { CompetitionEvent } from "@/api/competition-events";

import "dayjs/locale/zh-cn";

type CompetitionSegment = {
  event: CompetitionEvent;
  startColumn: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

function buildCompetitionSegments(
  week: Dayjs[],
  eventsByDate: Record<string, CompetitionEvent[]>,
): CompetitionSegment[] {
  const weekStart = week[0]?.startOf("day");
  const weekEnd = week[6]?.startOf("day");
  if (!weekStart || !weekEnd) return [];

  const uniqueEvents = new Map<string, CompetitionEvent>();
  for (const date of week) {
    for (const event of eventsByDate[date.format("YYYY-MM-DD")] ?? []) {
      uniqueEvents.set(event.id, event);
    }
  }

  const pending = [...uniqueEvents.values()]
    .map((event) => {
      const eventStart = dayjs(event.startDate).startOf("day");
      const eventEnd = dayjs(event.endDate || event.startDate).startOf("day");
      const segmentStart = eventStart.isBefore(weekStart)
        ? weekStart
        : eventStart;
      const segmentEnd = eventEnd.isAfter(weekEnd) ? weekEnd : eventEnd;
      const startColumn = segmentStart.diff(weekStart, "day");
      const endColumn = segmentEnd.diff(weekStart, "day");
      return {
        event,
        startColumn,
        span: endColumn - startColumn + 1,
        lane: 0,
        continuesBefore: eventStart.isBefore(weekStart),
        continuesAfter: eventEnd.isAfter(weekEnd),
      };
    })
    .filter((segment) => segment.span > 0)
    .sort((a, b) => a.startColumn - b.startColumn || b.span - a.span);

  const laneEndColumns: number[] = [];
  for (const segment of pending) {
    const lane = laneEndColumns.findIndex(
      (endColumn) => endColumn < segment.startColumn,
    );
    segment.lane = lane === -1 ? laneEndColumns.length : lane;
    laneEndColumns[segment.lane] = segment.startColumn + segment.span - 1;
  }
  return pending;
}

type CalendarStageProps = {
  currentMonth: Dayjs;
  weeks: Dayjs[][];
  selectedWeek: Dayjs[];
  selectedDate: Dayjs;
  displayMode: "week" | "month";
  navigationDirection: 1 | -1;
  onSelectDate: (date: Dayjs) => void;
  onSelectCompetition: (event: CompetitionEvent) => void;
  onSelectWorkout?: (workout: PlanWorkout, date: Dayjs) => void;
  onPrev: () => void;
  onNext: () => void;
  activitiesByDate: Record<string, Activity[]>;
  workoutsByDate: Record<string, PlanWorkout[]>;
  competitionEventsByDate: Record<string, CompetitionEvent[]>;
  tssByDate: Record<string, number>;
  range?: {
    startOfWeek: Dayjs;
    end: Dayjs;
  } | null;
  className?: string;
};

const stageVariants = {
  initial: (direction: 1 | -1) => ({
    opacity: 0,
    x: direction > 0 ? 20 : -20,
  }),
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: (direction: 1 | -1) => ({
    opacity: 0,
    x: direction > 0 ? -20 : 20,
  }),
};

export function CalendarStage({
  currentMonth,
  weeks,
  selectedWeek,
  selectedDate,
  displayMode,
  navigationDirection,
  onSelectDate,
  onSelectCompetition,
  onSelectWorkout,
  onPrev,
  onNext,
  activitiesByDate,
  workoutsByDate,
  competitionEventsByDate,
  tssByDate,
  range,
  className,
}: CalendarStageProps) {
  const locale = useLocale();
  const t = useTranslations("CalendarExperience");
  const tCompetition = useTranslations("CompetitionEvents");
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [highlightedCompetitionId, setHighlightedCompetitionId] =
    React.useState<string | null>(null);

  const weekdayLabels = React.useMemo(() => {
    const dayjsLocale = locale.startsWith("zh") ? "zh-cn" : "en";
    const start = dayjs().locale(dayjsLocale).startOf("week");
    return Array.from({ length: 7 }, (_, index) =>
      start.add(index, "day").format(locale.startsWith("zh") ? "dd" : "ddd"),
    );
  }, [locale]);

  const visibleWeeks = displayMode === "week" ? [selectedWeek] : weeks;
  const contentKey =
    displayMode === "week"
      ? `${displayMode}-${selectedWeek[0]?.format("YYYY-MM-DD")}`
      : `${displayMode}-${currentMonth.format("YYYY-MM")}`;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-md bg-neutral-100 dark:bg-muted/45 p-2.5 md:p-3",
        className,
      )}
    >
      <div className="mb-2">
        <div className="text-mobile-caption pc:text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {displayMode === "week" ? t("weekModeLabel") : t("monthModeLabel")}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2 px-0.5 pb-1.5">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-mobile-caption pc:text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="touch-pan-y select-none"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          if (!touchStartRef.current) return;
          const touch = event.changedTouches[0];
          const offsetX = touch.clientX - touchStartRef.current.x;
          const offsetY = touch.clientY - touchStartRef.current.y;
          touchStartRef.current = null;

          if (Math.abs(offsetX) < 42 || Math.abs(offsetX) < Math.abs(offsetY)) {
            return;
          }

          if (offsetX < 0) {
            onNext();
            return;
          }

          onPrev();
        }}
      >
        <AnimatePresence mode="wait" custom={navigationDirection}>
          <motion.div
            key={contentKey}
            custom={navigationDirection}
            variants={stageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-1"
          >
            {visibleWeeks.map((week) => {
              const competitionSegments = buildCompetitionSegments(
                week,
                competitionEventsByDate,
              );
              return (
                <div key={week[0]?.format("YYYY-MM-DD")} className="relative">
                  <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {week.map((date, columnIndex) => {
                      const key = date.format("YYYY-MM-DD");
                      const inPlanRange = Boolean(
                        range &&
                        (date.isSame(range.startOfWeek, "day") ||
                          date.isAfter(range.startOfWeek)) &&
                        (date.isSame(range.end, "day") ||
                          date.isBefore(range.end)),
                      );
                      return (
                        <CalendarDayButton
                          key={key}
                          date={date}
                          isCurrentMonth={date.month() === currentMonth.month()}
                          isToday={date.isSame(dayjs(), "day")}
                          isSelected={date.isSame(selectedDate, "day")}
                          activities={activitiesByDate[key]}
                          planWorkouts={workoutsByDate[key]}
                          competitionLaneCount={competitionSegments.reduce(
                            (laneCount, segment) =>
                              columnIndex >= segment.startColumn &&
                              columnIndex < segment.startColumn + segment.span
                                ? Math.max(laneCount, segment.lane + 1)
                                : laneCount,
                            0,
                          )}
                          tss={tssByDate[key] || 0}
                          inPlanRange={inPlanRange}
                          onSelect={() => onSelectDate(date)}
                          onSelectWorkout={
                            onSelectWorkout
                              ? (workout) => onSelectWorkout(workout, date)
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                  {competitionSegments.length > 0 ? (
                    <div
                      aria-label={tCompetition("calendar.title")}
                      className="pointer-events-none absolute inset-x-0 top-8 z-20 hidden grid-cols-7 gap-x-2 gap-y-0.5 md:grid"
                      style={{ gridAutoRows: "20px" }}
                    >
                      {competitionSegments.map((segment) => (
                        <button
                          key={segment.event.id}
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            onSelectCompetition(segment.event);
                          }}
                          onPointerEnter={() =>
                            setHighlightedCompetitionId(segment.event.id)
                          }
                          onPointerLeave={() =>
                            setHighlightedCompetitionId(null)
                          }
                          onFocus={() =>
                            setHighlightedCompetitionId(segment.event.id)
                          }
                          onBlur={() => setHighlightedCompetitionId(null)}
                          className={cn(
                            "pointer-events-auto flex h-5 min-w-0 items-center gap-1 overflow-hidden bg-[hsl(var(--blue-100))] px-1.5 text-left text-mobile-unit pc:text-[10px] font-semibold text-[hsl(var(--blue-800))] transition-colors hover:bg-[hsl(var(--blue-200))] focus-visible:z-30 focus-visible:outline-none dark:bg-[hsl(var(--blue-950)/0.28)] dark:text-[hsl(var(--blue-200)/0.82)] dark:hover:bg-[hsl(var(--blue-900)/0.42)] md:px-2 md:text-mobile-caption",
                            !segment.continuesBefore && "ml-2.5 rounded-l-md",
                            !segment.continuesAfter && "mr-2.5 rounded-r-md",
                            highlightedCompetitionId === segment.event.id &&
                              "bg-[hsl(var(--blue-200))] dark:bg-[hsl(var(--blue-900)/0.42)]",
                            segment.event.status === "CANCELLED" &&
                              "bg-muted text-muted-foreground line-through dark:bg-muted/70",
                          )}
                          style={{
                            gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
                            gridRow: segment.lane + 1,
                          }}
                          title={segment.event.title}
                        >
                          <span className="truncate">
                            {segment.event.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {competitionSegments.length > 0 ? (
                    <div
                      aria-label={tCompetition("calendar.title")}
                      className="mt-1.5 space-y-1 md:hidden"
                    >
                      {competitionSegments.map((segment) => (
                        <button
                          key={segment.event.id}
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            onSelectCompetition(segment.event);
                          }}
                          className={cn(
                            "flex w-full min-w-0 items-center justify-between gap-3 rounded-md bg-[hsl(var(--blue-100))] px-3 py-2 text-left text-[hsl(var(--blue-800))] transition-colors hover:bg-[hsl(var(--blue-200))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--blue-400))] dark:bg-[hsl(var(--blue-950)/0.28)] dark:text-[hsl(var(--blue-200)/0.82)] dark:hover:bg-[hsl(var(--blue-900)/0.42)]",
                            segment.event.status === "CANCELLED" &&
                              "bg-muted text-muted-foreground line-through dark:bg-muted/70",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-mobile-caption pc:text-xs font-semibold">
                            {segment.event.title}
                          </span>
                          <span className="shrink-0 text-mobile-unit pc:text-[10px] font-medium opacity-70">
                            {dayjs(segment.event.startDate).format("MM/DD")}
                            {segment.event.endDate &&
                            segment.event.endDate !== segment.event.startDate
                              ? ` – ${dayjs(segment.event.endDate).format("MM/DD")}`
                              : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

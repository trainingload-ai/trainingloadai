"use client";

import React from "react";
import dayjs, { type Dayjs } from "dayjs";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import { cn } from "@/lib/utils";
import { useCalendarWeekStartsOn } from "@/lib/calendar-week-start";
import { startOfCalendarWeek } from "./utils";
import { CalendarDayButton, type CalendarWorkoutPresentation } from "./CalendarDayButton";
import {
  calendarToday,
  calendarWorkoutDropRejection,
} from "./calendar-move-model";
import { calendarDropAppearance, calendarDropGridClass, canDropCalendarWorkout } from "./calendar-workout-drop";
import type { CalendarCreateKind } from "./calendar-context-actions";
import {
  useCalendarWeekScroll,
  type NavigateCalendar,
  type SyncCalendarWeek,
} from "./use-calendar-week-scroll";
import type { CompetitionEvent } from "@/api/competition-events";

import { calendarMonthDayLabel, calendarWeekdayLabels } from "./calendar-weekday-labels";

type CompetitionSegment = {
  event: CompetitionEvent;
  startColumn: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

const SCROLL_WINDOW_WEEKS = 6;

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
  visibleMonth?: Dayjs;
  weeks: Dayjs[][];
  selectedWeek: Dayjs[];
  selectedDate: Dayjs;
  displayMode: "week" | "month";
  navigationDirection: 1 | -1;
  onSelectDate: (date: Dayjs) => void;
  onSelectCompetition?: (event: CompetitionEvent) => void;
  onSelectWorkout?: (workout: PlanWorkout, date: Dayjs) => void;
  onMoveWorkout?: (workout: PlanWorkout, targetDate: string) => void;
  getMoveWorkout?: (workout: PlanWorkout) => PlanWorkout | undefined;
  scrollAnchor?: Dayjs | null;
  onScrollMonth?: (direction: 1 | -1, fromMonth?: string) => void;
  onScrollWeek?: SyncCalendarWeek;
  onVisibleMonth?: (month: string) => void;
  onCreateOnDate?: (kind: CalendarCreateKind, date: Dayjs) => void;
  onAdjustSchedule?: (date: Dayjs) => void;
  createWorkoutOnly?: boolean;
  onRequestMove?: (workout: PlanWorkout, trigger?: HTMLElement | null) => void;
  presentWorkout?: (workout: PlanWorkout) => CalendarWorkoutPresentation;
  onPrev: () => void;
  onNext: () => void;
  activitiesByDate: Record<string, Activity[]>;
  workoutsByDate: Record<string, PlanWorkout[]>;
  competitionEventsByDate: Record<string, CompetitionEvent[]>;
  tssByDate?: Record<string, number>;
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
  visibleMonth = currentMonth,
  weeks,
  selectedWeek,
  selectedDate,
  displayMode,
  navigationDirection,
  onSelectDate,
  onSelectCompetition,
  onSelectWorkout,
  onMoveWorkout,
  getMoveWorkout,
  scrollAnchor,
  onScrollMonth,
  onScrollWeek,
  onVisibleMonth,
  onCreateOnDate,
  onAdjustSchedule,
  createWorkoutOnly,
  onRequestMove,
  presentWorkout,
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
  const weekStartsOn = useCalendarWeekStartsOn();
  const t = useTranslations("CalendarExperience");
  const tMove = useTranslations("CalendarMove");
  const tCompetition = useTranslations("CompetitionEvents");
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [highlightedCompetitionId, setHighlightedCompetitionId] =
    React.useState<string | null>(null);
  const [dragged, setDragged] = React.useState<{
    date: string;
    workout: PlanWorkout;
  } | null>(null);
  const draggedDate = dragged?.date;
  const [hoveredDropDate, setHoveredDropDate] = React.useState<string | null>(
    null,
  );
  const today = calendarToday();
  const desktopScroll = Boolean(onScrollMonth);
  const monthStart = weeks[0]?.[0];
  const anchorDay = scrollAnchor
    ? startOfCalendarWeek(scrollAnchor, weekStartsOn)
    : monthStart;
  const anchor = anchorDay?.format("YYYY-MM-DD");
  const navigate: NavigateCalendar = (direction, unit, fromMonth) => {
    if (unit === "month") {
      onScrollMonth?.(direction, fromMonth);
      return;
    }
    if (!anchorDay) return;
    const nextWeek = anchorDay.add(direction, "week");
    onScrollWeek?.(nextWeek.format("YYYY-MM-DD"), nextWeek.add(6, "day").format("YYYY-MM"));
  };
  const scroll = useCalendarWeekScroll(
    desktopScroll ? anchor : undefined,
    visibleMonth.format("YYYY-MM"),
    desktopScroll ? navigate : undefined,
    onScrollWeek,
    onVisibleMonth,
    Boolean(draggedDate),
  );
  const endDrag = () => {
    setDragged(null);
    setHoveredDropDate(null);
  };

  const weekdayLabels = React.useMemo(
    () => calendarWeekdayLabels(locale, weekStartsOn),
    [locale, weekStartsOn],
  );

  const visibleWeeks = displayMode === "week" ? [selectedWeek] : weeks;
  const firstVisibleWeek =
    scroll.visibleWeek && !draggedDate ? dayjs(scroll.visibleWeek) : anchorDay;
  const windowEnd = firstVisibleWeek?.add(SCROLL_WINDOW_WEEKS + 1, "week");
  const bufferedWeeks = React.useMemo(() => {
    if (!desktopScroll || !monthStart) return [];
    const span = 8;
    const first = monthStart.subtract(span, "week");
    const total = weeks.length + span * 2;
    const starts = Array.from({ length: total }, (_, index) =>
      first.add(index, "week"),
    );
    if (draggedDate) {
      const source = startOfCalendarWeek(
        dayjs(draggedDate).locale(monthStart.locale()),
        weekStartsOn,
      );
      if (source.isBefore(starts[0], "day")) starts.unshift(source);
      if (source.isAfter(starts[starts.length - 1], "day")) starts.push(source);
    }
    return starts.map((start) =>
      Array.from({ length: 7 }, (_, index) => start.add(index, "day")),
    );
  }, [desktopScroll, draggedDate, monthStart, weekStartsOn, weeks.length]);
  const contentKey =
    displayMode === "week"
      ? `${displayMode}-${selectedWeek[0]?.format("YYYY-MM-DD")}`
      : `${displayMode}-${currentMonth.format("YYYY-MM")}`;

  const renderRows = (shownWeeks: Dayjs[][]) =>
    shownWeeks.map((week) => {
      const start = week[0];
      const outsideViewport =
        !draggedDate &&
        desktopScroll &&
        firstVisibleWeek &&
        windowEnd &&
        (start.isBefore(firstVisibleWeek, "day") ||
          !start.isBefore(windowEnd, "day"));
      const competitionSegments = buildCompetitionSegments(
        week,
        competitionEventsByDate,
      );
      return (
        <div
          key={week[0]?.format("YYYY-MM-DD")}
          data-calendar-week={week[0]?.format("YYYY-MM-DD")}
          data-calendar-week-end={
            desktopScroll ? week[6]?.format("YYYY-MM-DD") : undefined
          }
          inert={Boolean(outsideViewport)}
          className="relative"
        >
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {week.map((date, columnIndex) => {
              const key = date.format("YYYY-MM-DD");
              const dropAppearance = calendarDropAppearance(dragged?.workout, key, hoveredDropDate === key);
              const inPlanRange = Boolean(
                range &&
                (date.isSame(range.startOfWeek, "day") ||
                  date.isAfter(range.startOfWeek)) &&
                (date.isSame(range.end, "day") || date.isBefore(range.end)),
              );
              return (
                <CalendarDayButton
                  key={key}
                  date={date}
                  isCurrentMonth={date.isSame(visibleMonth, "month")}
                  isToday={key === today}
                  isSelected={date.isSame(selectedDate, "day")}
                  activities={activitiesByDate[key]}
                  planWorkouts={
                    workoutsByDate[key] ??
                    (dragged?.date === key ? [dragged.workout] : undefined)
                  }
                  competitionLaneCount={competitionSegments.reduce(
                    (laneCount, segment) =>
                      columnIndex >= segment.startColumn &&
                      columnIndex < segment.startColumn + segment.span
                        ? Math.max(laneCount, segment.lane + 1)
                        : laneCount,
                    0,
                  )}
                  tss={tssByDate && (tssByDate[key] ?? 0)}
                  inPlanRange={inPlanRange}
                  presentWorkout={presentWorkout}
                  onCreate={
                    onCreateOnDate
                      ? (kind) => onCreateOnDate(kind, date)
                      : undefined
                  }
                  onRequestMove={onRequestMove}
                  onAdjustSchedule={onAdjustSchedule ? () => onAdjustSchedule(date) : undefined}
                  getMoveWorkout={getMoveWorkout}
                  createWorkoutOnly={createWorkoutOnly}
                  workoutDrag={
                    onMoveWorkout
                      ? {
                          acceptsDropEvent: dropAppearance === "available" || dropAppearance === "target",
                          appearance: dropAppearance,
                          onStart: (workout) =>
                            setDragged({ date: key, workout }),
                          onHover: () => setHoveredDropDate(key),
                          onLeave: () =>
                            setHoveredDropDate((current) =>
                              current === key ? null : current,
                            ),
                          onDrop: (id) => {
                            endDrag();
                            if (dragged?.workout.id !== id) return;
                            const reason = calendarWorkoutDropRejection(
                              dragged.workout,
                            );
                            if (reason) toast.info(tMove(reason));
                            else if (canDropCalendarWorkout(dragged.workout, key)) onMoveWorkout(dragged.workout, key);
                          },
                        }
                      : undefined
                  }
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
                  disabled={!onSelectCompetition}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onSelectCompetition?.(segment.event);
                  }}
                  onPointerEnter={() =>
                    setHighlightedCompetitionId(segment.event.id)
                  }
                  onPointerLeave={() => setHighlightedCompetitionId(null)}
                  onFocus={() => setHighlightedCompetitionId(segment.event.id)}
                  onBlur={() => setHighlightedCompetitionId(null)}
                  className={cn(
                    "flex h-5 min-w-0 items-center gap-1 overflow-hidden bg-[hsl(var(--blue-100))] px-1.5 text-left text-mobile-unit pc:text-[10px] font-semibold text-[hsl(var(--blue-800))] transition-colors hover:bg-[hsl(var(--blue-200))] focus-visible:z-30 focus-visible:outline-none dark:bg-[hsl(var(--blue-950)/0.28)] dark:text-[hsl(var(--blue-200)/0.82)] dark:hover:bg-[hsl(var(--blue-900)/0.42)] md:px-2 md:text-mobile-caption",
                    !draggedDate && "pointer-events-auto",
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
                  <span className="truncate">{segment.event.title}</span>
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
                  disabled={!onSelectCompetition}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onSelectCompetition?.(segment.event);
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
                    {calendarMonthDayLabel(segment.event.startDate, locale)}
                    {segment.event.endDate &&
                    segment.event.endDate !== segment.event.startDate
                      ? ` – ${calendarMonthDayLabel(segment.event.endDate, locale)}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <section
      onDragEnd={onMoveWorkout ? endDrag : undefined}
      data-calendar-dragging={dragged ? "" : undefined}
      className={cn(
        "overflow-hidden rounded-md bg-neutral-100 p-2.5 transition-colors dark:bg-muted/70 md:p-3",
        dragged && calendarDropGridClass,
        desktopScroll && "flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      <div className="mb-2 shrink-0">
        <div className="text-mobile-caption pc:text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {displayMode === "week" ? t("weekModeLabel") : t("monthModeLabel")}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-7 gap-1 md:gap-2 px-0.5 pb-1.5">
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
        ref={scroll.viewport}
        data-calendar-scroll={desktopScroll ? "" : undefined}
        role={desktopScroll ? "region" : undefined}
        aria-label={desktopScroll ? t("monthModeLabel") : undefined}
        tabIndex={desktopScroll ? 0 : undefined}
        className={cn(
          "touch-pan-y select-none",
          desktopScroll &&
            "relative min-h-0 flex-1 overscroll-contain [overflow-anchor:none] [scrollbar-width:none]",
          desktopScroll &&
            (draggedDate
              ? "overflow-hidden"
              : "overflow-y-auto overflow-x-hidden"),
        )}
        style={
          desktopScroll
            ? { maxHeight: SCROLL_WINDOW_WEEKS * 116 - 4 }
            : undefined
        }
        onKeyDown={desktopScroll ? scroll.browseWithKeyboard : undefined}
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
        {desktopScroll ? (
          <div className="grid gap-1">{renderRows(bufferedWeeks)}</div>
        ) : (
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
              {renderRows(visibleWeeks)}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}

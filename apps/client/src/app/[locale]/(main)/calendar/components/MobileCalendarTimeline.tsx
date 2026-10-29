"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs, { type Dayjs } from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import type { Activity } from "@/api/activities";
import type { CompetitionEvent } from "@/api/competition-events";
import type { PlanWorkout } from "@/api/plans";
import { cn } from "@/lib/utils";
import {
  getPlannedWorkoutLoad,
  MobileCalendarDayLoad,
} from "./MobileCalendarDayLoad";

type TimelineTag = {
  id: string;
  label: string;
  tone: "activity" | "competition" | "planned";
};

const TIMELINE_ROW_HEIGHT = 90;
const TIMELINE_EDGE_THRESHOLD = TIMELINE_ROW_HEIGHT * 2;
const TIMELINE_SELECTED_TOP_ROWS = 3;
const TIMELINE_OVERSCAN_ROWS = 8;
const MAX_VISIBLE_SESSIONS = 3;

type Translate = (key: string) => string;

function sportLabel(t: Translate, sportType?: string | null) {
  if (sportType === "RUN") return t("CalendarExperience.sportLabels.run");
  if (sportType === "CYCLING")
    return t("CalendarExperience.sportLabels.cycling");
  if (sportType === "SWIM") return t("CalendarExperience.sportLabels.swim");
  return t("CalendarExperience.sportLabels.other");
}

function formatCompactDuration(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatCompactDistance(meters?: number | null) {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0)
    return null;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatYearMonth(date: Dayjs, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
  }).format(date.toDate());
}

function visibleTags({
  activities,
  competitions,
  workouts,
  translate,
}: {
  activities: Activity[];
  competitions: CompetitionEvent[];
  workouts: PlanWorkout[];
  translate: Translate;
}) {
  const tags: TimelineTag[] = [];
  for (const event of competitions) {
    if (tags.length === MAX_VISIBLE_SESSIONS) break;
    tags.push({
      id: `competition-${event.id}`,
      label: [
        sportLabel(translate, event.sportType),
        formatCompactDistance(event.distanceMeters),
        formatCompactDuration(event.targetTimeSeconds),
      ]
        .filter(Boolean)
        .join(" · "),
      tone: "competition",
    });
  }
  for (const workout of workouts) {
    if (tags.length === MAX_VISIBLE_SESSIONS) break;
    tags.push({
      id: `workout-${workout.id}`,
      label: [
        sportLabel(translate, workout.sportType),
        formatCompactDuration(workout.summary.durationSeconds),
      ]
        .filter(Boolean)
        .join(" · "),
      tone: "planned",
    });
  }
  for (const activity of activities) {
    if (tags.length === MAX_VISIBLE_SESSIONS) break;
    tags.push({
      id: `activity-${activity.id}`,
      label: [
        sportLabel(translate, activity.sportType),
        formatCompactDistance(activity.distance),
        formatCompactDuration(activity.duration),
      ]
        .filter(Boolean)
        .join(" · "),
      tone: "activity",
    });
  }
  return tags;
}

const tagClassNames: Record<TimelineTag["tone"], string> = {
  activity:
    "border-sky-100/80 border-l-sky-500 bg-sky-50 text-sky-900 dark:border-sky-800/25 dark:border-l-sky-500 dark:bg-sky-950/30 dark:text-sky-100",
  competition:
    "border-violet-100/80 border-l-violet-500 bg-violet-50 text-violet-900 dark:border-violet-800/25 dark:border-l-violet-500 dark:bg-violet-950/30 dark:text-violet-100",
  planned:
    "border-emerald-100/80 border-l-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-800/25 dark:border-l-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-100",
};

export function MobileCalendarTimeline({
  days,
  selectedDate,
  onRequestEarlier,
  onRequestLater,
  onSelectDate,
  activitiesByDate,
  workoutsByDate,
  competitionEventsByDate,
  tssByDate,
}: {
  days: Dayjs[];
  selectedDate: Dayjs;
  onRequestEarlier?: () => void;
  onRequestLater?: () => void;
  onSelectDate: (date: Dayjs) => void;
  activitiesByDate: Record<string, Activity[]>;
  workoutsByDate: Record<string, PlanWorkout[]>;
  competitionEventsByDate: Record<string, CompetitionEvent[]>;
  tssByDate: Record<string, number>;
}) {
  const locale = useLocale();
  const t = useTranslations("MobileCalendarTimeline");
  const translate = useTranslations();
  const selectedKey = selectedDate.format("YYYY-MM-DD");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const daysRef = useRef(days);
  daysRef.current = days;
  const firstDayKey = (days[0] ?? selectedDate).format("YYYY-MM-DD");
  const lastDayKey = (days[days.length - 1] ?? selectedDate).format(
    "YYYY-MM-DD",
  );
  const earlierRequestKeyRef = useRef<string | null>(null);
  const laterRequestKeyRef = useRef<string | null>(null);
  const prependSnapshotRef = useRef<{
    firstDayKey: string;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const previousFirstDayKeyRef = useRef(firstDayKey);
  const [displayMonth, setDisplayMonth] = useState(() => selectedDate);
  const displayMonthKeyRef = useRef(displayMonth.format("YYYY-MM"));
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const getTimelineItemKey = useCallback(
    (index: number) => days[index]?.format("YYYY-MM-DD") ?? index,
    [days],
  );
  const virtualizer = useVirtualizer({
    count: days.length,
    estimateSize: () => TIMELINE_ROW_HEIGHT,
    getItemKey: getTimelineItemKey,
    getScrollElement: () => scrollerRef.current,
    overscan: TIMELINE_OVERSCAN_ROWS,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const previousFirstDayKey = previousFirstDayKeyRef.current;
    previousFirstDayKeyRef.current = firstDayKey;
    if (previousFirstDayKey === firstDayKey) return;

    const prependSnapshot = prependSnapshotRef.current;
    if (prependSnapshot?.firstDayKey === previousFirstDayKey) {
      scroller.scrollTop =
        prependSnapshot.scrollTop +
        (scroller.scrollHeight - prependSnapshot.scrollHeight);
      prependSnapshotRef.current = null;
    }
  }, [firstDayKey]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const selectedIndex = daysRef.current.findIndex(
      (date) => date.format("YYYY-MM-DD") === selectedKey,
    );
    if (selectedIndex < 0) return;

    const selectedTop = selectedIndex * TIMELINE_ROW_HEIGHT;
    const selectedBottom = selectedTop + TIMELINE_ROW_HEIGHT;
    const isVisible =
      selectedTop >= scroller.scrollTop &&
      selectedBottom <= scroller.scrollTop + scroller.clientHeight;
    if (!isVisible) {
      scroller.scrollTop = Math.max(
        0,
        (selectedIndex - TIMELINE_SELECTED_TOP_ROWS) * TIMELINE_ROW_HEIGHT,
      );
    }
    displayMonthKeyRef.current = selectedDate.format("YYYY-MM");
    setDisplayMonth(selectedDate);
  }, [selectedDate, selectedKey]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const firstVisibleIndex = Math.max(
        0,
        Math.min(
          days.length - 1,
          Math.floor(event.currentTarget.scrollTop / TIMELINE_ROW_HEIGHT),
        ),
      );
      const visibleDate = days[firstVisibleIndex];
      if (!visibleDate) return;
      const visibleMonthKey = visibleDate.format("YYYY-MM");
      if (visibleMonthKey !== displayMonthKeyRef.current) {
        displayMonthKeyRef.current = visibleMonthKey;
        setDisplayMonth(visibleDate);
      }

      const scroller = event.currentTarget;
      if (
        onRequestEarlier &&
        scroller.scrollTop <= TIMELINE_EDGE_THRESHOLD &&
        earlierRequestKeyRef.current !== firstDayKey
      ) {
        earlierRequestKeyRef.current = firstDayKey;
        prependSnapshotRef.current = {
          firstDayKey,
          scrollHeight: scroller.scrollHeight,
          scrollTop: scroller.scrollTop,
        };
        onRequestEarlier();
      }
      if (
        onRequestLater &&
        scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - TIMELINE_EDGE_THRESHOLD &&
        laterRequestKeyRef.current !== lastDayKey
      ) {
        laterRequestKeyRef.current = lastDayKey;
        onRequestLater();
      }
    },
    [days, firstDayKey, lastDayKey, onRequestEarlier, onRequestLater],
  );

  const displayMonthLabel = useMemo(
    () => formatYearMonth(displayMonth, locale),
    [displayMonth, locale],
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background pc:hidden">
      <div
        aria-label={displayMonthLabel}
        className="flex h-9 shrink-0 items-center bg-muted/55 px-4"
      >
        <span className="whitespace-nowrap text-sm font-semibold text-foreground">
          {displayMonthLabel}
        </span>
      </div>
      <div
        ref={scrollerRef}
        data-testid="calendar-agenda-scroll"
        onScroll={handleScroll}
        className="h-full touch-pan-y overflow-y-auto overscroll-contain"
      >
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualRows.map((virtualRow) => {
            const date = days[virtualRow.index];
            if (!date) return null;
            const key = date.format("YYYY-MM-DD");
            const activities = activitiesByDate[key] ?? [];
            const workouts = workoutsByDate[key] ?? [];
            const competitions = competitionEventsByDate[key] ?? [];
            const rangeCompetitions = competitions.filter(
              (event) => event.endDate && event.endDate !== event.startDate,
            );
            const displayedCompetitions = competitions.filter(
              (event) =>
                !event.endDate ||
                event.endDate === event.startDate ||
                event.startDate === key,
            );
            const tags = visibleTags({
              activities,
              competitions: displayedCompetitions,
              workouts,
              translate,
            });
            const itemCount =
              activities.length +
              workouts.length +
              displayedCompetitions.length;
            const hasTraining = activities.length > 0 || workouts.length > 0;
            const actualLoad = tssByDate[key] ?? 0;
            const plannedLoad = getPlannedWorkoutLoad(workouts);
            const overflowCount = Math.max(0, itemCount - tags.length);
            const isToday = date.isSame(dayjs(), "day");
            const selected = key === selectedKey;

            return (
              <button
                key={key}
                data-index={virtualRow.index}
                data-tap-feedback="false"
                type="button"
                onClick={() => onSelectDate(date)}
                aria-current={isToday ? "date" : undefined}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  WebkitTapHighlightColor: "transparent",
                }}
                className={cn(
                  "absolute left-0 top-0 grid h-[90px] w-full touch-manipulation grid-cols-[86px_minmax(0,1fr)] text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selected && "bg-emerald-500/[0.035]",
                )}
              >
                <span className="relative flex flex-col items-start justify-start border-b border-r border-border/50 bg-muted/45 px-3 py-3">
                  <span
                    className={cn(
                      "text-mobile-caption pc:text-[11px] font-semibold uppercase",
                      isToday ? "text-sky-500" : "text-muted-foreground",
                    )}
                  >
                    {weekdayFormatter.format(date.toDate())}
                  </span>
                  <span className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-foreground/80">
                    {date.date()}
                  </span>
                  {isToday ? (
                    <span
                      className="mt-2 h-0.5 w-5 bg-sky-500"
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
                <span className="relative flex min-w-0 items-start gap-2 border-b border-border/50 px-3 py-3">
                  {rangeCompetitions.slice(0, 2).map((event, lane) => (
                    <span
                      key={`rail-${event.id}`}
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-0 top-0 w-1.5 bg-violet-300 dark:bg-violet-800",
                        key === event.startDate && "rounded-t-full",
                        key === event.endDate && "rounded-b-full",
                      )}
                      style={{ left: 5 + lane * 8 }}
                    />
                  ))}
                  <span
                    className={cn(
                      "flex min-w-0 flex-1 flex-row flex-wrap items-start gap-1.5",
                      rangeCompetitions.length > 0 && "pl-4",
                    )}
                  >
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className={cn(
                          "max-w-full truncate rounded-compact border border-l-4 px-2 py-1 text-mobile-caption pc:text-xs font-medium leading-4",
                          tagClassNames[tag.tone],
                        )}
                      >
                        {tag.label}
                      </span>
                    ))}
                    {overflowCount > 0 ? (
                      <span className="rounded-compact border border-border/70 bg-muted px-2 py-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                        +{overflowCount}
                      </span>
                    ) : null}
                    {itemCount === 0 && rangeCompetitions.length === 0 ? (
                      <span className="text-mobile-caption pc:text-xs text-muted-foreground">
                        {t("rest")}
                      </span>
                    ) : null}
                  </span>
                  {hasTraining ? (
                    <MobileCalendarDayLoad
                      actualLoad={actualLoad}
                      plannedLoad={plannedLoad}
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

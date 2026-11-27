"use client";

import React from "react";
import dayjs from "dayjs";
import { CalendarRange } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import type { CompetitionEvent } from "@/api/competition-events";
import type { PlanWorkout } from "@/api/plans";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import { MobilePushSidePage } from "@/components/mobile-app/components/MobilePushSidePage";
import { MobileSidePageTrigger } from "@/components/mobile-app/components/MobileSidePageTrigger";
import { MobileTopBarAction } from "@/components/mobile-app/components/MobileTopBar";
import { useMobileEdgeSwipe } from "@/components/mobile-app/hooks/use-mobile-edge-swipe";
import { usePcViewport } from "@/hooks/use-mobile";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import type { MobileCalendarSheetPage } from "./components/MobileCalendarDaySheet";
import { CalendarEditingDialogs, useCalendarEditing } from "./components/calendar-editing";
import { useCalendarViewModel } from "./components/useCalendarViewModel";
import { calendarScrollFetchRange } from "./components/utils";
import { useCalendarScrollPosition } from "./components/use-calendar-scroll-position";

function CalendarSurfaceFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-full min-h-80 animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45"
    />
  );
}

const CalendarAdjustmentDialog = dynamic(
  () => import("./components/calendar-adjustment-dialog").then((module) => module.CalendarAdjustmentDialog),
  { ssr: false },
);

const CalendarMonthView = dynamic(
  () => import("./components/CalendarMonthView").then((module) => module.CalendarMonthView),
  { loading: CalendarSurfaceFallback, ssr: false },
);

const CalendarDaySheet = dynamic(
  () =>
    import("./components/CalendarDaySheet").then(
      (module) => module.CalendarDaySheet,
    ),
  { loading: CalendarSurfaceFallback, ssr: false },
);

const MobileCalendarTimeline = dynamic(
  () =>
    import("./components/MobileCalendarTimeline").then(
      (module) => module.MobileCalendarTimeline,
    ),
  { ssr: false },
);

const MobileCalendarMonthPanel = dynamic(
  () =>
    import("./components/MobileCalendarMonthPanel").then(
      (module) => module.MobileCalendarMonthPanel,
    ),
  { ssr: false },
);

const MobileCalendarDaySheet = dynamic(
  () =>
    import("./components/MobileCalendarDaySheet").then(
      (module) => module.MobileCalendarDaySheet,
    ),
  { ssr: false },
);

const CompetitionEventDialog = dynamic(
  () =>
    import("@/components/competition/competition-event-dialog").then(
      (module) => module.CompetitionEventDialog,
    ),
  { ssr: false },
);

const MOBILE_AGENDA_EXTENSION_MONTHS = 3;

export default function PMCPage() {
  const t = useTranslations("Calendar");
  const tHeader = useTranslations("CalendarHeader");
  const locale = useLocale();
  const pcViewport = usePcViewport();
  const isPc = pcViewport === true;
  const isMobileLayout = pcViewport === false;
  const {
    currentMonth,
    setCurrentMonth,
    displayedMonth: scrolledMonth,
    showMonth,
    scroll,
    resetScrollAnchor,
  } = useCalendarScrollPosition(() => dayjs());
  const displayedMonth = isPc ? scrolledMonth : currentMonth;
  const [displayMode, setDisplayMode] = React.useState<"week" | "month">(
    "month",
  );
  const [navigationDirection, setNavigationDirection] = React.useState<1 | -1>(
    1,
  );
  const [selectedPlanWorkout, setSelectedPlanWorkout] =
    React.useState<PlanWorkout | null>(null);
  const [selectedCompetitionEvent, setSelectedCompetitionEvent] =
    React.useState<CompetitionEvent | null>(null);
  const [monthOpen, setMonthOpen] = React.useState(false);
  const [daySheetOpen, setDaySheetOpen] = React.useState(false);
  const workoutDetailsTrigger = React.useRef<HTMLElement | null>(null);
  const [mobileSheetPage, setMobileSheetPage] =
    React.useState<MobileCalendarSheetPage>({ kind: "day" });
  const [mobileAgendaWindow, setMobileAgendaWindow] = React.useState(() => {
    const today = dayjs();
    return {
      start: today
        .subtract(MOBILE_AGENDA_EXTENSION_MONTHS, "month")
        .startOf("month"),
      end: today.add(MOBILE_AGENDA_EXTENSION_MONTHS, "month").endOf("month"),
    };
  });
  const mobileAgendaRange = React.useMemo(
    () => ({
      start: mobileAgendaWindow.start,
      end: mobileAgendaWindow.end,
    }),
    [mobileAgendaWindow],
  );
  const requestedCalendarRange = React.useMemo(() => {
    if (!isPc) return mobileAgendaRange;
    return calendarScrollFetchRange(currentMonth);
  }, [currentMonth, isPc, mobileAgendaRange]);
  useSetPageTitle(t("page.title"));

  const {
    weeks,
    selectedDate,
    setSelectedDate,
    selectedWeek,
    summaryScopes,
    selectedActivities,
    selectedPlanWorkouts,
    selectedCompetitionEvents,
    activePlanId,
    activePlan,
    selectedTss,
    activitiesByDate,
    workoutsByDate,
    competitionEventsByDate,
    tssByDate,
    range,
  } = useCalendarViewModel(
    currentMonth,
    requestedCalendarRange,
    displayedMonth,
    isPc,
  );
  const mobileAgendaDays = React.useMemo(() => {
    const start = mobileAgendaWindow.start.startOf("day");
    const end = mobileAgendaWindow.end.endOf("day");
    const dayCount = end.diff(start, "day");
    return Array.from({ length: dayCount + 1 }, (_, index) =>
      start.add(index, "day"),
    );
  }, [mobileAgendaWindow]);
  const extendMobileAgendaEarlier = React.useCallback(() => {
    setMobileAgendaWindow((current) => ({
      ...current,
      start: current.start
        .subtract(MOBILE_AGENDA_EXTENSION_MONTHS, "month")
        .startOf("month"),
    }));
  }, []);
  const extendMobileAgendaLater = React.useCallback(() => {
    setMobileAgendaWindow((current) => ({
      ...current,
      end: current.end
        .add(MOBILE_AGENDA_EXTENSION_MONTHS, "month")
        .endOf("month"),
    }));
  }, []);

  const currentCompetitionEvent = React.useMemo(() => {
    if (!selectedCompetitionEvent) return null;
    for (const events of Object.values(competitionEventsByDate)) {
      const current = events.find(
        (event) => event.id === selectedCompetitionEvent.id,
      );
      if (current) return current;
    }
    return selectedCompetitionEvent;
  }, [competitionEventsByDate, selectedCompetitionEvent]);

  React.useEffect(() => {
    setDisplayMode(isMobileLayout ? "week" : "month");
  }, [isMobileLayout]);

  const effectiveDisplayMode = isMobileLayout ? displayMode : "month";

  const applySelectedDate = React.useCallback(
    (nextDate: dayjs.Dayjs) => {
      setSelectedCompetitionEvent(null);
      setSelectedDate(nextDate);
      if (isPc) {
        showMonth(nextDate);
      } else {
        setCurrentMonth((month) =>
          nextDate.isSame(month, "month") ? month : nextDate.startOf("month"),
        );
      }
    },
    [isPc, setCurrentMonth, setSelectedDate, showMonth],
  );

  const openWorkoutDetails = React.useCallback(
    (workout: PlanWorkout | null) => {
      if (workout) {
        workoutDetailsTrigger.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      setSelectedPlanWorkout(workout);
    },
    [],
  );

  const handleSelectWorkout = React.useCallback(
    (workout: PlanWorkout, date: dayjs.Dayjs) => {
      applySelectedDate(date);
      openWorkoutDetails(workout);
    },
    [applySelectedDate, openWorkoutDetails],
  );

  const openMobileSheet = React.useCallback(
    (page: MobileCalendarSheetPage = { kind: "day" }) => {
      setMobileSheetPage(page);
      setDaySheetOpen(true);
    },
    [],
  );

  const handleMobileActivity = React.useCallback(
    (activity: Activity) => openMobileSheet({ kind: "activity", activity }),
    [openMobileSheet],
  );

  const handleMobileDayPress = React.useCallback(
    (date: dayjs.Dayjs) => {
      applySelectedDate(date);
      setMonthOpen(false);
      openMobileSheet({ kind: "day" });
    },
    [applySelectedDate, openMobileSheet],
  );

  const navigateMonth = React.useCallback(
    (direction: 1 | -1, fromMonth?: string) => {
      setNavigationDirection(direction);
      const sourceMonth = fromMonth ? dayjs(`${fromMonth}-01`) : displayedMonth;
      const targetMonth = sourceMonth.add(direction, "month").startOf("month");
      resetScrollAnchor(targetMonth);
      setCurrentMonth(targetMonth);
      const targetDate = targetMonth.date(
        Math.min(selectedDate.date(), targetMonth.daysInMonth()),
      );
      setSelectedDate(targetDate);
    },
    [displayedMonth, resetScrollAnchor, selectedDate, setCurrentMonth, setSelectedDate],
  );

  const navigateWeek = React.useCallback(
    (direction: 1 | -1) => {
      setNavigationDirection(direction);
      applySelectedDate(selectedDate.add(direction * 7, "day"));
    },
    [applySelectedDate, selectedDate],
  );

  const handlePrev = React.useCallback(() => {
    if (effectiveDisplayMode === "week") {
      navigateWeek(-1);
      return;
    }
    navigateMonth(-1);
  }, [effectiveDisplayMode, navigateMonth, navigateWeek]);

  const handleNext = React.useCallback(() => {
    if (effectiveDisplayMode === "week") {
      navigateWeek(1);
      return;
    }
    navigateMonth(1);
  }, [effectiveDisplayMode, navigateMonth, navigateWeek]);

  const handleToday = React.useCallback(() => {
    const today = dayjs();
    setNavigationDirection(1);
    setCurrentMonth(today.startOf("month"));
    resetScrollAnchor(today);
    setSelectedDate(today);
    setMonthOpen(false);
  }, [resetScrollAnchor, setCurrentMonth, setSelectedDate]);

  const [adjustmentDate, setAdjustmentDate] = React.useState<string | null>(null);
  const openAdjustment = activePlanId
    ? (date: dayjs.Dayjs) => setAdjustmentDate(date.format("YYYY-MM-DD"))
    : undefined;
  useMobileEdgeSwipe(() => setMonthOpen(true), !monthOpen);
  useMobileNavigation({
    leading: (
      <MobileSidePageTrigger
        onToggle={() => setMonthOpen((open) => !open)}
        openLabel={tHeader("calendarLabel")}
      >
        <CalendarRange aria-hidden="true" />
      </MobileSidePageTrigger>
    ),
    trailing: (
      <MobileTopBarAction
        onClick={handleToday}
        aria-label={tHeader("today")}
        edge="trailing"
      >
        <span
          aria-hidden="true"
          className="grid size-[22px] place-items-center rounded-xs border-[1.5px] border-current text-[11px] font-semibold tabular-nums leading-none"
        >
          {dayjs().date()}
        </span>
      </MobileTopBarAction>
    ),
  });

  const monthLabel = React.useMemo(() => {
    const labelDate =
      effectiveDisplayMode === "week" ? selectedDate : displayedMonth;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
    }).format(labelDate.toDate());
  }, [locale, displayedMonth, effectiveDisplayMode, selectedDate]);

  const editing = useCalendarEditing({ onSelectDate: applySelectedDate });

  return (
    <div
      data-testid="calendar-page"
      className="relative grid h-full min-h-0 min-w-0 flex-1 gap-3 overflow-hidden pc:grid-cols-[minmax(0,1.24fr)_minmax(220px,260px)] pc:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,280px)]"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 pc:overflow-hidden pc:pr-1">
        {pcViewport === undefined ? (
          <CalendarSurfaceFallback />
        ) : isPc ? (
          <CalendarMonthView
            header={{
              monthLabel,
              displayMode: effectiveDisplayMode,
              showDisplayModeToggle: false,
              onPrev: handlePrev,
              onNext: handleNext,
              onToday: handleToday,
              currentMonthDate: displayedMonth.toDate(),
              onMonthChange: (date) => {
                const nextMonth = dayjs(date).startOf("month");
                resetScrollAnchor(nextMonth);
                setCurrentMonth(nextMonth);
                setSelectedDate(
                  nextMonth.date(Math.min(selectedDate.date(), nextMonth.daysInMonth())),
                );
              },
            }}
            grid={{
              currentMonth,
              visibleMonth: displayedMonth,
              weeks,
              selectedWeek,
              selectedDate,
              displayMode: effectiveDisplayMode,
              navigationDirection,
              onSelectDate: applySelectedDate,
              onSelectCompetition: setSelectedCompetitionEvent,
              onSelectWorkout: handleSelectWorkout,
              onMoveWorkout: editing.moveWorkout,
              ...scroll,
              onScrollMonth: navigateMonth,
              onCreateOnDate: editing.createOnDate,
              onAdjustSchedule: openAdjustment,
              onRequestMove: editing.requestMove,
              onPrev: handlePrev,
              onNext: handleNext,
              activitiesByDate,
              workoutsByDate,
              competitionEventsByDate,
              tssByDate,
              range,
            }}
          />
        ) : (
          <>
            <MobilePushSidePage
              open={monthOpen}
              onOpenChange={setMonthOpen}
              className="flex flex-col overflow-hidden p-0"
            >
              {monthOpen ? (
                <MobileCalendarMonthPanel
                  currentMonth={currentMonth}
                  weeks={weeks}
                  selectedDate={selectedDate}
                  onSelectDate={applySelectedDate}
                  onCreateOnDate={editing.createOnDate}
                  onAdjustSchedule={openAdjustment}
                  onMoveWorkout={editing.moveWorkout}
                  onRequestMoveWorkout={editing.requestMove}
                  onNavigateMonth={navigateMonth}
                  onSelectActivity={handleMobileActivity}
                  onSelectCompetition={(event) => {
                    setSelectedCompetitionEvent(event);
                    openMobileSheet({ kind: "competition", event });
                  }}
                  onSelectWorkout={(workout, date) => {
                    applySelectedDate(date);
                    openMobileSheet({ kind: "workout", workout });
                  }}
                  activitiesByDate={activitiesByDate}
                  workoutsByDate={workoutsByDate}
                  competitionEventsByDate={competitionEventsByDate}
                  tssByDate={tssByDate}
                  activePlan={activePlan}
                  range={range}
                />
              ) : null}
            </MobilePushSidePage>
            <MobileCalendarTimeline
              activePlan={activePlan}
              days={mobileAgendaDays}
              selectedDate={selectedDate}
              onRequestEarlier={extendMobileAgendaEarlier}
              onRequestLater={extendMobileAgendaLater}
              onSelectDate={handleMobileDayPress}
              activitiesByDate={activitiesByDate}
              workoutsByDate={workoutsByDate}
              competitionEventsByDate={competitionEventsByDate}
              tssByDate={tssByDate}
            />
          </>
        )}
      </div>

      {isPc ? (
        <div className="min-h-0 min-w-0 overflow-hidden">
          <CalendarDaySheet
            selectedDate={selectedDate}
            tss={selectedTss}
            activities={selectedActivities}
            planWorkouts={selectedPlanWorkouts}
            competitionEvents={selectedCompetitionEvents}
            locale={locale}
            activePlanId={activePlanId}
            summaryScopes={summaryScopes}
            selectedPlanWorkout={selectedPlanWorkout}
            onSelectPlanWorkout={openWorkoutDetails}
            onCreateWorkout={() => editing.createOnDate("workout", selectedDate)}
            onMovePlanWorkout={
              editing.requestMove
                ? (workout) => editing.requestMove?.(workout, workoutDetailsTrigger.current)
                : undefined
            }
            focusedCompetitionEvent={null}
            className="h-full"
          />
        </div>
      ) : null}
      {isMobileLayout && daySheetOpen ? (
        <MobileCalendarDaySheet
          open
          onOpenChange={setDaySheetOpen}
          page={mobileSheetPage}
          onPageChange={setMobileSheetPage}
          onMoveWorkout={editing.requestMove}
          date={selectedDate}
          activities={selectedActivities}
          workouts={selectedPlanWorkouts}
          events={selectedCompetitionEvents}
        />
      ) : null}
      {isPc && currentCompetitionEvent ? (
        <CompetitionEventDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSelectedCompetitionEvent(null);
          }}
          event={currentCompetitionEvent}
          defaultDate={
            currentCompetitionEvent.startDate ??
            selectedDate.format("YYYY-MM-DD")
          }
        />
      ) : null}
      <CalendarEditingDialogs editing={editing} planId={activePlanId} />
      {adjustmentDate && activePlanId ? (
        <CalendarAdjustmentDialog
          planId={activePlanId}
          initialDate={adjustmentDate}
          onClose={() => setAdjustmentDate(null)}
        />
      ) : null}
    </div>
  );
}

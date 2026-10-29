"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkoutPlanChart } from "@/components/workout/WorkoutPlanChart";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import {
  buildPlanGlobalSessionOrdinalMap,
  buildWorkoutEntryGrid,
  getNextSessionIndexAt,
  usePlanStore,
} from "@/lib/plan-store";
import { useTranslations } from "next-intl";
import { getLocalizedSportDefinitionCodeName } from "@/api/sports";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMobileOnlyOpen } from "@/hooks/use-mobile";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type ManualPlanWeekGridProps = {
  className?: string;
  scrollAreaClassName?: string;
  openDayRequest?: {
    day: number;
    requestId: number;
    week: number;
  } | null;
  onAddSession: (
    week: number,
    day: number,
    sessionIndex: number,
    kind?: "ENDURANCE" | "STRENGTH",
  ) => void;
  onEditSession: (week: number, day: number, sessionIndex: number) => void;
};

export function ManualPlanWeekGrid({
  className,
  scrollAreaClassName = "max-h-[min(52vh,520px)]",
  openDayRequest,
  onAddSession,
  onEditSession,
}: ManualPlanWeekGridProps) {
  const t = useTranslations("PlanEditor");
  const tCreate = useTranslations("PlanCreatePage");
  const tWorkout = useTranslations("WorkoutEditor");
  const tWd = useTranslations("PlanCreatePage.weekdays");
  const tSports = useTranslations("SportCatalog");
  const current = usePlanStore((s) => s.current);
  const deleteWorkout = usePlanStore((s) => s.deleteWorkout);
  const [selectedDay, setSelectedDay] = useState<{
    week: number;
    day: number;
  } | null>(null);
  const [sheetPage, setSheetPage] = useState<"day" | "type">("day");

  const workoutEntryGrid = useMemo(
    () => buildWorkoutEntryGrid(current),
    [current],
  );
  const globalSessionOrdinal = useMemo(
    () => buildPlanGlobalSessionOrdinalMap(current),
    [current],
  );
  const weeks = current?.weeks ?? 0;
  const days = 7;
  const selectedSessions = selectedDay
    ? (workoutEntryGrid[selectedDay.week]?.[selectedDay.day] ?? [])
    : [];

  const closeDaySheet = () => {
    setSelectedDay(null);
    setSheetPage("day");
  };
  const mobileSheetOpen = useMobileOnlyOpen(
    selectedDay !== null,
    (nextOpen) => {
      if (!nextOpen) closeDaySheet();
    },
  );

  useEffect(() => {
    if (!openDayRequest) return;
    setSelectedDay({
      week: openDayRequest.week,
      day: openDayRequest.day,
    });
    setSheetPage("day");
  }, [openDayRequest]);

  const addMobileSession = (kind: "ENDURANCE" | "STRENGTH") => {
    if (!selectedDay) return;
    const { week, day } = selectedDay;
    const sessionIndex = getNextSessionIndexAt(current, week, day);
    closeDaySheet();
    requestAnimationFrame(() => onAddSession(week, day, sessionIndex, kind));
  };

  return (
    <div className={className}>
      <div
        data-testid="mobile-manual-plan-schedule"
        className="overflow-hidden border-y border-border/60 pc:hidden"
      >
        {Array.from({ length: weeks }).map((_, week) => (
          <section
            key={week}
            className="grid grid-cols-[52px_minmax(0,1fr)] border-b border-border/60 last:border-b-0"
          >
            <div className="flex items-center justify-center border-r border-border/60 bg-neutral-100 text-sm font-semibold text-emerald-600 dark:bg-muted/45 dark:text-emerald-400">
              <span
                data-testid={`mobile-plan-week-label-${week}`}
                className="whitespace-nowrap leading-none"
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              >
                {t("grid.weekLabel", { week: week + 1 })}
              </span>
            </div>
            <div className="min-w-0">
              {Array.from({ length: days }).map((_, day) => {
                const sessions = workoutEntryGrid[week]?.[day] ?? [];
                return (
                  <button
                    key={day}
                    type="button"
                    data-testid={`mobile-plan-day-${week}-${day}`}
                    onClick={() => {
                      setSelectedDay({ week, day });
                      setSheetPage(sessions.length > 0 ? "day" : "type");
                    }}
                    className="flex min-h-[84px] w-full items-stretch border-b border-border/60 text-left transition-colors last:border-b-0 active:bg-neutral-50 dark:active:bg-muted/30"
                  >
                    <span className="flex w-[72px] shrink-0 flex-col items-center justify-center border-r border-border/60 bg-neutral-100 px-2 dark:bg-muted/45">
                      <span className="text-mobile-caption pc:text-[11px] font-semibold uppercase text-muted-foreground">
                        {tWd(WEEKDAY_KEYS[day])}
                      </span>
                      <span className="mt-1 text-3xl font-semibold tabular-nums text-foreground/75">
                        {day + 1}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
                      <span className="min-w-0 flex-1">
                        {sessions.length > 0 ? (
                          <span className="flex flex-wrap gap-1.5">
                            {sessions.slice(0, 2).map((entry) => (
                              <span
                                key={entry.sessionIndex}
                                className="max-w-full truncate rounded-compact bg-emerald-500/10 px-2 py-1 text-mobile-caption pc:text-xs font-medium text-emerald-700 dark:text-emerald-300"
                              >
                                {entry.workout.name?.trim() ||
                                  getLocalizedSportDefinitionCodeName(
                                    entry.workout.sportDefinitionCode,
                                    entry.workout.sportType ?? "RUN",
                                    tSports,
                                  )}
                              </span>
                            ))}
                            {sessions.length > 2 ? (
                              <span className="rounded-compact bg-neutral-100 px-2 py-1 text-mobile-caption pc:text-xs text-muted-foreground dark:bg-muted">
                                +{sessions.length - 2}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-mobile-caption pc:text-xs text-muted-foreground/70">
                            {t("sessions.count", { count: 0 })}
                          </span>
                        )}
                      </span>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-muted-foreground dark:bg-muted">
                        {sessions.length > 0 ? (
                          <ChevronRight className="size-3.5" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Drawer
        open={mobileSheetOpen}
        onOpenChange={(open) => {
          if (!open) closeDaySheet();
        }}
        shouldScaleBackground={false}
      >
        <DrawerContent
          data-testid="mobile-plan-day-sheet"
          className="max-h-[92dvh] rounded-t-overlay border-0 bg-muted"
        >
          <DrawerHeader className="px-4 pb-4 pt-2 text-left">
            {sheetPage === "type" ? (
              <>
                <div className="grid min-h-11 grid-cols-[44px_minmax(0,1fr)_44px] items-center">
                  <button
                    type="button"
                    aria-label={tCreate("buttons.back")}
                    onClick={() => {
                      if (selectedSessions.length > 0) {
                        setSheetPage("day");
                        return;
                      }
                      closeDaySheet();
                    }}
                    className="grid size-11 place-items-center rounded-full text-emerald-600 active:bg-muted"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <DrawerTitle className="truncate text-center text-[17px] font-semibold">
                    {tCreate("calendarSelection.chooseWorkoutType")}
                  </DrawerTitle>
                  <span />
                </div>
                <DrawerDescription className="sr-only">
                  {tCreate("calendarSelection.chooseWorkoutType")}
                </DrawerDescription>
              </>
            ) : (
              <div className="flex min-h-11 items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pt-1">
                  <DrawerTitle className="truncate text-[17px] font-semibold leading-6">
                    {selectedDay
                      ? `${t("grid.weekLabel", { week: selectedDay.week + 1 })} · ${tWd(WEEKDAY_KEYS[selectedDay.day])}`
                      : ""}
                  </DrawerTitle>
                  <DrawerDescription className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
                    {selectedSessions.length > 0
                      ? t("sessions.count", {
                          count: selectedSessions.length,
                        })
                      : tCreate("calendarSelection.restDay")}
                  </DrawerDescription>
                </div>
                <button
                  type="button"
                  aria-label={tWorkout("buttons.close")}
                  onClick={closeDaySheet}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
                >
                  <X className="size-[18px]" />
                </button>
              </div>
            )}
          </DrawerHeader>

          <div className="min-h-0 overflow-y-auto px-2 pb-safe-or-4">
            {sheetPage === "type" ? (
              <div className="space-y-2 pb-3">
                <button
                  type="button"
                  data-testid="mobile-plan-add-endurance"
                  onClick={() => addMobileSession("ENDURANCE")}
                  className="flex w-full items-center gap-3 rounded-control-lg bg-background p-4 text-left active:bg-neutral-50 dark:active:bg-muted"
                >
                  <Footprints className="size-[19px] shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">
                      {tWorkout("mobile.endurance")}
                    </span>
                    <span className="mt-1 block text-mobile-caption pc:text-xs leading-4 text-muted-foreground">
                      {tCreate("calendarSelection.enduranceTypeHint")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="mobile-plan-add-strength"
                  onClick={() => addMobileSession("STRENGTH")}
                  className="flex w-full items-center gap-3 rounded-control-lg bg-background p-4 text-left active:bg-neutral-50 dark:active:bg-muted"
                >
                  <Dumbbell className="size-[19px] shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">
                      {tSports("sports.STRENGTH_TRAINING")}
                    </span>
                    <span className="mt-1 block text-mobile-caption pc:text-xs leading-4 text-muted-foreground">
                      {tCreate("calendarSelection.strengthTypeHint")}
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 pb-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="text-sm font-semibold">
                    {t("sessions.count", { count: selectedSessions.length })}
                  </div>
                  <button
                    type="button"
                    data-testid="mobile-plan-open-type-picker"
                    onClick={() => setSheetPage("type")}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                  >
                    <Plus className="size-4" />
                    {t("sessions.add")}
                  </button>
                </div>
                {selectedSessions.length > 0 ? (
                  <div className="space-y-2">
                    {selectedSessions.map((entry) => (
                      <div
                        key={entry.sessionIndex}
                        className="flex w-full items-center rounded-control-lg bg-background px-3 py-3"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedDay) return;
                            const { week, day } = selectedDay;
                            closeDaySheet();
                            requestAnimationFrame(() =>
                              onEditSession(week, day, entry.sessionIndex),
                            );
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-neutral-100 text-muted-foreground dark:bg-muted">
                            {entry.workout.sportDefinitionCode ===
                            "STRENGTH_TRAINING" ? (
                              <Dumbbell className="size-[18px]" />
                            ) : (
                              <Footprints className="size-[18px]" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {entry.workout.name?.trim() ||
                                getLocalizedSportDefinitionCodeName(
                                  entry.workout.sportDefinitionCode,
                                  entry.workout.sportType ?? "RUN",
                                  tSports,
                                )}
                            </span>
                            <span className="mt-1 block truncate text-mobile-caption pc:text-xs text-muted-foreground">
                              {tCreate("calendarSelection.sessionLabel", {
                                index:
                                  globalSessionOrdinal.get(
                                    `${selectedDay?.week}:${selectedDay?.day}:${entry.sessionIndex}`,
                                  ) ?? entry.sessionIndex,
                              })}
                              {entry.workout.notes?.trim() ||
                              entry.workout.text.trim()
                                ? ` · ${entry.workout.notes?.trim() || entry.workout.text.trim()}`
                                : ""}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={tWorkout("buttons.delete")}
                          onClick={() => {
                            if (!selectedDay) return;
                            void deleteWorkout(
                              selectedDay.week,
                              selectedDay.day,
                              entry.sessionIndex,
                            );
                          }}
                          className="ml-2 grid size-9 shrink-0 place-items-center rounded-full text-red-600 active:bg-red-50 dark:active:bg-red-950/30"
                        >
                          <Trash2 className="size-[15px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-10 text-center">
                    <span className="grid size-12 place-items-center rounded-full bg-background text-muted-foreground">
                      <CalendarPlus className="size-5" />
                    </span>
                    <div className="mt-3 text-sm text-muted-foreground">
                      {tCreate("calendarSelection.emptyDayHint")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <div className="hidden rounded-md border border-border/80 pc:block">
        <div className="grid grid-cols-7 border-b md:grid-cols-8">
          <div className="hidden border-r p-2 text-mobile-caption pc:text-xs text-muted-foreground md:block">
            {t("grid.weekDay")}
          </div>
          {WEEKDAY_KEYS.map((key) => (
            <div
              key={key}
              className="border-r p-2 text-center text-mobile-caption pc:text-[11px] font-medium text-muted-foreground md:text-mobile-caption"
            >
              {tWd(key)}
            </div>
          ))}
        </div>

        <div
          className={`overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] ${scrollAreaClassName}`}
        >
          {Array.from({ length: weeks }).map((_, w) => (
            <React.Fragment key={w}>
              <div className="block border-b p-2 text-mobile-caption pc:text-xs text-muted-foreground md:hidden">
                {t("grid.weekLabel", { week: w + 1 })}
              </div>
              <div className="grid grid-cols-7 border-b last:border-b-0 md:grid-cols-8">
                <div className="hidden border-r p-2 text-mobile-caption pc:text-xs text-muted-foreground md:block">
                  {t("grid.weekLabel", { week: w + 1 })}
                </div>
                {Array.from({ length: days }).map((_, d) => {
                  const sessions = workoutEntryGrid[w]?.[d] ?? [];
                  return (
                    <div
                      key={d}
                      className="flex min-h-[120px] flex-col border-r p-1.5 last:border-r-0 md:min-h-[140px] md:border-t-0 md:p-2"
                    >
                      <div className="flex shrink-0 items-center justify-between gap-1">
                        <span className="text-mobile-unit pc:text-[10px] tabular-nums text-muted-foreground md:text-mobile-caption">
                          {t("sessions.count", { count: sessions.length })}
                        </span>
                        <Button
                          type="button"
                          size="compact"
                          variant="ghost"
                          className="shrink-0 px-1.5 text-mobile-unit pc:text-[10px] md:text-mobile-caption"
                          onClick={() =>
                            onAddSession(
                              w,
                              d,
                              getNextSessionIndexAt(current, w, d),
                            )
                          }
                        >
                          + {t("sessions.add")}
                        </Button>
                      </div>
                      <div className="mt-1 flex flex-1 flex-col gap-1.5">
                        {sessions.map((entry) => (
                          <button
                            key={`${w}-${d}-${entry.sessionIndex}`}
                            type="button"
                            className="block w-full rounded-md border border-border/60 bg-background px-1.5 py-1 text-left transition hover:border-primary/40 hover:bg-primary/5"
                            onClick={() =>
                              onEditSession(w, d, entry.sessionIndex)
                            }
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-mobile-unit pc:text-[10px] font-medium md:text-mobile-caption">
                                S
                                {globalSessionOrdinal.get(
                                  `${w}:${d}:${entry.sessionIndex}`,
                                ) ?? entry.sessionIndex}
                              </span>
                              <span className="text-mobile-micro text-muted-foreground pc:text-[9px]">
                                {entry.workout.name?.trim() ||
                                  getLocalizedSportDefinitionCodeName(
                                    entry.workout.sportDefinitionCode,
                                    entry.workout.sportType ?? "RUN",
                                    tSports,
                                  )}
                              </span>
                            </div>
                            {entry.workout.structure ? (
                              <div className="mt-0.5">
                                <WorkoutRenderer
                                  workout={{
                                    structureKind:
                                      entry.workout.structureKind ??
                                      entry.workout.structure.kind,
                                    structure: entry.workout.structure,
                                    summary: entry.workout.summary ?? undefined,
                                    blocks: entry.workout.blocks,
                                    text: entry.workout.text,
                                    sportType:
                                      entry.workout.sportType ?? "UNKNOWN",
                                  }}
                                  density="COMPACT"
                                />
                              </div>
                            ) : entry.workout.blocks ? (
                              <div className="mt-0.5">
                                <WorkoutPlanChart
                                  plan={entry.workout.blocks}
                                  sportType={entry.workout.sportType ?? "RUN"}
                                  hideAxes
                                  hideTooltip
                                  height={48}
                                />
                              </div>
                            ) : (
                              <div className="mt-0.5 line-clamp-2 text-mobile-unit pc:text-[10px] text-muted-foreground md:text-mobile-caption">
                                {entry.workout.notes?.trim() ||
                                  entry.workout.text.trim()}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

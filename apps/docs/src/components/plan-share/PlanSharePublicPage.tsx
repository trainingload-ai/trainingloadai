"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  firstBusyWeekIndex,
  groupSharePreviewWeeks,
  uniqueSportTypes,
  type SharePreviewWorkout,
} from "@shared/plan-share-preview";
import { DemoWorkoutPlanChart } from "@/components/charts/demo-workout-plan-chart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enduranceStructureToChartSegments } from "@/lib/plan-share-chart";
import type { PublicPlanSharePreview } from "@/lib/plan-share";
import { planShareImportUrl } from "@/lib/plan-share";
import { cn } from "@/lib/utils";

function formatLoad(value: number) {
  return Math.round(value).toString();
}

function sportKey(sportType: string) {
  if (
    sportType === "RUN" ||
    sportType === "CYCLING" ||
    sportType === "SWIM" ||
    sportType === "STRETCHING"
  ) {
    return sportType;
  }
  return null;
}

export function PlanSharePublicPage({
  preview,
  lang,
}: {
  preview: PublicPlanSharePreview;
  lang: string;
}) {
  const t = useTranslations("planShare");
  const weeks = useMemo(
    () => groupSharePreviewWeeks(preview.workouts, preview.periodWeeks),
    [preview.periodWeeks, preview.workouts],
  );
  const [selectedWeek, setSelectedWeek] = useState(() =>
    firstBusyWeekIndex(weeks),
  );
  const [openWorkout, setOpenWorkout] = useState<SharePreviewWorkout | null>(
    null,
  );
  const sports = uniqueSportTypes(preview.sportTypes, preview.workouts);
  const importHref = planShareImportUrl(
    lang,
    preview.lineagePublicId || preview.publicId,
  );
  const maxWeekLoad = weeks.reduce(
    (max, week) => Math.max(max, week.previewLoad),
    0,
  );
  const sportLabel = (sportType: string) => {
    const key = sportKey(sportType);
    return key ? t(`sport.${key}`) : sportType;
  };

  const selectWeek = (weekIndex: number) => {
    setSelectedWeek(weekIndex);
    document
      .getElementById(`share-week-${weekIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 pb-28 md:px-6">
      <header className="rounded-surface border border-border/70 bg-muted/30 p-4 md:p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{t("notActivated")}</span>
        </div>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("badge")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {preview.title}
        </h1>
        {preview.goal ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {preview.goal}
          </p>
        ) : null}
        {preview.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {preview.description}
          </p>
        ) : null}
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <aside className="order-1 space-y-4 lg:order-none lg:col-start-2">
          <section className="rounded-surface border border-border/70 p-4">
            <h2 className="text-sm font-semibold">{t("takeCta")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("takeHint")}
            </p>
            <a
              href={importHref}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-compact bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("takeCta")}
            </a>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {t("disclaimer")}
            </p>
          </section>
          {sports.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sports.map((sport) => (
                <span
                  key={sport}
                  className="rounded-compact bg-muted px-2.5 py-1 text-xs font-medium"
                >
                  {sportLabel(sport)}
                </span>
              ))}
            </div>
          ) : null}
        </aside>

        <div className="order-2 space-y-4 lg:order-none lg:col-start-1 lg:row-start-1">
          <section className="rounded-surface border border-border/70 p-4">
            <h2 className="text-sm font-semibold">{t("overviewTitle")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { label: t("statWeeks"), value: String(preview.periodWeeks) },
                {
                  label: t("statDaysPerWeek"),
                  value: String(preview.trainingDaysPerWeek),
                },
                {
                  label: t("statWorkouts"),
                  value: String(preview.workoutCount),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-compact bg-muted/60 px-3 py-2.5"
                >
                  <div className="text-xs text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xl font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {maxWeekLoad > 0 ? (
            <section className="rounded-surface border border-border/70 p-4">
              <h2 className="text-sm font-semibold">{t("loadTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("loadHint")}
              </p>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {weeks.map((week) => {
                  const height =
                    week.previewLoad <= 0
                      ? "1px"
                      : `max(1px, ${(week.previewLoad / maxWeekLoad) * 100}%)`;
                  const selected = week.weekIndex === selectedWeek;
                  return (
                    <button
                      key={week.weekIndex}
                      type="button"
                      onClick={() => selectWeek(week.weekIndex)}
                      aria-pressed={selected}
                      className={cn(
                        "relative flex w-[82px] shrink-0 flex-col overflow-hidden rounded-compact bg-muted/60 px-3 py-2.5 text-left",
                        selected && "ring-1 ring-foreground/25",
                      )}
                    >
                      <div
                        className="absolute bottom-0 left-0 w-full bg-emerald-500/80"
                        style={{ height }}
                      />
                      <span className="relative z-10 text-xs font-medium">
                        W{week.weekIndex}
                      </span>
                      <div className="relative z-10 mt-2 h-24" />
                      <span className="relative z-10 mt-2 text-[10px] text-muted-foreground">
                        {formatLoad(week.previewLoad)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-surface border border-border/70 p-4">
            <h2 className="text-sm font-semibold">{t("weekBreakdownTitle")}</h2>
            {weeks.map((week) => (
              <div
                key={week.weekIndex}
                id={`share-week-${week.weekIndex}`}
                className="scroll-mt-24 rounded-compact bg-muted/40 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {t("weekTitle", { week: week.weekIndex })}
                    </div>
                    {week.previewLoad > 0 ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t("loadBadge", {
                          value: formatLoad(week.previewLoad),
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground">
                    {t("sessionsCount", { count: week.sessionCount })}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {week.days.map((day) => (
                    <div
                      key={`${week.weekIndex}-${day.dayIndex}`}
                      className="rounded-compact bg-background p-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium">
                          {t(`weekday.${day.dayIndex}`)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("sessionsCount", { count: day.workouts.length })}
                        </div>
                      </div>
                      {day.workouts.length === 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {t("emptyDay")}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {day.workouts.map((workout) => (
                            <WorkoutRow
                              key={`${workout.weekIndex}-${workout.dayIndex}-${workout.sessionIndex}`}
                              workout={workout}
                              sportLabel={sportLabel(workout.sportType)}
                              loadLabel={
                                workout.previewLoad
                                  ? t("loadBadge", {
                                      value: formatLoad(workout.previewLoad),
                                    })
                                  : undefined
                              }
                              onOpen={() => setOpenWorkout(workout)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/90 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{preview.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t("takeHint")}
            </p>
          </div>
          <a
            href={importHref}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-compact bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {t("takeCta")}
          </a>
        </div>
      </div>

      <Dialog
        open={openWorkout != null}
        onOpenChange={(open) => {
          if (!open) setOpenWorkout(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {openWorkout
                ? t("dialogTitleWithWeek", {
                    week: openWorkout.weekIndex,
                    day: t(`weekday.${openWorkout.dayIndex}`),
                  })
                : t("dialogTitle")}
            </DialogTitle>
          </DialogHeader>
          {openWorkout ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">
                  {openWorkout.name?.trim() ||
                    sportLabel(openWorkout.sportType)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {sportLabel(openWorkout.sportType)}
                </div>
              </div>
              {openWorkout.previewLoad ? (
                <p className="text-xs text-muted-foreground">
                  {t("loadGenericTip", {
                    value: formatLoad(openWorkout.previewLoad),
                  })}
                </p>
              ) : null}
              {openWorkout.notes ? (
                <div>
                  <div className="text-sm font-medium">{t("notesLabel")}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {openWorkout.notes}
                  </p>
                </div>
              ) : null}
              {enduranceStructureToChartSegments(openWorkout.structure).length >
              0 ? (
                <div>
                  <div className="text-sm font-medium">{t("chartLabel")}</div>
                  <div className="mt-2 overflow-hidden rounded-compact bg-muted/40">
                    <DemoWorkoutPlanChart
                      segments={enduranceStructureToChartSegments(
                        openWorkout.structure,
                      )}
                      height={160}
                      compact
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkoutRow({
  workout,
  sportLabel,
  loadLabel,
  onOpen,
}: {
  workout: SharePreviewWorkout;
  sportLabel: string;
  loadLabel?: string;
  onOpen: () => void;
}) {
  const segments = enduranceStructureToChartSegments(workout.structure);
  const title = workout.name?.trim() || sportLabel;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-compact bg-muted/50 px-2.5 py-2 text-left transition-colors hover:bg-muted"
    >
      {segments.length > 0 ? (
        <div className="w-[130px] shrink-0 overflow-hidden rounded-compact">
          <DemoWorkoutPlanChart
            segments={segments}
            height={44}
            compact
            hideAxes
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {workout.name?.trim() ? (
          <div className="text-[11px] text-muted-foreground">{sportLabel}</div>
        ) : null}
        <div className="truncate text-sm font-medium">{title}</div>
        {workout.notes ? (
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {workout.notes}
          </div>
        ) : null}
        {loadLabel ? (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {loadLabel}
          </div>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

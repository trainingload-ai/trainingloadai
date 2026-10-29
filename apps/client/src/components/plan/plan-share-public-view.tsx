"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PlanSharePreview } from "@/api/plans";
import { SportType } from "@/api/activities";
import { getSportTypeIcon } from "@/utils/sportTypeUtils";
import { cn } from "@/lib/utils";
import { PlanDescriptionRich } from "@/components/plan/plan-description-rich";
import {
  Panel,
  SectionTitle,
} from "@/components/plan/detail/plan-detail-panel";
import {
  firstBusyWeekIndex,
  groupSharePreviewWeeks,
  uniqueSportTypes,
  type SharePreviewWeek,
  type SharePreviewWorkout,
} from "@/components/plan/plan-share-preview-model";
import { PlanShareWorkoutDialog } from "@/components/plan/plan-share-workout-dialog";
import { PlanShareWorkoutPreview } from "@/components/plan/plan-share-workout-preview";

function asSportType(value: string): SportType {
  if (value === SportType.CYCLING) return SportType.CYCLING;
  if (value === SportType.SWIM) return SportType.SWIM;
  if (value === SportType.STRETCHING) return SportType.STRETCHING;
  if (value === SportType.RUN) return SportType.RUN;
  return SportType.UNKNOWN;
}

function sportLabel(
  t: (key: "sport.RUN" | "sport.CYCLING" | "sport.SWIM" | "sport.STRETCHING") => string,
  sportType: string,
) {
  switch (sportType) {
    case "RUN":
      return t("sport.RUN");
    case "CYCLING":
      return t("sport.CYCLING");
    case "SWIM":
      return t("sport.SWIM");
    case "STRETCHING":
      return t("sport.STRETCHING");
    default:
      return sportType;
  }
}

function formatPreviewLoad(value: number) {
  return Math.round(value).toString();
}

function TakePlanButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function ActionButton({
  className,
  disabled,
  onClick,
  children,
}: {
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold transition-colors disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PlanSharePublicView({
  preview,
  variant = "public",
  confirming = null,
  importError,
  onImport,
}: {
  preview: PlanSharePreview;
  variant?: "public" | "import";
  confirming?: "import" | "share" | null;
  importError?: string;
  onImport?: (share: boolean) => void;
}) {
  const t = useTranslations("PlanShareImportPage");
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
  const importHref = `/plans/import/share/${preview.lineagePublicId || preview.publicId}`;
  const isImport = variant === "import";
  const loadPersonalized = Boolean(preview.loadPersonalized);
  const loadHint = loadPersonalized ? t("loadPersonalizedHint") : t("loadHint");
  const maxWeekLoad = weeks.reduce(
    (max, week) => Math.max(max, week.previewLoad),
    0,
  );

  const selectWeek = (weekIndex: number) => {
    setSelectedWeek(weekIndex);
    document
      .getElementById(`share-week-${weekIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-safe-or-3 py-3 pb-28 pc:px-safe-or-2">
      {isImport ? (
        <Link
          href="/plans"
          className="mb-2 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {t("backToPlans")}
        </Link>
      ) : null}
      <header className="shrink-0">
        <section className="relative rounded-md bg-neutral-100 p-2.5 dark:bg-muted/45">
          <span className="absolute right-2.5 top-2.5 inline-flex items-center rounded-md bg-background px-2 py-1 text-mobile-caption pc:text-[11px] text-muted-foreground dark:bg-black/20">
            {isImport ? t("title") : t("publicBadge")}
          </span>
          <div className="min-w-0 pr-28">
            <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{t("notActivated")}</span>
            </div>
            <h1 className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
              {preview.title}
            </h1>
          </div>
          {preview.goal || preview.description ? (
            <div className="mt-2 space-y-3">
              {preview.goal ? (
                <div>
                  <div className="text-mobile-unit pc:text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("goalLabel")}
                  </div>
                  <div className="mt-1 text-mobile-caption pc:text-xs">
                    <PlanDescriptionRich
                      markdown={preview.goal}
                      variant="detail"
                    />
                  </div>
                </div>
              ) : null}
              {preview.description ? (
                <div>
                  <div className="text-mobile-unit pc:text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("descriptionLabel")}
                  </div>
                  <div className="mt-1 text-mobile-caption pc:text-xs">
                    <PlanDescriptionRich
                      markdown={preview.description}
                      variant="detail"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </header>

      <div
        className={cn(
          "mt-3 flex min-h-0 flex-1 flex-col gap-3 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start",
          "pc:[grid-template-areas:'main_aside']",
        )}
      >
        <aside className="order-1 flex min-w-0 flex-col gap-3 pc:order-none pc:[grid-area:aside]">
          <Panel className="space-y-3">
            <SectionTitle title={isImport ? t("importTitle") : t("takeCta")} />
            <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
              <p className="text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                {isImport ? t("importHint") : t("takeHint")}
              </p>
              {isImport ? (
                <div className="mt-3 flex flex-col gap-2">
                  <ActionButton
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={confirming !== null}
                    onClick={() => onImport?.(false)}
                  >
                    {confirming === "import" ? t("importing") : t("import")}
                  </ActionButton>
                  <ActionButton
                    className="w-full border border-border bg-background hover:bg-muted/60"
                    disabled={confirming !== null}
                    onClick={() => onImport?.(true)}
                  >
                    {confirming === "share" ? t("importing") : t("importAndShare")}
                  </ActionButton>
                </div>
              ) : (
                <TakePlanButton href={importHref} className="mt-3 w-full">
                  {t("takeCta")}
                </TakePlanButton>
              )}
              {importError ? (
                <p className="mt-2 text-mobile-caption pc:text-xs text-destructive">
                  {importError}
                </p>
              ) : null}
              <p className="mt-2 text-mobile-caption pc:text-[11px] leading-5 text-muted-foreground">
                {t("disclaimer")}
              </p>
            </div>
          </Panel>
          {sports.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sports.map((sport) => (
                <span
                  key={sport}
                  className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium dark:bg-muted/45"
                >
                  {getSportTypeIcon(asSportType(sport), "h-3.5 w-3.5")}
                  {sportLabel(t, sport)}
                </span>
              ))}
            </div>
          ) : null}
        </aside>

        <main className="order-2 flex min-w-0 flex-1 flex-col gap-3 pc:order-none pc:[grid-area:main]">
          <Panel className="shrink-0 space-y-3">
            <SectionTitle title={t("overviewTitle")} />
            <div className="grid gap-2 sm:grid-cols-3">
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
                  className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45"
                >
                  <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xl font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
          </Panel>

          {maxWeekLoad > 0 ? (
            <Panel className="shrink-0 space-y-3">
              <SectionTitle title={t("loadTitle")} />
              <p className="text-mobile-caption pc:text-xs text-muted-foreground">
                {loadHint}
              </p>
              <WeeklyLoadChart
                weeks={weeks}
                selectedWeek={selectedWeek}
                maxLoad={maxWeekLoad}
                onSelect={selectWeek}
                weekTooltip={(week) =>
                  t("weekLoadTooltip", {
                    week: week.weekIndex,
                    load: formatPreviewLoad(week.previewLoad),
                    count: week.sessionCount,
                  })
                }
              />
            </Panel>
          ) : null}

          <Panel className="flex min-h-0 flex-1 flex-col gap-3">
            <SectionTitle title={t("weekBreakdownTitle")} />
            <div className="space-y-3">
              {weeks.map((week) => (
                <div
                  key={week.weekIndex}
                  id={`share-week-${week.weekIndex}`}
                  className="scroll-mt-16 rounded-md bg-neutral-100 p-3 dark:bg-muted/45"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {t("weekTitle", { week: week.weekIndex })}
                      </div>
                      {week.previewLoad > 0 ? (
                        <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                          {t("loadBadge", {
                            value: formatPreviewLoad(week.previewLoad),
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-md bg-background px-2 py-1 text-mobile-caption pc:text-[11px] text-muted-foreground dark:bg-black/20">
                      {t("sessionsCount", { count: week.sessionCount })}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {week.days.map((day) => (
                      <div
                        key={`${week.weekIndex}-${day.dayIndex}`}
                        className="rounded-md bg-background p-2.5 dark:bg-black/20"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-mobile-caption pc:text-xs font-medium text-foreground">
                            {t(`weekday.${day.dayIndex}`)}
                          </div>
                          <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                            {t("sessionsCount", {
                              count: day.workouts.length,
                            })}
                          </div>
                        </div>
                        {day.workouts.length === 0 ? (
                          <div className="mt-2 text-mobile-caption pc:text-xs text-muted-foreground">
                            {t("emptyDay")}
                          </div>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {day.workouts.map((workout) => (
                              <PlanShareWorkoutPreview
                                key={`${workout.weekIndex}-${workout.dayIndex}-${workout.sessionIndex}`}
                                workout={workout}
                                sportLabel={sportLabel(t, workout.sportType)}
                                loadLabel={
                                  workout.previewLoad
                                    ? t("loadBadge", {
                                        value: formatPreviewLoad(
                                          workout.previewLoad,
                                        ),
                                      })
                                    : undefined
                                }
                                openDetailsLabel={t("openDetailsAria", {
                                  title:
                                    workout.name?.trim() ||
                                    sportLabel(t, workout.sportType),
                                })}
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
            </div>
          </Panel>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/90 backdrop-blur-md pc:hidden">
        <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{preview.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isImport ? t("importHint") : t("takeHint")}
            </p>
          </div>
          {isImport ? (
            <ActionButton
              className="h-10 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={confirming !== null}
              onClick={() => onImport?.(false)}
            >
              {confirming === "import" ? t("importing") : t("import")}
            </ActionButton>
          ) : (
            <TakePlanButton href={importHref} className="h-10 shrink-0">
              {t("takeCta")}
            </TakePlanButton>
          )}
        </div>
      </div>

      <PlanShareWorkoutDialog
        open={openWorkout != null}
        onOpenChange={(open) => {
          if (!open) setOpenWorkout(null);
        }}
        workout={openWorkout}
        title={
          openWorkout
            ? t("dialogTitleWithWeek", {
                week: openWorkout.weekIndex,
                day: t(`weekday.${openWorkout.dayIndex}`),
              })
            : t("dialogTitle")
        }
        sportLabel={
          openWorkout ? sportLabel(t, openWorkout.sportType) : ""
        }
        notesLabel={t("notesLabel")}
        chartLabel={t("chartLabel")}
        loadLabel={
          openWorkout?.previewLoad
            ? t(
                loadPersonalized ? "loadPersonalizedTip" : "loadGenericTip",
                { value: formatPreviewLoad(openWorkout.previewLoad) },
              )
            : undefined
        }
        closeLabel={t("close")}
      />
    </div>
  );
}

function WeeklyLoadChart({
  weeks,
  selectedWeek,
  maxLoad,
  onSelect,
  weekTooltip,
}: {
  weeks: SharePreviewWeek[];
  selectedWeek: number;
  maxLoad: number;
  onSelect: (weekIndex: number) => void;
  weekTooltip: (week: SharePreviewWeek) => string;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {weeks.map((week) => {
        const height =
          week.previewLoad <= 0
            ? "1px"
            : `max(1px, ${(week.previewLoad / maxLoad) * 100}%)`;
        const selected = week.weekIndex === selectedWeek;
        return (
          <button
            key={week.weekIndex}
            type="button"
            onClick={() => onSelect(week.weekIndex)}
            title={weekTooltip(week)}
            aria-pressed={selected}
            className={cn(
              "group relative flex min-w-0 w-[82px] shrink-0 flex-col overflow-hidden rounded-md bg-neutral-100 px-3 py-2.5 text-left dark:bg-muted/45",
              selected && "ring-1 ring-foreground/25",
            )}
          >
            <div
              className="absolute bottom-0 left-0 w-full bg-[hsl(var(--emerald-500)/0.88)]"
              style={{ height }}
            />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <span className="text-mobile-caption pc:text-xs font-medium text-foreground">
                W{week.weekIndex}
              </span>
            </div>
            <div className="relative z-10 mt-2 h-24" />
            <div className="relative z-10 mt-2 text-mobile-unit pc:text-[10px] text-muted-foreground">
              {formatPreviewLoad(week.previewLoad)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

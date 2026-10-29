"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Button } from "@/components/ui/button";
import { ManualPlanMetaForm } from "@/components/plan/manual-plan-meta-form";
import type { ManualPlanMetaValues } from "@/components/plan/manual-plan-meta-form";
import {
  listWorkoutEntries,
  usePlanStore,
  type Workout,
  type WorkoutEntry,
} from "@/lib/plan-store";
import { planCurrentToCoachPlanDraft } from "@/lib/coach-plan-draft";
import { useCreatePlanFromDraft } from "@/api/usePlanMutations";
import { cn } from "@/lib/utils";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import { MobileTopBarAction } from "@/components/mobile-app/components/MobileTopBar";
import { PlanDescriptionRich } from "@/components/plan/plan-description-rich";
import { getLocalizedSportDefinitionCodeName } from "@/api/sports";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getPlanLibraryHref,
  MOBILE_PLAN_LIBRARY_HREF,
} from "@/lib/plan-navigation";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function PlanStepFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-80 animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45"
    />
  );
}

const ManualPlanWeekGrid = dynamic(
  () =>
    import("@/components/plan/manual-plan-week-grid").then(
      (module) => module.ManualPlanWeekGrid,
    ),
  { loading: PlanStepFallback, ssr: false },
);

const EditWorkoutDialog = dynamic(
  () =>
    import("@/components/plan/EditWorkoutDialog").then(
      (module) => module.EditWorkoutDialog,
    ),
  { ssr: false },
);

const CoachPlanDraftCalendarPreview = dynamic(
  () =>
    import("@/app/[locale]/(main)/ai-coach/coach-plan-draft-calendar-preview").then(
      (module) => module.CoachPlanDraftCalendarPreview,
    ),
  { loading: PlanStepFallback, ssr: false },
);

const WorkoutRenderer = dynamic(
  () =>
    import("@/components/workout/WorkoutRenderer").then(
      (module) => module.WorkoutRenderer,
    ),
  { ssr: false },
);

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MOBILE_ACTION_BAR_CLASS_NAME =
  "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border/60 bg-background/95 px-4 pb-2 pt-3 backdrop-blur";

function workoutDurationSeconds(workout: Workout) {
  if (typeof workout.summary?.durationSeconds === "number") {
    return Math.max(0, workout.summary.durationSeconds);
  }
  const structure = workout.structure;
  if (structure?.kind === "STRENGTH") {
    return Math.max(0, structure.durationSeconds ?? 0);
  }
  if (structure?.kind !== "ENDURANCE") return 0;

  const sumBlocks = (blocks: typeof structure.blocks): number =>
    blocks.reduce((total, block) => {
      if (block.type === "repeat") {
        return total + Math.max(1, block.count) * sumBlocks(block.children);
      }
      return (
        total +
        block.steps.reduce(
          (stepTotal, step) => stepTotal + Math.max(0, step.duration ?? 0),
          0,
        )
      );
    }, 0);

  return sumBlocks(structure.blocks);
}

function workoutRelativeLoad(workout: Workout) {
  const durationHours = workoutDurationSeconds(workout) / 3600;
  const intensity =
    workout.summary?.kind === "STRENGTH"
      ? Math.max(0.35, (workout.summary.plannedSessionRpe ?? 6) / 10)
      : workout.summary?.hardSession
        ? 0.85
        : 0.62;
  return Math.max(1, durationHours * intensity * intensity * 100);
}

function ManualPlanReviewLoadChart({
  entries,
  weeks,
}: {
  entries: WorkoutEntry[];
  weeks: number;
}) {
  const t = useTranslations("PlanSummary");
  const tCreate = useTranslations("PlanCreatePage");
  const weeklyLoads = Array.from({ length: weeks }, (_, weekIndex) => {
    const workouts = entries.filter((entry) => entry.weekIndex === weekIndex);
    return {
      load: workouts.reduce(
        (total, entry) => total + workoutRelativeLoad(entry.workout),
        0,
      ),
      sessions: workouts.length,
      weekIndex,
    };
  });
  const maxLoad = Math.max(1, ...weeklyLoads.map((week) => week.load));

  return (
    <section className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
      <h2 className="text-sm font-semibold text-foreground">{t("weekly")}</h2>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {weeklyLoads.map((week) => {
          const weekLabel = tCreate("calendarSelection.weekLabel", {
            week: week.weekIndex + 1,
          });
          return (
            <div
              key={week.weekIndex}
              role="img"
              aria-label={`${weekLabel} · ${week.sessions}`}
              className="w-11 shrink-0"
            >
              <div className="flex h-20 items-end overflow-hidden rounded-control bg-background px-1.5 pt-2 dark:bg-black/20">
                <div
                  className="w-full rounded-t-xs bg-emerald-500/75 dark:bg-emerald-400/65"
                  style={{
                    height:
                      week.sessions === 0
                        ? "2px"
                        : `${Math.max(10, (week.load / maxLoad) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1 truncate text-center text-mobile-caption pc:text-[11px] font-medium tabular-nums text-muted-foreground">
                {week.weekIndex + 1}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-surface pc:bg-neutral-100 pc:p-3 pc:dark:bg-muted/45",
        className,
      )}
    >
      {children}
    </section>
  );
}

function MobileManualPlanNavigation({
  step,
  onBack,
}: {
  step: 1 | 2 | 3;
  onBack: () => void;
}) {
  const t = useTranslations("PlanCreatePage");

  useMobileNavigation({
    title: t("title"),
    subtitle: `${step} / 3`,
    leading:
      step > 1 ? (
        <MobileTopBarAction
          onClick={onBack}
          aria-label={t("buttons.back")}
          edge="leading"
        >
          <ChevronLeft className="size-5" />
        </MobileTopBarAction>
      ) : undefined,
    trailing: (
      <MobileTopBarAction asChild edge="trailing">
        <Link href={MOBILE_PLAN_LIBRARY_HREF} aria-label={t("buttons.cancel")}>
          <X className="size-5" />
        </Link>
      </MobileTopBarAction>
    ),
  });

  return null;
}

function MobileStepProgress({
  step,
  t,
}: {
  step: 1 | 2 | 3;
  t: ReturnType<typeof useTranslations>;
}) {
  const title = step === 3 ? t("steps.review.title") : t(`steps.${step}.title`);
  const description =
    step === 3 ? t("steps.review.description") : t(`steps.${step}.description`);

  return (
    <div className="space-y-3 px-1 pc:hidden">
      <div className="flex gap-2">
        {[1, 2, 3].map((value) => (
          <div
            key={value}
            className={cn(
              "h-1 flex-1 rounded-full",
              value <= step ? "bg-foreground" : "bg-muted",
            )}
          />
        ))}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="text-sm leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export default function ManualPlanCreatePage() {
  const t = useTranslations("PlanCreatePage");
  const tNav = useTranslations("V2PlanCreatePage");
  const tPlans = useTranslations("V2PlansPage");
  const tCurrentPlan = useTranslations("V2PlanPage");
  const tSports = useTranslations("SportCatalog");
  const tWeekdays = useTranslations("PlanCreatePage.weekdays");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const router = useRouter();
  const isMobile = useIsMobile();
  useSetPageTitle(t("title"));

  const clear = usePlanStore((s) => s.clear);
  const initCurrent = usePlanStore((s) => s.initCurrent);
  const current = usePlanStore((s) => s.current);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [daySheetRequest, setDaySheetRequest] = useState<{
    day: number;
    requestId: number;
    week: number;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    week: number;
    day: number;
    sessionIndex: number;
    kind?: "ENDURANCE" | "STRENGTH";
  } | null>(null);
  const [reviewingCell, setReviewingCell] = useState<{
    week: number;
    day: number;
    sessionIndex: number;
  } | null>(null);

  const { mutateAsync: savePlan, isPending: saving } = useCreatePlanFromDraft();

  useEffect(() => {
    clear();
  }, [clear]);

  const reviewDraft = useMemo(() => {
    if (!current) return null;
    try {
      return planCurrentToCoachPlanDraft(current);
    } catch {
      return null;
    }
  }, [current]);
  const reviewEntries = useMemo(() => listWorkoutEntries(current), [current]);
  const trainingDayCount = useMemo(
    () => new Set(reviewEntries.map((entry) => entry.dayOffset)).size,
    [reviewEntries],
  );

  const onMetaSubmit = (values: ManualPlanMetaValues) => {
    initCurrent(values.name, values.weeks, values.description || "");
    setStep(2);
  };

  const goSave = async () => {
    const dto = usePlanStore.getState().serializeToCreate();
    if (!dto?.workouts?.length) {
      toast.error(t("validation.needWorkout"));
      return;
    }
    try {
      await savePlan();
      router.replace(getPlanLibraryHref(isMobile));
    } catch {
      /* toast handled in mutation */
    }
  };

  const metaDefaults = useMemo(
    () =>
      current && step === 1
        ? {
            name: current.title,
            weeks: Math.min(24, Math.max(1, current.weeks)),
            description: current.description ?? "",
          }
        : undefined,
    [current, step],
  );

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-2 pc:gap-4 pc:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <MobileManualPlanNavigation
        key={step}
        step={step}
        onBack={() =>
          setStep((currentStep) => Math.max(1, currentStep - 1) as 1 | 2 | 3)
        }
      />

      <header className="hidden shrink-0 px-1 pc:block">
        <Link
          href="/plans"
          className="inline-flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {tNav("header.backToPlans")}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                step >= n ? "bg-foreground/80" : "bg-muted",
              )}
            />
          ))}
        </div>
        <h1 className="mt-2 text-base font-semibold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>

      <MobileStepProgress step={step} t={t} />

      {step === 1 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-3 hidden shrink-0 pc:block">
              <h2 className="text-sm font-semibold">{t("steps.1.title")}</h2>
              <p className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                {t("steps.1.description")}
              </p>
            </div>
            <ManualPlanMetaForm
              hideSubmitButton
              defaultValues={metaDefaults}
              submitLabel={t("buttons.continueToCalendar")}
              onSubmit={onMetaSubmit}
            />
          </Panel>
          <div
            className={cn(
              MOBILE_ACTION_BAR_CLASS_NAME,
              "pc:static pc:z-auto pc:flex pc:shrink-0 pc:justify-end pc:border-0 pc:bg-transparent pc:px-1 pc:pb-0 pc:pt-0 pc:backdrop-blur-none",
            )}
          >
            <Button
              type="submit"
              form="manual-plan-meta-form"
              size="touch"
              className="w-full pc:w-auto"
            >
              {t("buttons.continueToCalendar")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 && current ? (
        <>
          <Panel className="min-h-0 flex-1">
            <div className="mb-3 hidden pc:block">
              <h2 className="text-sm font-semibold">{t("steps.2.title")}</h2>
              <p className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                {t("steps.2.description")}
              </p>
            </div>
            <ManualPlanWeekGrid
              openDayRequest={daySheetRequest}
              onAddSession={(w, d, sessionIndex, kind) => {
                setEditingCell({ week: w, day: d, sessionIndex, kind });
                setWorkoutOpen(true);
              }}
              onEditSession={(w, d, sessionIndex) => {
                setEditingCell({ week: w, day: d, sessionIndex });
                setWorkoutOpen(true);
              }}
            />
          </Panel>
          <div
            className={cn(
              MOBILE_ACTION_BAR_CLASS_NAME,
              "pc:sticky pc:bottom-0 pc:z-10 pc:flex pc:flex-row pc:justify-between pc:bg-background/95 pc:px-0 pc:py-3",
            )}
          >
            <Button
              type="button"
              variant="outline"
              className="hidden w-auto pc:inline-flex"
              onClick={() => setStep(1)}
            >
              {t("buttons.back")}
            </Button>
            <Button
              type="button"
              size="touch"
              className="w-full pc:w-auto"
              onClick={() => setStep(3)}
            >
              {t("buttons.continueToReview")}
            </Button>
          </div>
          {editingCell ? (
            <EditWorkoutDialog
              open={workoutOpen}
              onOpenChange={(o) => {
                setWorkoutOpen(o);
                if (!o && editingCell) {
                  const { day, week } = editingCell;
                  setEditingCell(null);
                  if (isMobile) {
                    setDaySheetRequest((previous) => ({
                      day,
                      week,
                      requestId: (previous?.requestId ?? 0) + 1,
                    }));
                  } else {
                    setDaySheetRequest(null);
                  }
                }
              }}
              weekIndex={editingCell.week}
              dayIndex={editingCell.day}
              sessionIndex={editingCell.sessionIndex}
              initialKind={editingCell.kind}
              mobilePlanLayout={isMobile}
              readOnly={false}
            />
          ) : null}
        </>
      ) : null}

      {step === 3 && current ? (
        <>
          <Panel className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="hidden shrink-0 pc:block">
              <h2 className="text-sm font-semibold">
                {t("steps.review.title")}
              </h2>
              <p className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                {t("steps.review.description")}
              </p>
            </div>
            {reviewDraft ? (
              <>
                <div className="space-y-5 pc:hidden">
                  <section className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
                    <h2 className="text-xl font-semibold text-foreground">
                      {current.title}
                    </h2>
                    {current.description?.trim() ? (
                      <div className="mt-2 text-sm leading-5 text-muted-foreground">
                        <PlanDescriptionRich markdown={current.description} />
                      </div>
                    ) : null}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="min-w-0 rounded-lg bg-background p-3 dark:bg-black/20">
                        <div className="text-mobile-caption pc:text-xs leading-4 text-muted-foreground">
                          {t("baseInfo.fields.weeks")}
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {current.weeks}
                        </div>
                      </div>
                      <div className="min-w-0 rounded-lg bg-background p-3 dark:bg-black/20">
                        <div className="text-mobile-caption pc:text-xs leading-4 text-muted-foreground">
                          {tPlans("stats.plannedSessions")}
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {reviewEntries.length}
                        </div>
                      </div>
                      <div className="min-w-0 rounded-lg bg-background p-3 dark:bg-black/20">
                        <div className="text-mobile-caption pc:text-xs leading-4 text-muted-foreground">
                          {t("calendarSelection.trainingDays")}
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {trainingDayCount}
                        </div>
                      </div>
                    </div>
                  </section>

                  <ManualPlanReviewLoadChart
                    entries={reviewEntries}
                    weeks={current.weeks}
                  />

                  <div className="space-y-3">
                    <h2 className="px-1 text-sm font-semibold text-foreground">
                      {t("calendarSelection.scheduleReview")}
                    </h2>
                    {reviewEntries.map((entry) => (
                      <button
                        type="button"
                        key={`${entry.dayOffset}:${entry.sessionIndex}`}
                        onClick={() =>
                          setReviewingCell({
                            week: entry.weekIndex,
                            day: entry.dayIndex,
                            sessionIndex: entry.sessionIndex,
                          })
                        }
                        className="flex w-full touch-manipulation items-stretch gap-3 rounded-surface bg-neutral-100 p-3 text-left transition-colors hover:bg-neutral-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted/65 dark:active:bg-muted/75"
                      >
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                            {t("calendarSelection.weekLabel", {
                              week: entry.weekIndex + 1,
                            })}{" "}
                            · {tWeekdays(WEEKDAY_KEYS[entry.dayIndex])} ·{" "}
                            {tCurrentPlan("workout.session", {
                              index: entry.sessionIndex,
                            })}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold">
                            {entry.workout.name?.trim() ||
                              getLocalizedSportDefinitionCodeName(
                                entry.workout.sportDefinitionCode,
                                entry.workout.sportType ?? "RUN",
                                tSports,
                              )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <div
                            aria-hidden="true"
                            className="pointer-events-none w-[112px] overflow-hidden rounded-control bg-background dark:bg-black/20"
                          >
                            <WorkoutRenderer
                              workout={{
                                structureKind: entry.workout.structureKind,
                                structure: entry.workout.structure ?? undefined,
                                summary: entry.workout.summary ?? undefined,
                                blocks: entry.workout.blocks,
                                text: entry.workout.text,
                                sportType: entry.workout.sportType ?? "RUN",
                              }}
                              density="COMPACT"
                            />
                          </div>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60 pc:flex">
                  <CoachPlanDraftCalendarPreview
                    draft={reviewDraft}
                    variant="embedded"
                  />
                </div>
              </>
            ) : (
              <div className="rounded-surface bg-muted p-6 text-center text-sm text-muted-foreground pc:border pc:border-dashed pc:border-border/70 pc:bg-transparent">
                {t("validation.needWorkout")}
              </div>
            )}
          </Panel>
          {reviewingCell ? (
            <EditWorkoutDialog
              open
              onOpenChange={(open) => {
                if (!open) setReviewingCell(null);
              }}
              weekIndex={reviewingCell.week}
              dayIndex={reviewingCell.day}
              sessionIndex={reviewingCell.sessionIndex}
              mobilePlanLayout={isMobile}
              readOnly
            />
          ) : null}
          <div
            className={cn(
              MOBILE_ACTION_BAR_CLASS_NAME,
              "pc:sticky pc:bottom-0 pc:z-10 pc:flex pc:flex-row pc:justify-between pc:bg-background/95 pc:px-0 pc:py-3",
            )}
          >
            <Button
              type="button"
              variant="outline"
              className="hidden w-auto pc:inline-flex"
              onClick={() => setStep(2)}
              disabled={saving}
            >
              {t("buttons.back")}
            </Button>
            <Button
              type="button"
              size="touch"
              className="w-full pc:w-auto"
              disabled={saving || publicDemo.active}
              title={publicDemo.active ? demoText("readOnlyAction") : undefined}
              onClick={() => void goSave()}
            >
              {saving ? t("buttons.saving") : t("buttons.savePlan")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import React from "react";
import type { Dayjs } from "dayjs";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import type { Activity, SportType } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import { MobilePlanWorkoutRow } from "@/components/plan/mobile-plan-workout-row";
import { ViewWorkoutDialog } from "@/components/plan/view-workout-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { attachWorkoutToPlan } from "@/api/plans";
import { CalendarCreateWorkoutSheet } from "./calendar-create-workout-sheet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { invalidateActivePlanAndPlanDetails } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Pencil,
  Plus,
} from "lucide-react";
import { getSportDisplayName, useSportCatalog } from "@/api/sports";
import type { CompetitionEvent } from "@/api/competition-events";
import {
  CompetitionEventDetails,
  CompetitionEventDialog,
} from "@/components/competition/competition-event-dialog";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

type WeekStats = {
  count: number;
  distance: number;
  duration: number;
  tss: number;
};

type SummaryScope = {
  key: "plan" | "month";
  title: string;
  description: string;
  comparisonLabel: string;
  stats: WeekStats;
  comparisonStats: WeekStats;
};

function parsePlanBlocks(planWorkout?: PlanWorkout) {
  const blocks = planWorkout?.blocks;
  if (!blocks) return null;
  try {
    if (typeof blocks === "string") {
      const parsed = JSON.parse(blocks);
      return Array.isArray(parsed) ? (parsed as ParsedPlan) : null;
    }
    return Array.isArray(blocks) ? (blocks as ParsedPlan) : null;
  } catch {
    return null;
  }
}

export function CalendarDaySheet({
  selectedDate,
  tss,
  activities,
  planWorkouts = [],
  competitionEvents = [],
  locale,
  activePlanId,
  selectedPlanWorkout = null,
  onSelectPlanWorkout,
  focusedCompetitionEvent = null,
  onFocusCompetitionEvent,
  summaryScopes,
  className,
}: {
  selectedDate: Dayjs;
  tss: number;
  activities: Activity[];
  planWorkouts?: Array<PlanWorkout & { scope?: "inPlan" | "independent" }>;
  competitionEvents?: CompetitionEvent[];
  locale: string;
  activePlanId?: string | null;
  selectedPlanWorkout?: PlanWorkout | null;
  onSelectPlanWorkout?: (workout: PlanWorkout | null) => void;
  focusedCompetitionEvent?: CompetitionEvent | null;
  onFocusCompetitionEvent?: (event: CompetitionEvent | null) => void;
  summaryScopes: {
    defaultKey: "plan" | "month";
    plan: SummaryScope | null;
    month: SummaryScope;
  };
  className?: string;
}) {
  const t = useTranslations("CalendarExperience");
  const tCompetition = useTranslations("CompetitionEvents");
  const tDay = useTranslations("DayCell");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tWeek = useTranslations("WeekSummaryCell");
  const tSports = useTranslations("SportCatalog");
  const { systemUnit } = useStore();
  const { data: sportCatalog = [] } = useSportCatalog();
  const [mobileTab, setMobileTab] = React.useState<"training" | "activity">(
    "training",
  );
  const [summaryScopeKey, setSummaryScopeKey] = React.useState<
    "plan" | "month"
  >(summaryScopes.defaultKey);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [competitionDialogOpen, setCompetitionDialogOpen] =
    React.useState(false);
  const [competitionDialogInitialMode, setCompetitionDialogInitialMode] =
    React.useState<"view" | "edit">("view");
  const [selectedCompetitionEvent, setSelectedCompetitionEvent] =
    React.useState<CompetitionEvent | null>(null);
  const queryClient = useQueryClient();

  const setSelectedPlanWorkout = React.useCallback(
    (workout: PlanWorkout | null) => {
      onSelectPlanWorkout?.(workout);
    },
    [onSelectPlanWorkout],
  );

  const attachMutation = useMutation({
    mutationFn: async (workoutId: string) => {
      if (!activePlanId) {
        throw new Error(t("createWorkout.missingActivePlan"));
      }
      return attachWorkoutToPlan(activePlanId, workoutId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() }),
        queryClient.invalidateQueries({ queryKey: ["scheduled-workouts"] }),
        invalidateActivePlanAndPlanDetails(queryClient),
      ]);
      toast.success(t("attachSuccess"));
      setSelectedPlanWorkout(null);
    },
    onError: () => {
      toast.error(t("attachFailed"));
    },
  });

  React.useEffect(() => {
    setMobileTab("training");
  }, [selectedDate, planWorkouts]);

  React.useEffect(() => {
    setSummaryScopeKey(summaryScopes.defaultKey);
  }, [summaryScopes.defaultKey]);

  const activeSummaryScope =
    summaryScopeKey === "plan" && summaryScopes.plan
      ? summaryScopes.plan
      : summaryScopes.month;

  const summaryItems = [
    {
      key: "count",
      label: tWeek("count"),
      value: String(activeSummaryScope.stats.count),
      delta:
        activeSummaryScope.stats.count -
        (activeSummaryScope.comparisonStats.count || 0),
    },
    {
      key: "tss",
      label: tWeek("tss"),
      value: String(Math.round(activeSummaryScope.stats.tss)),
      delta: Math.round(
        activeSummaryScope.stats.tss -
          (activeSummaryScope.comparisonStats.tss || 0),
      ),
    },
    {
      key: "distance",
      label: tWeek("distance"),
      value: `${formatValue(activeSummaryScope.stats.distance, "distance", systemUnit)} ${getUnit("distance", systemUnit)}`,
      delta:
        activeSummaryScope.stats.distance -
        (activeSummaryScope.comparisonStats.distance || 0),
    },
    {
      key: "duration",
      label: tWeek("duration"),
      value: formatValue(
        activeSummaryScope.stats.duration,
        "duration",
        systemUnit,
      ),
      delta:
        activeSummaryScope.stats.duration -
        (activeSummaryScope.comparisonStats.duration || 0),
    },
  ];

  const openCompetitionEvent = React.useCallback(
    (event: CompetitionEvent) => {
      if (onFocusCompetitionEvent) {
        onFocusCompetitionEvent(event);
        return;
      }
      setSelectedCompetitionEvent(event);
      setCompetitionDialogInitialMode("view");
      setCompetitionDialogOpen(true);
    },
    [onFocusCompetitionEvent],
  );

  if (focusedCompetitionEvent) {
    return (
      <section
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="-ml-2"
            onClick={() => onFocusCompetitionEvent?.(null)}
          >
            <ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />
            {tCompetition("actions.close")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedCompetitionEvent(focusedCompetitionEvent);
              setCompetitionDialogInitialMode("edit");
              setCompetitionDialogOpen(true);
            }}
          >
            <Pencil aria-hidden="true" className="mr-1.5 h-4 w-4" />
            {tCompetition("actions.edit")}
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto px-3.5 pb-5">
          <CompetitionEventDetails event={focusedCompetitionEvent} />
        </div>
        <CompetitionEventDialog
          open={competitionDialogOpen}
          onOpenChange={setCompetitionDialogOpen}
          event={selectedCompetitionEvent}
          initialMode={competitionDialogInitialMode}
          defaultDate={focusedCompetitionEvent.startDate}
        />
      </section>
    );
  }

  return (
    <section
      className={cn(
        "flex gap-3 min-h-0 min-w-0 flex-col overflow-hidden rounded-md",
        className,
      )}
    >
      <div className="shrink-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="hidden items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground md:flex">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{t("selectedDateLabel")}</span>
              </div>
              <div className="flex min-w-0 items-baseline gap-2 md:mt-1">
                <div className="text-[24px] font-semibold tracking-tight md:text-[22px]">
                  {selectedDate.format("MM/DD")}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {selectedDate.format("dddd")}
                </div>
              </div>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/day/${selectedDate.format("YYYY-MM-DD")}`}>
                {t("viewDay")}
                <ArrowRight aria-hidden="true" className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/55 px-3 py-2">
              <div className="text-mobile-unit pc:text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                {t("loadLabel")}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {Math.round(tss)}
              </div>
            </div>
            <div className="rounded-md bg-muted/55 px-3 py-2">
              <div className="text-mobile-unit pc:text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                {t("activityTab")}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {activities.length}
              </div>
            </div>
            {planWorkouts.length > 0 ? (
              <div className="col-span-2 rounded-md bg-muted/55 px-3 py-2">
                <div className="text-mobile-unit pc:text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                  {t("planCycleLabel")}
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold">
                  {t("planWorkoutCount", { count: planWorkouts.length })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex w-full rounded-md bg-neutral-100 p-1 dark:bg-muted/45">
          <button
            type="button"
            onClick={() => setMobileTab("training")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-mobile-caption pc:text-xs font-medium transition-colors",
              mobileTab === "training"
                ? "bg-background text-foreground"
                : "text-muted-foreground",
            )}
          >
            {t("trainingTab")}
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("activity")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-mobile-caption pc:text-xs font-medium transition-colors",
              mobileTab === "activity"
                ? "bg-background text-foreground"
                : "text-muted-foreground",
            )}
          >
            {t("activityTab")}
          </button>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain">
        {mobileTab === "training" && (
          <section className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-semibold">{t("trainingTab")}</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("createWorkoutButton")}
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {t("createWorkoutButton")}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="min-w-0 rounded-md bg-neutral-100 p-2 dark:bg-muted/45">
              {planWorkouts.length > 0 ? (
                <div className="min-w-0 space-y-2">
                  {planWorkouts.map((planWorkout) => (
                    <MobilePlanWorkoutRow
                      key={planWorkout.id}
                      workout={planWorkout}
                      showDateBlock={false}
                      emptyTitle=""
                      emptyDetail=""
                      onClick={setSelectedPlanWorkout}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md bg-background/70 px-3 py-4 text-sm text-muted-foreground">
                  {t("noPlannedTraining")}
                </div>
              )}
            </div>
          </section>
        )}

        {mobileTab === "activity" && (
          <div className="rounded-md bg-neutral-100 dark:bg-muted/45 p-2">
            {activities.length === 0 ? (
              <div className="rounded-md bg-background/70 px-3 py-4 text-sm text-muted-foreground">
                {t("noActivities")}
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map((activity) => (
                  <Link
                    key={activity.hashId}
                    href={`/activities/${activity.hashId}`}
                    className="block rounded-md bg-background p-2.5 transition-colors hover:bg-slate-50 dark:bg-neutral-950 dark:hover:bg-neutral-900"
                  >
                    <div className="truncate text-sm font-semibold">
                      {getLocalizedActivityTitle(
                        activity,
                        tActivityTitle,
                        tDay("activity"),
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-mobile-caption pc:text-xs opacity-80">
                      <span>
                        {formatValue(
                          activity.distance || 0,
                          "distance",
                          systemUnit,
                        )}{" "}
                        {getUnit("distance", systemUnit)}
                      </span>
                      <span>
                        {formatValue(
                          activity.duration || 0,
                          "duration",
                          systemUnit,
                        )}
                      </span>
                      {activity.sportType ? (
                        <span>
                          {getSportDisplayName(sportCatalog, activity, tSports)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-semibold">
              {tCompetition("calendar.title")}
            </h2>
            <Button asChild size="sm" variant="ghost">
              <Link href="/competitions">
                {tCompetition("calendar.viewAll")}
                <ArrowRight aria-hidden="true" className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <div className="rounded-md bg-neutral-100 p-2 dark:bg-muted/45">
            {competitionEvents.length > 0 ? (
              <div className="space-y-2">
                {planWorkouts.length > 0 &&
                competitionEvents.some(
                  (event) => event.status === "PLANNED",
                ) ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-mobile-caption pc:text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
                    {tCompetition("calendar.conflict")}
                  </div>
                ) : null}
                {competitionEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openCompetitionEvent(event)}
                    className="block w-full rounded-md bg-[hsl(var(--blue-50)/0.78)] px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--blue-100))] dark:bg-[hsl(var(--blue-950)/0.24)] dark:hover:bg-[hsl(var(--blue-900)/0.34)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {event.title}
                      </span>
                      <span className="mt-1 block text-mobile-caption pc:text-xs text-muted-foreground">
                        {tCompetition(`status.${event.status}`)} ·{" "}
                        {tCompetition(`importance.${event.importance}.label`)} ·{" "}
                        {tCompetition(`sports.${event.sportType}`)}
                        {event.distanceMeters
                          ? ` · ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(event.distanceMeters / 1000)} km`
                          : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-md bg-background/70 px-3 py-3 text-mobile-caption pc:text-xs text-muted-foreground">
                {tCompetition("calendar.empty")}
              </div>
            )}
          </div>
        </section>

        <div className="rounded-md bg-neutral-100 p-2 dark:bg-muted/45">
          <div className="flex items-start justify-between gap-3 px-1 pb-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {activeSummaryScope.title}
              </div>
            </div>
            {summaryScopes.plan ? (
              <div className="flex shrink-0 rounded-md bg-background p-0.5 dark:bg-black/20">
                <button
                  type="button"
                  onClick={() => setSummaryScopeKey("plan")}
                  className={cn(
                    "rounded-xs px-2 py-1 text-mobile-caption pc:text-[11px] font-medium transition-colors",
                    summaryScopeKey === "plan"
                      ? "bg-neutral-100 text-foreground dark:bg-muted/60"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("summaryScope.plan")}
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryScopeKey("month")}
                  className={cn(
                    "rounded-xs px-2 py-1 text-mobile-caption pc:text-[11px] font-medium transition-colors",
                    summaryScopeKey === "month"
                      ? "bg-neutral-100 text-foreground dark:bg-muted/60"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("summaryScope.month")}
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {summaryItems.map((item) => (
              <div
                key={item.key}
                className="rounded-md bg-background px-3 py-2.5 dark:bg-black/20"
              >
                <div className="text-mobile-unit pc:text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1 text-sm font-semibold">{item.value}</div>
                <div
                  className={cn(
                    "mt-1 text-mobile-unit pc:text-[10px]",
                    item.delta > 0
                      ? "text-[hsl(var(--emerald-600))] dark:text-[hsl(var(--emerald-400))]"
                      : item.delta < 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {activeSummaryScope.comparisonLabel}{" "}
                  {item.delta === 0
                    ? t("delta.flat")
                    : item.delta > 0
                      ? t("delta.up")
                      : t("delta.down")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedPlanWorkout ? (
        <>
          <ViewWorkoutDialog
            open={Boolean(selectedPlanWorkout)}
            onOpenChange={(open) => {
              if (!open) setSelectedPlanWorkout(null);
            }}
            planId={selectedPlanWorkout.planId ?? undefined}
            workoutId={selectedPlanWorkout.id}
            weekIndex={Math.max(0, (selectedPlanWorkout.weekIndex ?? 1) - 1)}
            dayIndex={Math.max(0, (selectedPlanWorkout.dayIndex ?? 1) - 1)}
            notes={selectedPlanWorkout.notes}
            text={selectedPlanWorkout.text}
            sportType={selectedPlanWorkout.sportType as SportType}
            plan={parsePlanBlocks(selectedPlanWorkout)}
          />
          {selectedPlanWorkout.planId == null && activePlanId ? (
            <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2">
              <Button
                type="button"
                disabled={attachMutation.isPending}
                onClick={() => attachMutation.mutate(selectedPlanWorkout.id)}
              >
                {t("attachToPlan")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <CalendarCreateWorkoutSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        scheduledDate={selectedDate.format("YYYY-MM-DD")}
        activePlanId={activePlanId}
        defaultScope={activePlanId ? "inPlan" : "independent"}
      />
      <CompetitionEventDialog
        open={competitionDialogOpen}
        onOpenChange={setCompetitionDialogOpen}
        event={selectedCompetitionEvent}
        initialMode={competitionDialogInitialMode}
        defaultDate={selectedDate.format("YYYY-MM-DD")}
      />
    </section>
  );
}

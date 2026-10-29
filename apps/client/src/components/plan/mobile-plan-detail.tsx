"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import dayjs from "dayjs";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import type {
  PlanStatus,
  PlanWorkout,
  TrainingPlanDetail,
  TrainingPlanSummary,
} from "@/api/plans";
import { isPlanContentEditable, isWorkoutDoneOrSkipped } from "@/api/plans";
import { usePlanDetail } from "@/api/usePlans";
import {
  useActivatePlan,
  useCancelActivation,
  useCompletePlan,
  useDeletePlan,
  usePausePlan,
} from "@/api/usePlanMutations";
import { MobileSheet } from "@/components/mobile-app/components/MobileSheet";
import { MobileTopBarAction } from "@/components/mobile-app/components/MobileTopBar";
import {
  getLifecycleDialogCopy,
  getPlanStatusLabel,
  rollupPlanDetailExecution,
  type PlanLifecycleAction,
} from "@/components/plan/detail/plan-detail-utils";
import { MobilePlanLoadChart } from "@/components/plan/mobile-plan-load-chart";
import { PlanShareCard } from "@/components/plan/plan-share-card";
import { PlanDetailWorkoutEditor } from "@/components/plan/plan-detail-workout-editor";
import { getPlanFocusWorkouts } from "@/components/plan/mobile-plan-load-model";
import { MobilePlanWorkoutRow } from "@/components/plan/mobile-plan-workout-row";
import { ViewWorkoutDialog } from "@/components/plan/view-workout-dialog";
import { buildWorkoutListTitle } from "@/components/plan/detail/plan-detail-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

type LifecycleActionModel = {
  action: PlanLifecycleAction;
  tone: "primary" | "neutral" | "destructive";
};

function getMobilePlanStatusClass(status: PlanStatus, dark: boolean) {
  switch (status) {
    case "ACTIVE":
      return dark
        ? "bg-[#00bc7d]/10 text-[#00bc7d]"
        : "bg-[#009689]/10 text-[#009689]";
    case "SCHEDULED":
      return dark
        ? "bg-violet-950/40 text-violet-300"
        : "bg-violet-100 text-violet-700";
    case "PAUSED":
      return dark
        ? "bg-amber-950/40 text-amber-300"
        : "bg-amber-100 text-amber-700";
    case "COMPLETED":
      return dark ? "bg-sky-950/40 text-sky-300" : "bg-sky-100 text-sky-700";
    case "CANCELLED":
      return dark
        ? "bg-rose-950/40 text-rose-300"
        : "bg-rose-100 text-rose-700";
    case "SUPERSEDED":
      return dark
        ? "bg-[#161a19]/70 text-zinc-300"
        : "bg-neutral-200 text-zinc-700";
    default:
      return dark
        ? "bg-[#161a19]/70 text-zinc-300"
        : "bg-neutral-200 text-zinc-700";
  }
}

function getLifecycleActions(
  status: PlanStatus,
  capabilities?: { delete?: boolean } | null,
): LifecycleActionModel[] {
  if (status === "DRAFT") {
    return [
      { action: "activate", tone: "primary" },
      { action: "delete", tone: "destructive" },
    ];
  }
  if (status === "ACTIVE") {
    return [
      { action: "pause", tone: "neutral" },
      { action: "complete", tone: "neutral" },
      { action: "cancel", tone: "destructive" },
    ];
  }
  if (status === "SCHEDULED") {
    return [{ action: "cancel", tone: "destructive" }];
  }
  if (status === "PAUSED") {
    return [
      { action: "resume", tone: "primary" },
      { action: "complete", tone: "neutral" },
      { action: "cancel", tone: "destructive" },
    ];
  }
  if (status === "COMPLETED" && capabilities?.delete) {
    return [{ action: "delete", tone: "destructive" }];
  }
  return [];
}

function LifecycleIcon({ action }: { action: PlanLifecycleAction }) {
  if (action === "activate" || action === "resume") {
    return <Play className="size-4 fill-current" aria-hidden="true" />;
  }
  if (action === "pause") {
    return <Pause className="size-4 fill-current" aria-hidden="true" />;
  }
  if (action === "complete") {
    return <CheckCircle2 className="size-4" aria-hidden="true" />;
  }
  if (action === "cancel") {
    return <Square className="size-4" aria-hidden="true" />;
  }
  return <Trash2 className="size-4" aria-hidden="true" />;
}

export function MobilePlanStatusBadge({ status }: { status: PlanStatus }) {
  const t = useTranslations("V2PlanDetailPage");
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-mobile-caption pc:text-[11px] font-semibold",
        getMobilePlanStatusClass(status, dark),
      )}
    >
      {getPlanStatusLabel(t, status)}
    </span>
  );
}

export function MobilePlanLibraryItem({
  active,
  focused,
  plan,
  onClick,
}: {
  active: boolean;
  focused: boolean;
  plan: TrainingPlanSummary;
  onClick: () => void;
}) {
  const plansT = useTranslations("V2PlansPage");
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const description = plan.description?.trim() || plan.goal?.trim();

  return (
    <button
      type="button"
      aria-pressed={focused}
      onClick={onClick}
      className={cn(
        "relative mb-2 block w-full overflow-hidden rounded-surface px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dark
          ? focused
            ? "bg-zinc-700/80"
            : "bg-zinc-800/80 active:bg-zinc-700/80"
          : focused
            ? "bg-neutral-200"
            : "bg-neutral-100 active:bg-neutral-200",
      )}
    >
      {active ? (
        <span
          className={cn(
            "absolute inset-y-2 left-0 w-0.5 rounded-r-full",
            dark ? "bg-[#00bc7d]" : "bg-[#009689]",
          )}
          aria-hidden="true"
        />
      ) : null}
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {plan.title}
          </span>
          <span className="mt-1 block truncate text-mobile-caption pc:text-xs text-muted-foreground">
            {plansT("recent.itemMeta", {
              weeks: plan.periodWeeks,
              sessions: plan.workoutCount,
            })}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <MobilePlanStatusBadge status={plan.status} />
          <ChevronRight
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
      </span>
      {description ? (
        <span className="mt-2 line-clamp-3 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
          {description}
        </span>
      ) : null}
    </button>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
      <p className="truncate text-mobile-caption pc:text-xs text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 truncate text-base font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function sortWorkouts(workouts: PlanWorkout[]) {
  return [...workouts].sort((a, b) => {
    const aDate = a.scheduledDate ? dayjs(a.scheduledDate).valueOf() : null;
    const bDate = b.scheduledDate ? dayjs(b.scheduledDate).valueOf() : null;
    if (aDate !== null && bDate !== null && aDate !== bDate) {
      return aDate - bDate;
    }
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1);
  });
}

function isOpenWorkout(workout: PlanWorkout) {
  return !isWorkoutDoneOrSkipped(workout.status) && workout.status !== "MOVED";
}

export function MobilePlanDetailContent({
  plan,
  onWorkoutClick,
}: {
  plan: TrainingPlanDetail;
  onWorkoutClick?: (workout: PlanWorkout) => void;
}) {
  const t = useTranslations("V2PlanDetailPage");
  const plansT = useTranslations("V2PlansPage");
  const mobileT = useTranslations("V2PlanDetailPage.mobile");
  const [expanded, setExpanded] = useState(false);
  const workouts = useMemo(() => sortWorkouts(plan.workouts), [plan.workouts]);
  const doneCount = workouts.filter(
    (workout) => workout.status === "DONE",
  ).length;
  const openCount = workouts.filter(isOpenWorkout).length;
  const execution = useMemo(() => rollupPlanDetailExecution(plan), [plan]);
  const { currentWorkout, nextWorkout } = useMemo(
    () => getPlanFocusWorkouts(plan),
    [plan],
  );
  const focusedIds = new Set(
    [currentWorkout?.id, nextWorkout?.id].filter(Boolean),
  );
  const additionalWorkouts = workouts.filter(
    (workout) => !focusedIds.has(workout.id),
  );

  useEffect(() => setExpanded(false), [plan.id]);

  return (
    <div className="space-y-4 pb-2">
      <section className="space-y-3 px-1">
        <h1 className="min-w-0 text-[30px] font-semibold leading-tight tracking-tight text-foreground">
          {plan.title}
        </h1>
        {plan.description || plan.goal ? (
          <p className="text-base leading-6 text-muted-foreground">
            {plan.description || plan.goal}
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <PlanMetric
          label={mobileT("currentWeek")}
          value={plansT("planProgress.active", {
            current: plan.currentWeekIndex ?? 1,
            total: plan.periodWeeks,
          })}
        />
        <PlanMetric
          label={t("execution.incomplete")}
          value={String(execution.incomplete)}
        />
        <PlanMetric
          label={plansT("stats.completed")}
          value={String(doneCount)}
        />
        <PlanMetric label={mobileT("openSessions")} value={String(openCount)} />
      </section>

      <MobilePlanLoadChart plan={plan} />

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-foreground">
          {mobileT("training")}
        </h2>
        {workouts.length === 0 ? (
          <div className="rounded-surface bg-neutral-100 px-3 py-4 text-sm text-muted-foreground dark:bg-muted/45">
            {t("weekBreakdown.emptyPlanTitle")}
          </div>
        ) : (
          <div className="space-y-2">
            <MobilePlanWorkoutRow
              plan={plan}
              workout={currentWorkout}
              emptyTitle={mobileT("restDay")}
              emptyDetail={mobileT("noPlannedWorkout")}
              onClick={onWorkoutClick}
            />
            <MobilePlanWorkoutRow
              plan={plan}
              workout={nextWorkout}
              emptyTitle={mobileT("noOpenSession")}
              emptyDetail={mobileT("noOpenSession")}
              onClick={onWorkoutClick}
            />
            {expanded
              ? additionalWorkouts.map((workout) => (
                  <MobilePlanWorkoutRow
                    key={workout.id}
                    plan={plan}
                    workout={workout}
                    onClick={onWorkoutClick}
                    emptyTitle={mobileT("plannedWorkout")}
                    emptyDetail={mobileT("noPlannedWorkout")}
                  />
                ))
              : null}
            {!expanded && additionalWorkouts.length > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="min-h-11 w-full rounded-control-lg bg-neutral-100 px-4 text-sm font-semibold text-emerald-600 active:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/45 dark:text-emerald-400"
              >
                {mobileT("showAll")}
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

export function MobilePlanLifecycleActions({
  status,
  capabilities,
  pendingAction,
  onAction,
}: {
  status: PlanStatus;
  capabilities?: { delete?: boolean } | null;
  pendingAction: PlanLifecycleAction | null;
  onAction: (action: PlanLifecycleAction) => void;
}) {
  const t = useTranslations("V2PlanDetailPage");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const actions = getLifecycleActions(status, capabilities);

  return (
    <section className="space-y-2 border-t border-border/70 pt-4">
      <h2 className="px-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground">
        {t("lifecycle.title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.map(({ action, tone }) => (
          <button
            key={action}
            type="button"
            disabled={pendingAction !== null || publicDemo.active}
            title={publicDemo.active ? demoText("readOnlyAction") : undefined}
            onClick={() => onAction(action)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-opacity active:opacity-70 disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tone === "primary" &&
                "border-foreground bg-foreground text-background",
              tone === "neutral" &&
                "border-border bg-neutral-100 text-foreground dark:bg-muted/45",
              tone === "destructive" &&
                "border-red-500/25 bg-red-500/10 text-red-500",
            )}
          >
            <LifecycleIcon action={action} />
            {pendingAction === action
              ? t("lifecycle.pending")
              : t(`lifecycle.actions.${action}`)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MobilePlanDetailSheet({
  plan,
  open,
  onOpenChange,
  onPlanChanged,
}: {
  plan: TrainingPlanSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlanChanged?: () => void;
}) {
  const t = useTranslations("V2PlanDetailPage");
  const publicDemo = usePublicDemo();
  const plansT = useTranslations("V2PlansPage");
  const navigationT = useTranslations("MobileApp.planNavigation");
  const detail = usePlanDetail(plan?.id, open && Boolean(plan));
  const activate = useActivatePlan();
  const pause = usePausePlan();
  const complete = useCompletePlan();
  const cancel = useCancelActivation();
  const deletePlan = useDeletePlan();
  const [pendingAction, setPendingAction] =
    useState<PlanLifecycleAction | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<PlanLifecycleAction | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<PlanWorkout | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setPendingAction(null);
      setConfirmAction(null);
      setSelectedWorkout(null);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedWorkout || !detail.data) return;
    const refreshedWorkout = detail.data.workouts.find(
      (workout) => workout.id === selectedWorkout.id,
    );
    if (refreshedWorkout && refreshedWorkout !== selectedWorkout) {
      setSelectedWorkout(refreshedWorkout);
    }
  }, [detail.data, selectedWorkout]);

  const runAction = async (action: PlanLifecycleAction) => {
    const current = detail.data;
    if (!current || pendingAction) return;
    setPendingAction(action);
    try {
      if (action === "activate") {
        await activate.mutateAsync({
          planId: current.id,
          startDate: dayjs().format("YYYY-MM-DD"),
        });
      } else if (action === "resume") {
        await activate.mutateAsync({ planId: current.id });
      } else if (action === "pause") {
        await pause.mutateAsync({
          planId: current.id,
          reason: t("lifecycle.reasons.pause"),
        });
      } else if (action === "complete") {
        await complete.mutateAsync({
          planId: current.id,
          completedAt: dayjs().format("YYYY-MM-DD"),
          reason: t("lifecycle.reasons.complete"),
        });
      } else if (action === "cancel") {
        await cancel.mutateAsync({ planId: current.id });
      } else {
        await deletePlan.mutateAsync({ planId: current.id });
      }
      onOpenChange(false);
      if (action !== "delete") onPlanChanged?.();
    } catch {
      // Mutation hooks own the localized error toast; keep the sheet open.
    } finally {
      setPendingAction(null);
      setConfirmAction(null);
    }
  };

  const requestAction = (action: PlanLifecycleAction) => {
    if (action === "activate" || action === "resume") {
      void runAction(action);
      return;
    }
    setConfirmAction(action);
  };

  const editingWorkout = Boolean(
    !publicDemo.active &&
    selectedWorkout &&
    detail.data &&
    isPlanContentEditable(detail.data.status),
  );
  const viewingWorkout = Boolean(selectedWorkout) && !editingWorkout;

  return (
    <>
      <MobileSheet
        open={open && Boolean(plan)}
        onOpenChange={onOpenChange}
        title={
          viewingWorkout && selectedWorkout
            ? buildWorkoutListTitle(t, selectedWorkout)
            : t("defaultPageTitle")
        }
        description={
          viewingWorkout
            ? undefined
            : plan
              ? plansT("recent.itemMeta", {
                  weeks: plan.periodWeeks,
                  sessions: plan.workoutCount,
                })
              : undefined
        }
        leading={
          viewingWorkout ? (
            <MobileTopBarAction
              onClick={() => setSelectedWorkout(null)}
              aria-label={navigationT("title")}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </MobileTopBarAction>
          ) : undefined
        }
        fullScreen
        backgroundVariant={viewingWorkout ? "grouped" : "default"}
        contentClassName={
          viewingWorkout ? "flex overflow-hidden p-0" : undefined
        }
      >
        {viewingWorkout && selectedWorkout ? (
          <ViewWorkoutDialog
            open
            mobile
            mobileEmbedded
            planId={selectedWorkout.planId ?? undefined}
            workoutId={selectedWorkout.id}
            workout={selectedWorkout}
            onOpenChange={(next) => {
              if (!next) setSelectedWorkout(null);
            }}
          />
        ) : detail.isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {navigationT("loading")}
          </p>
        ) : detail.error ? (
          <p className="py-12 text-center text-sm text-destructive">
            {navigationT("failed")}
          </p>
        ) : detail.data ? (
          <div className="space-y-4">
            <MobilePlanDetailContent
              plan={detail.data}
              onWorkoutClick={setSelectedWorkout}
            />
            <MobilePlanLifecycleActions
              capabilities={detail.data.capabilities}
              status={detail.data.status}
              pendingAction={pendingAction}
              onAction={requestAction}
            />
            <PlanShareCard plan={detail.data} />
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t("notFound.title")}
          </p>
        )}
      </MobileSheet>

      {editingWorkout && selectedWorkout && detail.data ? (
        <PlanDetailWorkoutEditor
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSelectedWorkout(null);
          }}
          planId={detail.data.id}
          workout={selectedWorkout}
        />
      ) : null}

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !pendingAction) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          {confirmAction ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {getLifecycleDialogCopy(t, confirmAction).title}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {getLifecycleDialogCopy(t, confirmAction).description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pendingAction !== null}>
                  {getLifecycleDialogCopy(t, confirmAction).cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={pendingAction !== null}
                  className={cn(
                    (confirmAction === "cancel" ||
                      confirmAction === "delete") &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  onClick={() => void runAction(confirmAction)}
                >
                  {getLifecycleDialogCopy(t, confirmAction).confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

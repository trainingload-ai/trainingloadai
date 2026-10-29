"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import dayjs from "dayjs";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  PauseCircle,
  Play,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { PlanCreateLauncher } from "@/components/plan/plan-create-launcher";
import { PlanDescriptionRich } from "@/components/plan/plan-description-rich";
import { PlanExecutionAdviceCard } from "@/components/plan/PlanExecutionAdviceCard";
import { usePlansList } from "@/api/usePlans";
import {
  canActivatePlan,
  type PlanStatus,
  type TrainingPlanSummary,
} from "@/api/plans";
import { useActivatePlan, useDeletePlan } from "@/api/usePlanMutations";
import { PlanActivateDialog } from "@/components/plan/PlanActivateDialog";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

type TranslateFn = ReturnType<typeof useTranslations>;

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

// 获取计划状态标签
function getStatusLabel(t: TranslateFn, status: PlanStatus) {
  switch (status) {
    case "ACTIVE":
      return t("status.active");
    case "SCHEDULED":
      return t("status.scheduled");
    case "PAUSED":
      return t("status.paused");
    case "COMPLETED":
      return t("status.completed");
    case "CANCELLED":
      return t("status.cancelled");
    case "SUPERSEDED":
      return t("status.superseded");
    default:
      return t("status.draft");
  }
}

// 获取计划状态类名
function statusClassName(status: PlanStatus) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200";
    case "SCHEDULED":
      return "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200";
    case "PAUSED":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200";
    case "COMPLETED":
      return "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200";
    case "SUPERSEDED":
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function StatusIcon({ status }: { status: PlanStatus }) {
  if (status === "ACTIVE") return <TrendingUp className="h-4 w-4" />;
  if (status === "SCHEDULED") return <Play className="h-4 w-4" />;
  if (status === "PAUSED") return <PauseCircle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function formatPlanRange(t: TranslateFn, plan: TrainingPlanSummary) {
  if (plan.startDate && plan.endDate) {
    return `${dayjs(plan.startDate).format("YYYY-MM-DD")} - ${dayjs(plan.endDate).format("YYYY-MM-DD")}`;
  }
  if (plan.startDate) {
    return t("planRange.startOn", {
      date: dayjs(plan.startDate).format("YYYY-MM-DD"),
    });
  }
  return t("planRange.createdOn", {
    date: dayjs(plan.createdAt).format("YYYY-MM-DD"),
  });
}

function formatPlanProgress(t: TranslateFn, plan: TrainingPlanSummary) {
  if (plan.status === "ACTIVE") {
    return t("planProgress.active", {
      current: plan.currentWeekIndex ?? 1,
      total: plan.periodWeeks,
    });
  }
  if (plan.status === "SCHEDULED") {
    return t("planProgress.scheduled");
  }
  if (plan.status === "PAUSED") {
    return t("planProgress.paused", {
      current: plan.currentWeekIndex ?? "-",
      total: plan.periodWeeks,
    });
  }
  if (plan.status === "COMPLETED") {
    return t("planProgress.completed", {
      count: plan.workoutCount,
    });
  }
  if (plan.status === "CANCELLED") {
    return t("planProgress.cancelled");
  }
  if (plan.status === "SUPERSEDED") {
    return t("planProgress.superseded");
  }
  return t("planProgress.draft", {
    count: plan.workoutCount,
  });
}

function getSessionCompletionPercent(plan: TrainingPlanSummary) {
  if (typeof plan.sessionCompletionRate === "number") {
    return plan.sessionCompletionRate;
  }
  if (!plan.workoutCount) return 0;
  return Math.round((plan.completedWorkoutCount / plan.workoutCount) * 100);
}

function formatLoadCompliance(plan: TrainingPlanSummary) {
  if (plan.complianceRate == null) return "—";
  return `${plan.complianceRate}%`;
}

function getPlanHref(plan: TrainingPlanSummary) {
  return `/plans/${plan.id}`;
}

function getActionLabel(t: TranslateFn, plan: TrainingPlanSummary) {
  return plan.status === "ACTIVE"
    ? t("actions.viewCurrentPlan")
    : t("actions.viewPlanDetail");
}

function getCoachText(t: TranslateFn, plan: TrainingPlanSummary) {
  if (plan.status === "ACTIVE") {
    return t("coachText.active", {
      completed: plan.completedWorkoutCount,
      total: plan.workoutCount,
    });
  }
  if (plan.status === "SCHEDULED") {
    return t("coachText.scheduled");
  }
  if (plan.status === "PAUSED") {
    return t("coachText.paused");
  }
  if (plan.status === "COMPLETED") {
    return t("coachText.completed");
  }
  if (plan.status === "CANCELLED") {
    return t("coachText.cancelled");
  }
  if (plan.status === "SUPERSEDED") {
    return t("coachText.superseded");
  }
  return t("coachText.draft");
}

function LoadingState() {
  return (
    <div className="mx-auto hidden w-full max-w-6xl flex-col gap-3 pb-2 pc:flex">
      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-3">
        <div className="col-start-2 row-start-1 h-40 rounded-surface bg-neutral-100 dark:bg-muted/45" />
        <div className="col-start-2 row-start-2 h-40 rounded-surface bg-neutral-100 dark:bg-muted/45" />
        <div className="col-start-1 row-span-3 row-start-1 space-y-2">
          <div className="h-24 rounded-surface bg-neutral-100 dark:bg-muted/45" />
          <div className="h-80 rounded-surface bg-neutral-100 dark:bg-muted/45" />
        </div>
        <div className="col-start-2 row-start-3 h-36 rounded-surface bg-neutral-100 dark:bg-muted/45" />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  t,
  hasActivePlan,
  onRequestDelete,
  onRequestStart,
  deleting,
  activating,
}: {
  plan: TrainingPlanSummary;
  t: TranslateFn;
  hasActivePlan: boolean;
  onRequestDelete: (plan: TrainingPlanSummary) => void;
  onRequestStart: (plan: TrainingPlanSummary) => void;
  deleting: boolean;
  activating: boolean;
}) {
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const sessionCompletion = getSessionCompletionPercent(plan);
  const canDelete = plan.capabilities?.delete ?? plan.status === "DRAFT";
  const showStart = canActivatePlan(plan.status);
  const startDisabled =
    publicDemo.active ||
    activating ||
    (hasActivePlan && plan.status !== "ACTIVE");
  const planHref = getPlanHref(plan);

  return (
    <div className="group rounded-surface bg-neutral-100 p-3 transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-background text-muted-foreground transition-colors group-hover:text-foreground dark:bg-black/20">
          <StatusIcon status={plan.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="min-w-0 truncate text-sm font-semibold">
                  {plan.title}
                </h3>
                <span
                  className={`shrink-0 rounded-compact px-2 py-0.5 text-mobile-caption pc:text-[11px] ${statusClassName(
                    plan.status,
                  )}`}
                >
                  {getStatusLabel(t, plan.status)}
                </span>
              </div>
              <div className="mt-1 text-mobile-caption text-muted-foreground pc:text-xs">
                {formatPlanProgress(t, plan)} · {formatPlanRange(t, plan)}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={planHref}
                    aria-label={getActionLabel(t, plan)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-background/80 dark:hover:bg-black/20"
                  >
                    <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {getActionLabel(t, plan)}
                </TooltipContent>
              </Tooltip>
              {showStart ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex rounded-control">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-control text-emerald-600 outline-none transition-colors hover:bg-emerald-500/10 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300 dark:disabled:hover:text-emerald-400"
                        disabled={startDisabled}
                        aria-label={t("start.iconAria")}
                        onClick={() => onRequestStart(plan)}
                      >
                        <Play className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {publicDemo.active
                      ? demoText("readOnlyAction")
                      : startDisabled && hasActivePlan
                        ? t("start.disabledHasActivePlan")
                        : t("start.iconAria")}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {canDelete ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex rounded-control">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        disabled={deleting || publicDemo.active}
                        aria-label={t("delete.iconAria")}
                        onClick={() => onRequestDelete(plan)}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {publicDemo.active
                      ? demoText("readOnlyAction")
                      : t("delete.iconAria")}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 pc:grid-cols-4">
            <div className="rounded-lg bg-background px-2.5 py-2 dark:bg-black/20">
              <div className="text-mobile-unit text-muted-foreground pc:text-[10px]">
                {t("stats.sessionCompletion")}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {sessionCompletion}%
              </div>
            </div>
            <div className="rounded-lg bg-background px-2.5 py-2 dark:bg-black/20">
              <div className="text-mobile-unit text-muted-foreground pc:text-[10px]">
                {t("stats.loadCompliance")}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {formatLoadCompliance(plan)}
              </div>
            </div>
            <div className="rounded-lg bg-background px-2.5 py-2 dark:bg-black/20">
              <div className="text-mobile-unit text-muted-foreground pc:text-[10px]">
                {t("stats.plannedSessions")}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {plan.workoutCount}
              </div>
            </div>
            <div className="rounded-lg bg-background px-2.5 py-2 dark:bg-black/20">
              <div className="text-mobile-unit text-muted-foreground pc:text-[10px]">
                {t("stats.completed")}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {plan.completedWorkoutCount}
              </div>
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background dark:bg-black/20">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${sessionCompletion}%` }}
            />
          </div>

          {plan.description?.trim() ? (
            <div className="mt-3 text-sm leading-snug">
              <PlanDescriptionRich markdown={plan.description} />
            </div>
          ) : (
            <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {getCoachText(t, plan)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlansDesktopPage() {
  const t = useTranslations("V2PlansPage");
  const tPlan = useTranslations("V2PlanPage");
  const tSidebar = useTranslations("sidebar");
  useSetPageTitle(t("header.title"));
  const { plans, isLoading, aggregates } = usePlansList(true);
  const [planPendingDelete, setPlanPendingDelete] =
    useState<TrainingPlanSummary | null>(null);
  const [planPendingStart, setPlanPendingStart] =
    useState<TrainingPlanSummary | null>(null);
  const { mutateAsync: deletePlanMut, isPending: deletingPlan } =
    useDeletePlan();
  const { mutateAsync: activatePlanMut, isPending: activatingPlan } =
    useActivatePlan();
  const hasActivePlan = useMemo(
    () => plans.some((plan) => plan.status === "ACTIVE"),
    [plans],
  );

  const stats = useMemo(() => {
    const activeCount = plans.filter((plan) => plan.status === "ACTIVE").length;
    const completedCount = plans.filter(
      (plan) => plan.status === "COMPLETED",
    ).length;
    const completionValues = plans
      .filter((plan) => plan.workoutCount > 0)
      .map((plan) => getSessionCompletionPercent(plan));
    const averageCompletionFallback = completionValues.length
      ? Math.round(
          completionValues.reduce((sum, value) => sum + value, 0) /
            completionValues.length,
        )
      : 0;

    const loadComplianceValues = plans
      .filter((plan) => plan.complianceRate != null)
      .map((plan) => plan.complianceRate as number);
    const averageLoadComplianceFallback = loadComplianceValues.length
      ? Math.round(
          loadComplianceValues.reduce((sum, value) => sum + value, 0) /
            loadComplianceValues.length,
        )
      : null;

    const averageCompletion =
      aggregates?.weightedSessionCompletionRate ?? averageCompletionFallback;
    const averageLoadCompliance =
      aggregates?.aggregateLoadCompliance ?? averageLoadComplianceFallback;

    return [
      { label: t("overview.active"), value: String(activeCount) },
      { label: t("overview.completed"), value: String(completedCount) },
      {
        label: t("overview.averageSessionCompletion"),
        value: `${averageCompletion}%`,
      },
      {
        label: t("overview.averageLoadCompliance"),
        value:
          averageLoadCompliance != null ? `${averageLoadCompliance}%` : "—",
      },
    ];
  }, [plans, t, aggregates]);

  const recentPlans = useMemo(() => plans.slice(0, 3), [plans]);
  const activePlan = useMemo(
    () => plans.find((plan) => plan.status === "ACTIVE") ?? null,
    [plans],
  );
  const hasDraftPlan = useMemo(
    () => plans.some((plan) => plan.status === "DRAFT"),
    [plans],
  );
  const adviceFallbackSummary = activePlan
    ? getCoachText(t, activePlan)
    : hasDraftPlan || plans.length === 0
      ? t("statusGuide.draft")
      : t("statusGuide.history");
  const coachParams = new URLSearchParams({
    intent: "plans-overview",
    source: "plans",
    openReason: "plans_overview",
  });
  if (activePlan) coachParams.set("planId", activePlan.id);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <>
      <div className="mx-auto hidden w-full max-w-6xl flex-col gap-3 pb-2 pc:flex">
        <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-3">
          <div className="order-1 min-w-0 md:col-start-2 md:row-start-1 md:order-none">
            <Panel className="space-y-3">
              <SectionTitle title={t("create.title")} />
              <div className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
                <Target className="h-5 w-5 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">
                  {t("create.cardTitle")}
                </div>
                <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  {t("create.description")}
                </p>
                <PlanCreateLauncher
                  size="sm"
                  className="mt-3 flex w-full items-center justify-center bg-foreground font-medium text-background transition-opacity hover:opacity-90"
                >
                  {t("create.button")}
                </PlanCreateLauncher>
              </div>
            </Panel>
          </div>

          <div className="order-2 min-w-0 md:col-start-2 md:row-start-2 md:order-none">
            <Panel className="space-y-3">
              <SectionTitle title={t("recent.title")} />
              <div className="space-y-2">
                {recentPlans.length === 0 ? (
                  <div className="rounded-surface bg-neutral-100 px-3 py-3 text-sm text-muted-foreground dark:bg-muted/45">
                    {t("recent.empty")}
                  </div>
                ) : (
                  recentPlans.map((plan) => (
                    <Link
                      key={plan.id}
                      href={getPlanHref(plan)}
                      className="group block rounded-surface bg-neutral-100 px-3 py-2.5 transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {plan.title}
                          </div>
                          <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                            {t("recent.itemMeta", {
                              weeks: plan.periodWeeks,
                              sessions: plan.workoutCount,
                            })}
                          </div>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                      {plan.description?.trim() ? (
                        <div className="mt-2">
                          <PlanDescriptionRich
                            markdown={plan.description}
                            variant="sidebar"
                          />
                        </div>
                      ) : (
                        <p className="mt-2 line-clamp-3 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                          {getCoachText(t, plan)}
                        </p>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </Panel>
          </div>

          <main className="order-3 flex min-w-0 flex-col gap-2 md:gap-3 md:col-start-1 md:row-span-3 md:row-start-1 md:order-none">
            <Panel className="space-y-3">
              <SectionTitle title={t("overview.title")} />
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-surface bg-neutral-100 px-3 py-2.5 dark:bg-muted/45"
                  >
                    <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                      {stat.label}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="space-y-3">
              <SectionTitle
                title={t("allPlans.title")}
                action={
                  <span className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
                    {t("allPlans.count", { count: plans.length })}
                  </span>
                }
              />
              <div className="space-y-2">
                {plans.length === 0 ? (
                  <div className="rounded-surface border border-dashed border-border/70 bg-neutral-100 px-4 py-6 text-sm text-muted-foreground dark:bg-muted/45">
                    {t("allPlans.empty")}
                  </div>
                ) : (
                  plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      t={t}
                      hasActivePlan={hasActivePlan}
                      deleting={deletingPlan}
                      activating={activatingPlan}
                      onRequestDelete={setPlanPendingDelete}
                      onRequestStart={setPlanPendingStart}
                    />
                  ))
                )}
              </div>
            </Panel>
          </main>

          <div className="order-4 min-w-0 md:col-start-2 md:row-start-3 md:order-none">
            <PlanExecutionAdviceCard
              title={tSidebar("coach")}
              askLabel={t("statusGuide.askCoach")}
              askHref={`/ai-coach?${coachParams.toString()}`}
              surface="PLAN_SIDEBAR"
              planId={activePlan?.id}
              fallbackSummary={adviceFallbackSummary}
              fallbackTags={[
                activePlan
                  ? getStatusLabel(t, activePlan.status)
                  : t("statusGuide.title"),
              ]}
            />
          </div>
        </div>
      </div>

      <PlanActivateDialog
        open={planPendingStart !== null}
        pending={activatingPlan}
        onOpenChange={(open) => {
          if (!open) setPlanPendingStart(null);
        }}
        onConfirm={async (startDate) => {
          if (!planPendingStart) return;
          try {
            await activatePlanMut({
              planId: planPendingStart.id,
              startDate,
            });
            setPlanPendingStart(null);
          } catch {
            /* toast via useActivatePlan */
          }
        }}
      />

      <AlertDialog
        open={planPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPlanPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tPlan("manage.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tPlan("manage.delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPlan}>
              {tPlan("manage.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingPlan}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!planPendingDelete) return;
                try {
                  await deletePlanMut({ planId: planPendingDelete.id });
                  setPlanPendingDelete(null);
                } catch {
                  /* toast via useDeletePlan */
                }
              }}
            >
              {tPlan("manage.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import dayjs from "dayjs";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { usePlanDetail, usePlanSummary } from "@/api/usePlans";
import { isPlanContentEditable } from "@/api/plans";
import type { SportType } from "@/api/activities";
import {
  useActivatePlan,
  useCancelActivation,
  useCompletePlan,
  useDeletePlan,
  usePausePlan,
} from "@/api/usePlanMutations";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useMobileViewport } from "@/hooks/use-mobile";
import { getPlanLibraryHref } from "@/lib/plan-navigation";
import { cn } from "@/lib/utils";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import { PlanActivateDialog } from "@/components/plan/PlanActivateDialog";
import { PlanShareCard } from "@/components/plan/plan-share-card";
import { PlanDetailCycleProgress } from "@/components/plan/detail/plan-detail-cycle-progress";
import {
  PlanDetailLoadingState,
  PlanDetailNotFoundState,
} from "@/components/plan/detail/plan-detail-states";
import {
  buildWeekGroups,
  getLifecycleDialogCopy,
  parsePlanBlocks,
  toDerivedWorkout,
  type DerivedWorkout,
  type PlanLifecycleAction,
  type WeekGroup,
} from "@/components/plan/detail/plan-detail-utils";
import { toast } from "sonner";
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
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { useManagedPlanProviderActions } from "@deployment/managed-ui";

const ViewWorkoutDialog = dynamic(
  () =>
    import("@/components/plan/view-workout-dialog").then(
      (module) => module.ViewWorkoutDialog,
    ),
  { ssr: false },
);

const PlanDetailWorkoutEditor = dynamic(
  () =>
    import("@/components/plan/plan-detail-workout-editor").then(
      (module) => module.PlanDetailWorkoutEditor,
    ),
  { ssr: false },
);

const PlanSummaryCard = dynamic(
  () =>
    import("@/components/plan/plan-summary-card").then(
      (module) => module.PlanSummaryCard,
    ),
  { ssr: false },
);

const CompetitionPlanImpactCard = dynamic(
  () =>
    import("@/components/competition/competition-plan-impact-card").then(
      (module) => module.CompetitionPlanImpactCard,
    ),
  { ssr: false },
);

const PlanDetailHeader = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-header").then(
      (module) => module.PlanDetailHeader,
    ),
  { ssr: false },
);

const PlanDetailLifecyclePanel = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-lifecycle-panel").then(
      (module) => module.PlanDetailLifecyclePanel,
    ),
  { ssr: false },
);

const PlanDetailExecutionSummary = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-execution-summary").then(
      (module) => module.PlanDetailExecutionSummary,
    ),
  { ssr: false },
);

const PlanDetailNextSteps = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-next-steps").then(
      (module) => module.PlanDetailNextSteps,
    ),
  { ssr: false },
);

const PlanDetailCoachPanel = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-coach-panel").then(
      (module) => module.PlanDetailCoachPanel,
    ),
  { ssr: false },
);

const PlanDetailOverview = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-overview").then(
      (module) => module.PlanDetailOverview,
    ),
  { ssr: false },
);

const PlanDetailWeekBreakdown = dynamic(
  () =>
    import("@/components/plan/detail/plan-detail-week-breakdown").then(
      (module) => module.PlanDetailWeekBreakdown,
    ),
  { ssr: false },
);

const MobilePlanDetailContent = dynamic(
  () =>
    import("@/components/plan/mobile-plan-detail").then(
      (module) => module.MobilePlanDetailContent,
    ),
  { ssr: false },
);

const MobilePlanLifecycleActions = dynamic(
  () =>
    import("@/components/plan/mobile-plan-detail").then(
      (module) => module.MobilePlanLifecycleActions,
    ),
  { ssr: false },
);

export default function V2PlanDetailPage() {
  const t = useTranslations("V2PlanDetailPage");
  const publicDemo = usePublicDemo();
  const locale = useLocale();
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const mobileViewport = useMobileViewport();
  const isMobile = mobileViewport === true;
  const planLibraryHref = getPlanLibraryHref(isMobile);
  useMobileNavigation({
    title: t("defaultPageTitle"),
    backHref: planLibraryHref,
  });
  const planId = typeof params?.planId === "string" ? params.planId : undefined;
  const { data: plan, isLoading } = usePlanDetail(planId, Boolean(planId));
  const planActivated = Boolean(
    plan && plan.status !== "DRAFT" && plan.status !== "CANCELLED",
  );
  const { data: summary, isLoading: summaryLoading } = usePlanSummary(
    planId,
    Boolean(planId) && planActivated,
  );
  const { mutateAsync: activateAsync, isPending: activating } =
    useActivatePlan();
  const { mutateAsync: pauseAsync, isPending: pausing } = usePausePlan();
  const { mutateAsync: completeAsync, isPending: completing } =
    useCompletePlan();
  const { mutateAsync: cancelAsync, isPending: cancelling } =
    useCancelActivation();
  const { mutateAsync: deleteAsync, isPending: deleting } = useDeletePlan();
  const managedProvider = useManagedPlanProviderActions(plan, t);
  const queryClient = useQueryClient();
  const [selectedWorkout, setSelectedWorkout] = useState<DerivedWorkout | null>(
    null,
  );
  const [activateOpen, setActivateOpen] = useState(false);
  const [pendingLifecycleAction, setPendingLifecycleAction] =
    useState<PlanLifecycleAction | null>(null);
  useSetPageTitle(plan?.title?.trim() || t("defaultPageTitle"));

  const weeks = useMemo<WeekGroup[]>(
    () => (plan ? buildWeekGroups(t, plan) : []),
    [plan, t],
  );

  if (isLoading || mobileViewport === undefined) {
    return <PlanDetailLoadingState />;
  }

  if (!plan) {
    return <PlanDetailNotFoundState t={t} backHref={planLibraryHref} />;
  }

  const lifecycleBusy =
    activating ||
    pausing ||
    completing ||
    cancelling ||
    deleting ||
    managedProvider.busy;
  const activeLifecycleAction = lifecycleBusy ? pendingLifecycleAction : null;

  const handleLifecycleAction = async (action: PlanLifecycleAction) => {
    try {
      if (action === "pause") {
        await pauseAsync({
          planId: plan.id,
          reason: t("lifecycle.reasons.pause"),
        });
        return;
      }
      if (action === "resume") {
        await activateAsync({ planId: plan.id });
        return;
      }
      if (action === "complete") {
        await completeAsync({
          planId: plan.id,
          completedAt: dayjs().format("YYYY-MM-DD"),
          reason: t("lifecycle.reasons.complete"),
        });
        return;
      }
      if (action === "cancel") {
        await managedProvider.beforeDestructiveAction();
        await cancelAsync({
          planId: plan.id,
        });
        return;
      }
      if (action === "delete") {
        await managedProvider.beforeDestructiveAction();
        await deleteAsync({ planId: plan.id });
        router.push(planLibraryHref);
      }
    } finally {
      setPendingLifecycleAction(null);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col gap-3",
        isMobile ? "pb-safe" : "mx-auto max-w-6xl",
      )}
    >
      {isMobile ? (
        <main className="mx-auto w-full max-w-lg px-safe-or-3 py-3">
          <MobilePlanDetailContent
            plan={plan}
            onWorkoutClick={(workout) =>
              setSelectedWorkout(toDerivedWorkout(t, plan, workout))
            }
          />
          <MobilePlanLifecycleActions
            capabilities={plan.capabilities}
            status={plan.status}
            pendingAction={activeLifecycleAction}
            onAction={(action) => {
              if (action === "activate") {
                setPendingLifecycleAction(action);
                void activateAsync({
                  planId: plan.id,
                  startDate: dayjs().format("YYYY-MM-DD"),
                }).finally(() => setPendingLifecycleAction(null));
                return;
              }
              if (action === "resume") {
                setPendingLifecycleAction(action);
                void handleLifecycleAction(action);
                return;
              }
              setPendingLifecycleAction(action);
            }}
          />
          <div className="mt-4">
            <PlanShareCard plan={plan} />
          </div>
        </main>
      ) : (
        <>
          <PlanDetailHeader plan={plan} t={t} backHref={planLibraryHref} />

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-3 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-stretch",
              "pc:[grid-template-areas:'main_aside']",
            )}
          >
            <aside className="order-1 flex min-w-0 flex-col gap-3 pc:order-none pc:[grid-area:aside]">
              <PlanDetailLifecyclePanel
                plan={plan}
                t={t}
                pendingAction={activeLifecycleAction}
                providerAction={
                  managedProvider.enabled
                    ? {
                        providerName: managedProvider.providerName,
                        connected: managedProvider.connected,
                        exporting: managedProvider.exporting,
                        onExport: managedProvider.exportToProvider,
                      }
                    : undefined
                }
                onRequestAction={(action) => {
                  if (action === "activate") {
                    setActivateOpen(true);
                    return;
                  }
                  setPendingLifecycleAction(action);
                }}
              />
              <PlanShareCard plan={plan} />
              <PlanDetailExecutionSummary plan={plan} t={t} />
              <PlanDetailNextSteps plan={plan} t={t} />
              <PlanDetailCoachPanel plan={plan} t={t} />
            </aside>
            <main
              className={cn(
                "order-2 flex min-h-0 min-w-0 flex-1 flex-col gap-3 pc:order-none",
                "pc:[grid-area:main]",
              )}
            >
              {planActivated ? (
                <PlanSummaryCard summary={summary} loading={summaryLoading} />
              ) : null}
              <PlanDetailCycleProgress
                key={plan.id}
                weeks={weeks}
                status={plan.status}
              />
              {plan.startDate ? (
                <CompetitionPlanImpactCard
                  anchorDate={dayjs().format("YYYY-MM-DD")}
                  startDate={dayjs(plan.startDate).format("YYYY-MM-DD")}
                  endDate={
                    plan.endDate
                      ? dayjs(plan.endDate).format("YYYY-MM-DD")
                      : dayjs(plan.startDate)
                          .add(
                            Math.max(1, plan.periodWeeks ?? 1) * 7 - 1,
                            "day",
                          )
                          .format("YYYY-MM-DD")
                  }
                  locale={locale}
                />
              ) : null}
              <PlanDetailOverview plan={plan} t={t} />
              <PlanDetailWeekBreakdown
                weeks={weeks}
                t={t}
                onOpenWorkout={(workout) => setSelectedWorkout(workout)}
              />
            </main>
          </div>
        </>
      )}

      {selectedWorkout &&
      !publicDemo.active &&
      isPlanContentEditable(plan.status) ? (
        <PlanDetailWorkoutEditor
          open
          onOpenChange={(open) => {
            if (!open) setSelectedWorkout(null);
          }}
          planId={plan.id}
          workout={selectedWorkout}
        />
      ) : selectedWorkout ? (
        <ViewWorkoutDialog
          open={Boolean(selectedWorkout)}
          onOpenChange={(open) => {
            if (!open) setSelectedWorkout(null);
          }}
          planId={selectedWorkout.planId ?? undefined}
          workoutId={selectedWorkout.id}
          weekIndex={Math.max(0, (selectedWorkout.weekIndex ?? 1) - 1)}
          dayIndex={Math.max(0, (selectedWorkout.dayIndex ?? 1) - 1)}
          notes={selectedWorkout.notes}
          text={selectedWorkout.text}
          sportType={selectedWorkout.sportType as SportType}
          plan={parsePlanBlocks(selectedWorkout)}
          workout={selectedWorkout}
          mobile={isMobile}
        />
      ) : null}

      <PlanActivateDialog
        open={activateOpen}
        pending={activating}
        onOpenChange={setActivateOpen}
        onConfirm={async (startDate) => {
          await activateAsync({ planId: plan.id, startDate });
          setActivateOpen(false);
        }}
      />
      <AlertDialog
        open={pendingLifecycleAction !== null}
        onOpenChange={(open) => {
          if (!open && !lifecycleBusy) setPendingLifecycleAction(null);
        }}
      >
        <AlertDialogContent>
          {pendingLifecycleAction ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {getLifecycleDialogCopy(t, pendingLifecycleAction).title}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {
                    getLifecycleDialogCopy(t, pendingLifecycleAction)
                      .description
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={lifecycleBusy}>
                  {getLifecycleDialogCopy(t, pendingLifecycleAction).cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={lifecycleBusy}
                  className={cn(
                    (pendingLifecycleAction === "cancel" ||
                      pendingLifecycleAction === "delete") &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  onClick={async () => {
                    await handleLifecycleAction(pendingLifecycleAction);
                  }}
                >
                  {getLifecycleDialogCopy(t, pendingLifecycleAction).confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

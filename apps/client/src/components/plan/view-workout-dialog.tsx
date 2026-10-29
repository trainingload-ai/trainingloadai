"use client";

import React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ParsedPlan } from "@/api/workout";
import { WorkoutPlanChart } from "@/components/workout/WorkoutPlanChart";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import type { SportType } from "@/api/activities";
import { usePlanWorkoutDetail } from "@/api/usePlans";
import type { WorkoutExpressionSportType } from "@/components/plan/workout-expression-codec";
import { WorkoutLoadBadge } from "@/components/plan/workout-load-badge";
import { useTranslations } from "next-intl";
import { usePlanWorkoutActions } from "@/hooks/usePlanWorkoutActions";
import { deleteIndependentWorkout, updatePlan } from "@/api/plans";
import { queryKeys } from "@/lib/query-keys";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { resolveWorkoutSportLabelKind } from "@/lib/workout-sport-label";
import { useMobileViewport } from "@/hooks/use-mobile";
import {
  MobileViewWorkoutContent,
  MobileViewWorkoutDialog,
} from "@/components/plan/mobile-view-workout-dialog";
import { WorkoutDetailActions } from "./workout-detail-actions";
import { ManagedWorkoutExternalActions } from "@deployment/managed-ui";

interface ViewWorkoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId?: string;
  workoutId?: string;
  weekIndex?: number; // 0-based
  dayIndex?: number; // 0-based, Monday first (same as plan/calendar callers)
  notes?: string | null;
  text?: string | null;
  sportType?: SportType;
  plan?: ParsedPlan | null;
  workout?: import("@/api/plans").PlanWorkout;
  mobile?: boolean;
  mobileEmbedded?: boolean;
}

const footerActionLayoutClassName = "min-w-0 flex-1 pc:flex-none";

export const ViewWorkoutDialog: React.FC<ViewWorkoutDialogProps> = ({
  open,
  onOpenChange,
  planId,
  workoutId,
  weekIndex,
  dayIndex,
  notes,
  text,
  sportType = "RUN",
  plan,
  workout,
  mobile,
  mobileEmbedded = false,
}) => {
  const t = useTranslations("ViewWorkoutDialog");
  const tSports = useTranslations("SportCatalog");
  const queryClient = useQueryClient();
  const {
    pendingWorkoutId,
    postponeWorkout: runPostponeWorkout,
    skipWorkout: runSkipWorkout,
  } = usePlanWorkoutActions();
  const { data: detail, isLoading } = usePlanWorkoutDetail(
    planId,
    workoutId,
    open,
  );
  const resolvedPlan = React.useMemo<ParsedPlan | null>(() => {
    if (Array.isArray(detail?.blocks)) return detail.blocks as ParsedPlan;
    if (typeof detail?.blocks === "string") {
      try {
        const parsed = JSON.parse(detail.blocks);
        return Array.isArray(parsed) ? (parsed as ParsedPlan) : null;
      } catch {
        return null;
      }
    }
    if (Array.isArray(plan)) return plan;
    return null;
  }, [detail?.blocks, plan]);
  const resolvedNotes = detail?.notes ?? notes;
  const resolvedText = detail?.text ?? text;
  const resolvedSportType =
    (detail?.sportType as SportType | undefined) ?? sportType;
  const chartSportType: WorkoutExpressionSportType =
    resolvedSportType === "CYCLING" || resolvedSportType === "SWIM"
      ? resolvedSportType
      : "RUN";
  const weekdayKeys = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ] as const;
  const weekdayLabel =
    dayIndex !== undefined
      ? t(`weekday.${weekdayKeys[dayIndex] ?? "mon"}`)
      : "";
  const sportLabelKind = resolveWorkoutSportLabelKind({
    sportType: resolvedSportType,
    structureKind: detail?.structureKind,
    sportDefinitionCode: detail?.sportDefinitionCode,
  });
  const sportLabel =
    sportLabelKind === "strength"
      ? tSports("sports.STRENGTH_TRAINING")
      : sportLabelKind === "stretching"
        ? tSports("sports.STRETCHING")
        : sportLabelKind === "cycling"
          ? t("sport.cycling")
          : sportLabelKind === "swim"
            ? t("sport.swim")
            : sportLabelKind === "run"
              ? t("sport.run")
              : tSports("families.UNKNOWN");

  const isIndependent = !planId;
  const isLinked = Boolean(detail?.links?.some((link) => !link.unlinkedAt));
  const isDoneOrSkipped =
    detail?.status === "DONE" || detail?.status === "SKIPPED";
  const isPending = pendingWorkoutId === workoutId;
  const [deleting, setDeleting] = React.useState(false);
  const capabilities = {
    delete:
      Boolean(workoutId) &&
      (isIndependent
        ? Boolean(detail) && !isLinked && detail?.status === "PLANNED"
        : detail?.capabilities?.delete === true),
    postpone: Boolean(planId) && detail?.capabilities?.postpone === true,
    skip: Boolean(planId) && detail?.capabilities?.skip === true,
  };
  const detectedMobile = useMobileViewport() === true;
  const isMobile = mobile ?? detectedMobile;

  const handleDelete = async () => {
    if (!workoutId || !capabilities.delete) return false;
    setDeleting(true);
    try {
      if (planId) await updatePlan(planId, { deletedWorkoutIds: [workoutId] });
      else await deleteIndependentWorkout(workoutId);
      await invalidateAfterPlanMutation(queryClient, { planId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["scheduled-workouts"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() }),
      ]);
      toast.success(t("deleteSuccess"));
      onOpenChange(false);
    } catch {
      toast.error(t("deleteFailed"));
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const handlePostpone = async () => {
    if (!planId || !workoutId || !detail || !capabilities.postpone)
      return false;
    if (isDoneOrSkipped) return;
    if (isLinked) {
      toast.message(t("linkedBlockedTip"));
      return;
    }
    const sourceDayOffset =
      typeof detail.dayOffset === "number"
        ? detail.dayOffset
        : typeof weekIndex === "number" && typeof dayIndex === "number"
          ? weekIndex * 7 + dayIndex
          : 0;
    try {
      await runPostponeWorkout({
        planId,
        workoutId,
        status: detail.status,
        sourceDayOffset,
        text: detail.text,
        notes: detail.notes ?? null,
        name: detail.name ?? null,
        sportType: detail.sportType,
      });
      await invalidateAfterPlanMutation(queryClient, { planId });
      toast.success(t("postponeSuccess"));
    } catch {
      toast.error(t("postponeFailed"));
      return false;
    }
  };

  const handleSkip = async () => {
    if (!planId || !workoutId || !detail || !capabilities.skip) return false;
    if (isDoneOrSkipped) return;
    if (isLinked) {
      toast.message(t("linkedBlockedTip"));
      return;
    }
    try {
      await runSkipWorkout({
        planId,
        workoutId,
        status: detail.status,
      });
      await invalidateAfterPlanMutation(queryClient, { planId });
      toast.success(t("skipSuccess"));
    } catch {
      toast.error(t("skipFailed"));
      return false;
    }
  };

  const actions = (
    <WorkoutDetailActions
      capabilities={capabilities}
      pending={deleting || isPending || isLoading}
      onPostpone={handlePostpone}
      onSkip={handleSkip}
      onDelete={handleDelete}
    />
  );

  if (isMobile) {
    if (mobileEmbedded) {
      return (
        <MobileViewWorkoutContent
          workout={detail ?? workout ?? null}
          loading={isLoading}
          pending={isPending || isLoading}
          actions={actions}
          onPostpone={async () => {
            await handlePostpone();
          }}
          onSkip={async () => {
            await handleSkip();
          }}
        />
      );
    }
    return (
      <MobileViewWorkoutDialog
        open={open}
        onOpenChange={onOpenChange}
        workout={detail ?? workout ?? null}
        loading={isLoading}
        pending={isPending || isLoading}
        actions={actions}
        onPostpone={async () => {
          await handlePostpone();
        }}
        onSkip={async () => {
          await handleSkip();
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96dvh] w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none pc:max-h-[85vh] pc:w-[50vw] pc:gap-4 pc:p-6">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pb-4 pt-4 pr-14 text-left pc:border-0 pc:p-0">
          <DialogTitle>
            {weekIndex !== undefined && dayIndex !== undefined
              ? t("titleWithWeek", {
                  week: weekIndex + 1,
                  day: weekdayLabel,
                })
              : t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pc:p-0 pc:pr-1">
          <div className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-control-lg bg-neutral-100 px-4 dark:bg-muted/45 pc:mb-2 pc:min-h-0 pc:justify-start pc:rounded-none pc:bg-transparent pc:px-0 pc:dark:bg-transparent">
            <div className="text-sm font-medium">{t("sportTypeLabel")}</div>
            <div className="text-sm text-muted-foreground">{sportLabel}</div>
          </div>

          <div className="grid gap-4 pc:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{t("notesLabel")}</div>
              <Textarea
                value={resolvedNotes || ""}
                readOnly
                disabled
                placeholder={t("notesPlaceholder")}
                className="h-24 resize-none rounded-control-lg border-0 bg-neutral-100 px-4 py-3 disabled:cursor-default disabled:opacity-100 dark:bg-muted/45 pc:h-100 pc:bg-neutral-100 pc:dark:bg-muted/45"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{t("rulesLabel")}</div>
              <Textarea
                value={resolvedText || ""}
                readOnly
                disabled
                placeholder={t("rulesPlaceholder")}
                className="h-32 resize-none rounded-control-lg border-0 bg-neutral-100 px-4 py-3 disabled:cursor-default disabled:opacity-100 dark:bg-muted/45 pc:h-40 pc:bg-neutral-100 pc:dark:bg-muted/45"
              />
              {isLoading && (
                <div className="text-sm text-muted-foreground">
                  {t("loading")}
                </div>
              )}
              {detail ? (
                <WorkoutRenderer workout={detail} density="DETAIL" />
              ) : resolvedPlan ? (
                <div className="space-y-2">
                  <WorkoutPlanChart
                    plan={resolvedPlan}
                    sportType={chartSportType}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {detail?.estimatedLoad != null ? (
            <WorkoutLoadEstimateSection detail={detail} />
          ) : null}
        </div>

        <DialogFooter className="relative z-10 shrink-0 flex-row gap-1.5 border-t border-border/60 bg-background px-4 py-3 pc:gap-2 pc:px-0 pc:pb-0 pc:pt-3 sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-nowrap gap-1.5 pc:flex-wrap pc:gap-2">
            <ManagedWorkoutExternalActions
              className={footerActionLayoutClassName}
              structureKind={detail?.structureKind}
              workoutId={workoutId}
              workoutName={detail?.name}
            />
            {actions}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={`${footerActionLayoutClassName} hidden pc:inline-flex`}
          >
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type DetailLike = {
  status: import("@/api/plans").PlanWorkoutStatus;
  estimatedLoad?: number | null;
  estimatedLoadSource?: string | null;
  estimatedLoadComputedAt?: string | null;
  estimatedLoadInputs?: {
    thresholds?: {
      ftp: number | null;
      cp: number | null;
      lthr: number | null;
      runThresholdPaceSecPerKm: number | null;
      swimThresholdPaceSecPer100m: number | null;
    };
    bySteps?: Array<{
      stepId: string | null;
      bucket: "POWER" | "HR" | "PACE" | "RPE";
      ifValue: number;
      durationSec: number;
      contribution: number;
      partialEstimate: boolean;
    }>;
    mixedSource?: boolean;
  } | null;
  links?: Array<{
    role: "PRIMARY" | "SECONDARY";
    unlinkedAt: string | null;
    actualLoad?: number | null;
    actualLoadSource?: "POWER" | "HEART_RATE" | "PACE" | "SESSIONRPE" | null;
  }> | null;
};

function WorkoutLoadEstimateSection({ detail }: { detail: DetailLike }) {
  const t = useTranslations("WorkoutLoadEstimate");
  const inputs = detail.estimatedLoadInputs;
  const bySteps = Array.isArray(inputs?.bySteps) ? inputs.bySteps : [];
  const partialEstimate = bySteps.some((s) => s.partialEstimate);

  return (
    <div className="mt-4 rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{t("sectionTitle")}</div>
        <WorkoutLoadBadge
          estimatedLoad={detail.estimatedLoad ?? null}
          estimatedLoadSource={
            (detail.estimatedLoadSource as
              | "POWER"
              | "HR"
              | "PACE"
              | "RPE"
              | "NONE"
              | null
              | undefined) ?? null
          }
          links={
            (detail.links as Array<{
              id: string;
              planId: string;
              planWorkoutId: string;
              activityId: number;
              role: "PRIMARY" | "SECONDARY";
              source: "MANUAL" | "AUTO" | "AI";
              linkedAt: string;
              unlinkedAt: string | null;
              actualLoad?: number | null;
              actualLoadSource?:
                | "POWER"
                | "HEART_RATE"
                | "PACE"
                | "SESSIONRPE"
                | null;
            }> | null) ?? null
          }
          mixedSource={inputs?.mixedSource ?? false}
          partialEstimate={partialEstimate}
        />
      </div>
      {bySteps.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-mobile-caption pc:text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">{t("table.bucket")}</th>
                <th className="px-2 py-1 text-right">{t("table.if")}</th>
                <th className="px-2 py-1 text-right">{t("table.duration")}</th>
                <th className="px-2 py-1 text-right">
                  {t("table.contribution")}
                </th>
              </tr>
            </thead>
            <tbody>
              {bySteps.map((step, idx) => (
                <tr
                  key={`${step.stepId ?? idx}`}
                  className="border-t border-border/40"
                >
                  <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1">
                    {t(`source.${step.bucket}` as const)}
                    {step.partialEstimate ? (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        *
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {step.ifValue.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {Math.round(step.durationSec / 60)}m
                  </td>
                  <td className="px-2 py-1 text-right">
                    {Math.round(step.contribution)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {partialEstimate ? (
        <div className="mt-2 text-mobile-caption pc:text-[11px] text-amber-600 dark:text-amber-400">
          {t("partialEstimateTip")}
        </div>
      ) : null}
    </div>
  );
}

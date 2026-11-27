"use client";

import React from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { updateIndependentWorkout, updatePlanWorkout } from "@/api/plans";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { WorkoutEditorSheet } from "./WorkoutEditorSheet";
import { usePlanWorkoutDetail } from "@/api/usePlans";
import type { WorkoutExpressionSportType } from "@/components/plan/workout-expression-codec";
import { WorkoutLoadBadge } from "@/components/plan/workout-load-badge";
import { useTranslations } from "next-intl";
import type { PlanWorkout } from "@/api/plans";
import { resolveWorkoutSportLabelKind } from "@/lib/workout-sport-label";
import { useMobileViewport } from "@/hooks/use-mobile";
import {
  MobileViewWorkoutContent,
  MobileViewWorkoutDialog,
} from "@/components/plan/mobile-view-workout-dialog";
import { WorkoutDetailActions } from "./workout-detail-actions";
import { useWorkoutDetailCommands } from "./use-workout-detail-commands";
import { PlanWorkoutActivityLinkControl } from "./plan-workout-activity-link-control";
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
  workout?: PlanWorkout;
  onMoveWorkout?: (workout: PlanWorkout) => void;
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
  onMoveWorkout,
  mobile,
  mobileEmbedded = false,
}) => {
  const t = useTranslations("ViewWorkoutDialog");
  const tSports = useTranslations("SportCatalog");
  const titleId = React.useId();
  const queryClient = useQueryClient();
  const tEditor = useTranslations("WorkoutEditor");
  const [editWorkout, setEditWorkout] = React.useState<PlanWorkout | null>(null);
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

  const commands = useWorkoutDetailCommands(detail, () => onOpenChange(false));
  const openingMove = React.useRef(false);
  const detectedMobile = useMobileViewport() === true;
  const isMobile = mobile ?? detectedMobile;

  const actions = (
    <WorkoutDetailActions
      {...commands}
      pending={commands.pending || isLoading}
      onEdit={detail?.capabilities?.edit ? () => setEditWorkout(detail) : undefined}
      onMove={
        onMoveWorkout &&
        detail?.status === "PLANNED" &&
        commands.capabilities.postpone
          ? () => {
              openingMove.current = true;
              onMoveWorkout(detail);
              onOpenChange(false);
            }
          : undefined
      }
    />
  );

  if (editWorkout) {
    return (
      <WorkoutEditorSheet
        open={open}
        onOpenChange={(next) => { if (!next) setEditWorkout(null); }}
        title={tEditor("title.edit")}
        saveLabel={t("saveWorkout")}
        showNameField
        mobilePlanLayout={isMobile}
        resetKey={`${editWorkout.id}:${editWorkout.revision}`}
        initialValue={{
          ...editWorkout,
          notes: editWorkout.notes ?? undefined,
          blocks: editWorkout.structure.kind === "ENDURANCE" ? editWorkout.structure.blocks as ParsedPlan : null,
        }}
        onSave={async (payload) => {
          const fields = {
            sportType: payload.sportType, sportDefinitionCode: payload.sportDefinitionCode,
            definition: payload.definition, name: payload.name, notes: payload.notes,
          };
          const saved = planId
            ? await updatePlanWorkout(planId, editWorkout.id, {
                ...fields, expectedRevision: editWorkout.revision,
                weekIndex: editWorkout.weekIndex, dayIndex: editWorkout.dayIndex, sessionIndex: editWorkout.sessionIndex,
              })
            : editWorkout.scheduledDate && editWorkout.revision && await updateIndependentWorkout(editWorkout.id, {
                ...fields, expectedRevision: editWorkout.revision, scheduledDate: editWorkout.scheduledDate,
              });
          if (!saved) throw new Error(tEditor("errors.saveFailed"));
          await invalidateAfterPlanMutation(queryClient, { planId });
        }}
      />
    );
  }

  if (isMobile) {
    if (mobileEmbedded) {
      return (
        <MobileViewWorkoutContent
          workout={detail ?? workout ?? null}
          loading={isLoading}
          pending={commands.pending || isLoading}
          actions={actions}
          onPostpone={async () => {
            await commands.onPostpone();
          }}
          onSkip={async () => {
            await commands.onSkip();
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
        pending={commands.pending || isLoading}
        actions={actions}
        onPostpone={async () => {
          await commands.onPostpone();
        }}
        onSkip={async () => {
          await commands.onSkip();
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={titleId}
        className="flex max-h-[96dvh] w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none pc:max-h-[85vh] pc:w-[50vw] pc:gap-4 pc:p-6"
        onCloseAutoFocus={(event) => {
          if (openingMove.current) event.preventDefault();
          openingMove.current = false;
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pb-4 pt-4 pr-14 text-left pc:border-0 pc:p-0">
          <DialogTitle id={titleId}>
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

        <DialogFooter className="relative z-10 shrink-0 flex-row gap-1.5 border-t border-border/60 px-4 py-3 pc:gap-2 pc:px-0 pc:pb-0 pc:pt-3 sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 pc:flex-wrap pc:gap-2">
            {detail && workoutId ? (
              <PlanWorkoutActivityLinkControl
                workoutId={workoutId}
                sportType={detail.sportType}
                scheduledDateKey={detail.scheduledDate?.slice(0, 10) ?? null}
                links={detail.links}
                buttonSize="sm"
              />
            ) : null}
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
              planId: string | null;
              planWorkoutId: string;
              activityId: number;
              role: "PRIMARY" | "SECONDARY";
              source: "MANUAL" | "AUTO" | "AI" | "AUTO_MATCH";
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

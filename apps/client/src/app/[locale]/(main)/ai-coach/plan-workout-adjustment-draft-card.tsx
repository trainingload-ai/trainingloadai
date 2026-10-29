"use client";

import { ArrowRight, CheckCircle2, PencilLine } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmAndApplyCoachDecision } from "@/api/ai-coach";
import { useUpdatePlanWorkout } from "@/api/usePlanMutations";
import {
  adjustmentDraftToUpdatePlanWorkoutDto,
  normalizeAdjustmentSportType,
  type PlanWorkoutAdjustmentDraft,
} from "@/lib/plan-workout-adjustment-draft";
import { CoachCard } from "./cards/CoachCard";
import { CoachWorkoutPreview } from "./coach-workout-preview";

/**
 * 训练单课调整草案卡。
 *
 * 有 decisionId：走 CoachDecision 的 confirmAndApply（账本路径）。
 * 旧消息没有 id：仍 PATCH 课次，兼容历史对话。
 */

function WorkoutPane({
  title,
  workout,
  position,
}: {
  title: string;
  workout: PlanWorkoutAdjustmentDraft["before"];
  position: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-background/80 p-3 dark:bg-background/45">
      <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">
        {workout.name || workout.sportType}
      </div>
      <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
        {position}
        {workout.scheduledDate ? ` · ${workout.scheduledDate}` : ""}
      </div>
      <CoachWorkoutPreview
        text={workout.text}
        sportType={normalizeAdjustmentSportType(workout.sportType)}
      />
      {workout.notes ? (
        <p className="mt-2 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {workout.notes}
        </p>
      ) : null}
    </div>
  );
}

export function PlanWorkoutAdjustmentDraftCard({
  draft,
  disabled,
  alreadyApplied,
  onApplied,
}: {
  draft: PlanWorkoutAdjustmentDraft;
  disabled?: boolean;
  alreadyApplied?: boolean;
  onApplied?: (payload: { planId: string; workoutId: string }) => Promise<void>;
}) {
  const t = useTranslations("AiCoachPage.workoutAdjustment");
  const updateWorkout = useUpdatePlanWorkout();
  const [applyingDecision, setApplyingDecision] = useState(false);
  const [appliedLocally, setAppliedLocally] = useState(false);
  const applied = alreadyApplied || appliedLocally;
  const applying = updateWorkout.isPending || applyingDecision;

  const applyDraft = async () => {
    if (disabled || applied || applying) return;
    try {
      if (draft.decisionId) {
        setApplyingDecision(true);
        await confirmAndApplyCoachDecision(draft.decisionId);
      } else {
        await updateWorkout.mutateAsync({
          planId: draft.planId,
          workoutId: draft.workoutId,
          dto: adjustmentDraftToUpdatePlanWorkoutDto(draft),
        });
      }
      setAppliedLocally(true);
      await onApplied?.({
        planId: draft.planId,
        workoutId: draft.workoutId,
      });
      toast.success(t("applySuccess"));
    } catch {
      toast.error(t("applyFailed"));
    } finally {
      setApplyingDecision(false);
    }
  };

  const applyButton = (
    <Button
      type="button"
      size="sm"
      disabled={disabled || applying || applied}
      onClick={() => {
        void applyDraft();
      }}
    >
      {applied ? (
        t("applied")
      ) : applying ? (
        t("applying")
      ) : (
        <>
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          {t("apply")}
        </>
      )}
    </Button>
  );

  return (
    <CoachCard
      tone="info"
      icon={<PencilLine className="h-4 w-4" />}
      title={draft.title}
      subtitle={draft.reason}
      footer={applyButton}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <WorkoutPane
          title={t("before")}
          workout={draft.before}
          position={t("position", {
            week: draft.before.weekIndex,
            day: draft.before.dayIndex,
          })}
        />
        <div className="hidden items-center justify-center text-muted-foreground md:flex">
          <ArrowRight className="h-4 w-4" />
        </div>
        <WorkoutPane
          title={t("after")}
          workout={draft.after}
          position={t("position", {
            week: draft.after.weekIndex,
            day: draft.after.dayIndex,
          })}
        />
      </div>

      <div className="pt-1">
        <CoachCard.SectionTitle>{t("changes")}</CoachCard.SectionTitle>
        <div className="mt-2 space-y-1.5">
          {draft.changes.map((change, index) => (
            <div
              key={`${change.field}-${index}`}
              className="text-mobile-caption pc:text-xs leading-5"
            >
              <span className="font-medium text-foreground">
                {t.has(`fields.${change.field}`)
                  ? t(`fields.${change.field}`)
                  : change.field}
              </span>
              <span className="text-muted-foreground">
                ：{change.before} → {change.after}
              </span>
              {change.reason ? (
                <span className="text-muted-foreground">
                  （{change.reason}）
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </CoachCard>
  );
}

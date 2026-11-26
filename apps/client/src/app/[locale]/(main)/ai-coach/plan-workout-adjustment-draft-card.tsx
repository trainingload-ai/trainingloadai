"use client";

import { CheckCircle2, PencilLine } from "lucide-react";
import { useRef, useState } from "react";
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
import { CoachReviewCard } from "./cards/coach-plan-review-card";
import { PlanWorkoutAdjustmentComparison } from "./plan-workout-adjustment-comparison";
import { CoachWorkoutPreview } from "./coach-workout-preview";

/**
 * 训练单课调整草案卡。
 *
 * 有 decisionId：走 CoachDecision 的 confirmAndApply（账本路径）。
 * 旧消息没有 id：仍 PATCH 课次，兼容历史对话。
 */

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
  const review = useTranslations("AiCoachPage.decision");
  const updateWorkout = useUpdatePlanWorkout();
  const inFlight = useRef(false);
  const [applyError, setApplyError] = useState(false);
  const [applyingDecision, setApplyingDecision] = useState(false);
  const [appliedLocally, setAppliedLocally] = useState(false);
  const applied = alreadyApplied || appliedLocally;
  const applying = updateWorkout.isPending || applyingDecision;

  const applyDraft = async () => {
    if (disabled || applied || inFlight.current) return;
    inFlight.current = true;
    setApplyError(false);
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
      setApplyError(true);
    } finally {
      inFlight.current = false;
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
    <CoachReviewCard title={draft.title} summary={draft.reason} icon={PencilLine}
      cardKind="workout-adjustment-review" status={applied ? t("applied") : review("reviewBadge")}
      facts={<span className="text-muted-foreground">{review("changed")} <strong className="text-foreground">1</strong></span>}
      footer={<>
        {applyError ? <p role="alert" className="w-full text-sm text-destructive">{t("applyFailed")}</p> : null}
        {applyButton}
      </>}>
      <PlanWorkoutAdjustmentComparison
        draft={draft}
        renderWorkout={(workout) => <CoachWorkoutPreview text={workout.text} sportType={normalizeAdjustmentSportType(workout.sportType)} />}
      />

      <div className="pt-1">
        <h3 className="text-sm font-semibold">{t("changes")}</h3>
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
    </CoachReviewCard>
  );
}

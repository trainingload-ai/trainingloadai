"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  aiCoachMessagesQueryKey,
  fetchCoachCalendarMove,
  refreshCoachCalendarMove,
} from "@/api/ai-coach";
import { cancelCalendarMove, confirmCalendarMove } from "@/api/plans";
import {
  CALENDAR_MOVE_EXPIRED_ERROR_CODE,
  type CoachTurnErrorData,
} from "@shared/coach-turn-error";
import {
  CalendarAdjustmentState,
  PlanCalendarMoveState,
  type PlanCalendarMovePreview,
  type PlanCalendarMoveRefreshResult,
} from "@shared/plan-proposal";
import { ApiFetchError } from "@/lib/api";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { Button } from "@/components/ui/button";
import { CoachScheduleAdjustmentCard } from "./cards/CoachScheduleAdjustmentCard";
import { CoachScheduleComparison } from "./cards/coach-schedule-comparison";
import { CoachTranscriptMetaRow } from "./coach-transcript-meta-row";
import { CalendarAdjustmentControls } from "../calendar/components/calendar-adjustment-controls";
import { useCalendarAdjustment } from "../calendar/components/use-calendar-adjustments";
import { CoachSchedulePreviewContext } from "./coach-preview-panel";

export function isCalendarMoveRecoveryError(error: CoachTurnErrorData | null) {
  return (
    error?.code === CALENDAR_MOVE_EXPIRED_ERROR_CODE ||
    (error?.code === "business" &&
      error.message === "This calendar coaching session has closed")
  );
}

export function useCoachCalendarMovePreview(sid: string | undefined) {
  return useQuery({
    queryKey: calendarMoveQueryKey(sid),
    queryFn: () => fetchCoachCalendarMove(sid!),
    enabled: Boolean(sid?.startsWith("calendar-move:")),
    retry: false,
    refetchInterval: ({ state }) => {
      const current = state.data;
      if (current?.state !== PlanCalendarMoveState.Pending) return false;
      return Math.max(1_000, Date.parse(current.expiresAt) - Date.now() + 250);
    },
  });
}

export const calendarMoveQueryKey = (sid: string | undefined) => ["coach-calendar-move", sid];

type CalendarMoveAction =
  | { phase: "idle" }
  | { phase: "refreshing" }
  | { phase: "confirming" }
  | { phase: "cancelling" }
  | { phase: "cancelFailed"; confirmationId?: string }
  | { phase: "reloadRequired"; confirmationId: string }
  | { phase: "refreshFailed"; confirmationId?: string }
  | { phase: "confirmFailed" }
  | { phase: "blocked"; reason: Exclude<PlanCalendarMoveRefreshResult["status"], "refreshed"> };

export function CoachCalendarMoveRecoveryCard({
  sid,
  current,
  disabled,
}: {
  sid: string;
  current: PlanCalendarMovePreview | undefined;
  disabled: boolean;
}) {
  const t = useTranslations("CalendarMove");
  const queryClient = useQueryClient();
  const schedule = useContext(CoachSchedulePreviewContext);
  const adjustment = useCalendarAdjustment(current?.planId ?? "", current?.confirmationId ? current.previewId : undefined).data;
  const editing = Boolean(current && schedule?.editingAdjustmentId === current.previewId);
  const [action, setAction] = useState<CalendarMoveAction>({ phase: "idle" });
  const pending = action.phase === "refreshing" || action.phase === "confirming" || action.phase === "cancelling";
  const reloadVersion = action.phase === "reloadRequired" || action.phase === "refreshFailed" || action.phase === "cancelFailed"
    ? action.confirmationId
    : undefined;
  const previewToggle = useRef<HTMLButtonElement>(null);
  const focusPreview = useRef(false);
  useEffect(() => {
    if (!focusPreview.current || !previewToggle.current) return;
    focusPreview.current = false;
    previewToggle.current.focus({ preventScroll: true });
  }, [current?.confirmationId, current?.state]);

  const refresh = async () => {
    if (disabled || pending) return;
    setAction({ phase: "refreshing" });
    try {
      const restored = await refreshCoachCalendarMove(sid, reloadVersion);
      if (!restored) throw new Error("Missing refreshed calendar move");
      if (restored.status === "refreshed") {
        await queryClient.cancelQueries({ queryKey: calendarMoveQueryKey(sid) });
        focusPreview.current = true;
        queryClient.setQueryData(calendarMoveQueryKey(sid), restored.preview);
        void queryClient.invalidateQueries({
          queryKey: aiCoachMessagesQueryKey(sid),
        });
        setAction({ phase: "idle" });
      } else {
        setAction({ phase: "blocked", reason: restored.status });
      }
    } catch {
      setAction({ phase: "refreshFailed", confirmationId: reloadVersion });
    }
  };

  const cancel = async () => {
    if (disabled || pending || !current?.planId) return;
    setAction({ phase: "cancelling" });
    try {
      const resolved = await cancelCalendarMove(current.planId, current.previewId);
      if (!resolved || resolved.previewId !== current.previewId ||
        resolved.state === PlanCalendarMoveState.Pending)
        throw new Error("Missing calendar move cancellation");
      await queryClient.cancelQueries({ queryKey: calendarMoveQueryKey(sid) });
      focusPreview.current = true;
      queryClient.setQueryData(calendarMoveQueryKey(sid), resolved);
      void invalidateAfterPlanMutation(queryClient, { planId: current.planId });
      void queryClient.invalidateQueries({ queryKey: aiCoachMessagesQueryKey(sid) });
      setAction({ phase: "idle" });
    } catch {
      setAction({ phase: "cancelFailed", confirmationId: reloadVersion });
    }
  };

  const confirm = async (confirmationId: string) => {
    if (disabled || pending || !current?.planId) return;
    setAction({ phase: "confirming" });
    try {
      const receipt = await confirmCalendarMove(current.planId, current.previewId, confirmationId);
      if (!receipt?.readbackVerified || receipt.previewId !== current.previewId)
        throw new Error("Missing calendar move confirmation");
      await queryClient.cancelQueries({ queryKey: calendarMoveQueryKey(sid) });
      focusPreview.current = true;
      queryClient.setQueryData(calendarMoveQueryKey(sid), {
        ...current,
        state: PlanCalendarMoveState.Applied,
        receipt,
      });
      void invalidateAfterPlanMutation(queryClient, { planId: receipt.planId });
      void queryClient.invalidateQueries({ queryKey: aiCoachMessagesQueryKey(sid) });
      setAction({ phase: "idle" });
    } catch (failure) {
      const changed = failure instanceof ApiFetchError &&
        (failure.status === 409 || failure.status === 422);
      setAction(changed ? { phase: "reloadRequired", confirmationId } : { phase: "confirmFailed" });
    }
  };

  if (adjustment && (adjustment.isVersioned || ["STALE", "EXPIRED", "INVALIDATED"].includes(adjustment.state))) {
    return (
      <section aria-label={t("recovery.previewTitle")}>
        <CoachScheduleAdjustmentCard
          state={adjustment.state}
          toggleRef={previewToggle}
          planTitle={adjustment.presentation.title}
          footer={<CalendarAdjustmentControls adjustment={adjustment} disabled={disabled || editing} />}
        >
          <CoachScheduleComparison proposal={adjustment.presentation}
            onOpenPreview={schedule?.openAdjustment ? () => schedule.openAdjustment?.(adjustment.id) : undefined}
          />
        </CoachScheduleAdjustmentCard>
      </section>
    );
  }

  const blocked = action.phase === "blocked" ? action.reason : undefined;
  if (!blocked && current?.planId && current.confirmationId &&
    (current.state === PlanCalendarMoveState.Pending ||
      current.state === PlanCalendarMoveState.Applied ||
      current.state === PlanCalendarMoveState.Cancelled)) {
    const applied = current.state === PlanCalendarMoveState.Applied;
    const discarded = current.state === PlanCalendarMoveState.Cancelled;
    const needsReload = reloadVersion === current.confirmationId;
    const state = applied
      ? CalendarAdjustmentState.Applied
      : discarded
        ? CalendarAdjustmentState.Discarded
        : needsReload
          ? CalendarAdjustmentState.Stale
          : CalendarAdjustmentState.Ready;
    const previewError = action.phase === "cancelFailed" ? "closeFailed" : needsReload
      ? action.phase === "refreshFailed" ? "recovery.failed" : "recovery.stalePreview"
      : action.phase === "confirmFailed" ? "recovery.confirmFailed" : null;
    return (
      <section aria-label={t("recovery.previewTitle")}>
        <CoachScheduleAdjustmentCard
          state={state}
          toggleRef={previewToggle}
          planTitle={current.presentation.title}
          statusLabel={applied ? t("recovery.alreadyApplied") : discarded ? t("recovery.discarded") : undefined}
          footer={applied || discarded ? undefined : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || pending || editing}
                onClick={() => void cancel()}
              >
                {t(action.phase === "cancelling" ? "working" : "cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={needsReload ? "secondary" : "default"}
                disabled={disabled || pending || editing}
                onClick={() => {
                  if (needsReload) void refresh();
                  else if (current.confirmationId) void confirm(current.confirmationId);
                }}
              >
                {needsReload && <RefreshCw aria-hidden="true" />}
                {t(pending && action.phase !== "cancelling" ? "working" : needsReload ? "recovery.action" : "confirmAdjustment")}
              </Button>
            </>
          )}
        >
          <CoachScheduleComparison
            proposal={current.presentation}
            initialMove={current.impact}
            onOpenPreview={!applied && !discarded && schedule?.openAdjustment
              ? () => schedule.openAdjustment?.(current.previewId)
              : undefined}
          />
          {previewError && !applied && !discarded ? (
            <p role="status" className="text-xs text-destructive">
              {t(previewError)}
            </p>
          ) : null}
        </CoachScheduleAdjustmentCard>
      </section>
    );
  }

  const closed =
    blocked ?? (current?.state === PlanCalendarMoveState.Applied
        ? "alreadyApplied"
        : current?.state === PlanCalendarMoveState.Cancelled
          ? "discarded"
          : current?.state === PlanCalendarMoveState.Invalidated
            ? "scheduleChanged"
            : null);
  const message = closed
      ? t(`recovery.${closed}`)
      : action.phase === "refreshFailed"
        ? t("recovery.failed")
        : t("recovery.expired");

  return (
    <CoachTranscriptMetaRow
      title={t(closed ? "title" : "recovery.title")}
      item={{
        id: `${sid}:refresh-calendar-move`,
        type: "turn_failed",
        reason: "unknown",
        message,
      }}
      recoveryAction={
        !closed
          ? {
              label: t(pending ? "working" : "recovery.action"),
              onClick: () => void refresh(),
              disabled: disabled || pending,
            }
          : undefined
      }
    />
  );
}

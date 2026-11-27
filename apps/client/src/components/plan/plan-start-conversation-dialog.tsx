"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { aiOperationErrorReason, type AiOperationErrorReason } from "@shared/ai-operation-errors";
import { useManagedAiAccessRecovery } from "@deployment/managed-ui";
import {
  assessPlanStart,
  confirmPlanStart,
  fetchPlanStartDraft,
  type PlanStartAssessmentResult,
  type PlanStartDraft,
  type PlanWorkout,
} from "@/api/plans";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarMovePreviewCalendar } from "@/app/[locale]/(main)/calendar/components/calendar-move-preview-calendar";
import { CoachScheduleReview } from "@/app/[locale]/(main)/ai-coach/cards/coach-schedule-comparison";
import {
  rollingStartCarryoverInfo,
  workoutsForPlanStart,
} from "@/lib/coach-plan-start";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { aiOperationErrorCode } from "@/lib/ai-operation-errors";
import { cn } from "@/lib/utils";
import { OfficialPlanStartCalendar } from "./official-plan-start-calendar";
import { PlanStartCalendarFooter } from "./plan-start-calendar-footer";

function isReassessmentConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: string;
    errorCode?: string;
    message?: string;
    data?: { code?: string };
  };
  return (
    candidate.code === "PLAN_START_REASSESSMENT_REQUIRED" ||
    candidate.errorCode === "PLAN_START_REASSESSMENT_REQUIRED" ||
    candidate.data?.code === "PLAN_START_REASSESSMENT_REQUIRED" ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("PLAN_START_REASSESSMENT_REQUIRED"))
  );
}

function PlanStartCalendarPreview({ current }: { current: PlanStartDraft }) {
  const t = useTranslations("PlanStartConversation");
  const fmt = useFormatter();
  const schedule: Record<string, PlanWorkout[]> = {};
  for (const workout of workoutsForPlanStart(
    current.plan,
    current.startDate,
    current.earliestStartDate,
  )) {
    (schedule[workout.scheduledDate] ??= []).push(workout);
  }
  const carryover = rollingStartCarryoverInfo(current.plan, current.startDate);
  const formatShort = (ymd: string) =>
    fmt.dateTime(new Date(`${ymd}T12:00:00Z`), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {carryover ? (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t("rollingCarryoverNote", {
              through: formatShort(carryover.firstWeekThrough),
              dates: carryover.carryoverDates.map(formatShort).join("、"),
            })}
          </span>
        </div>
      ) : null}
      <section
        className="min-h-0 flex-1 overflow-hidden"
        aria-label={t("pendingCalendar")}
      >
        <CalendarMovePreviewCalendar
          key={current.startDate}
          planId={current.plan.id}
          initialDate={current.startDate}
          presentation={null}
          schedule={schedule}
        />
      </section>
    </div>
  );
}

type AssessmentPhase =
  | { step: "date" }
  | { step: "evaluating" }
  | { step: "result"; result: Exclude<PlanStartAssessmentResult, { outcome: "STARTED" }> }
  | { step: "error"; conflict: boolean; reason: AiOperationErrorReason | null };

function PlanStartAssessmentBody({
  planId,
  close,
  onTitleChange,
}: {
  planId: string;
  close: () => void;
  onTitleChange: (title: string | null) => void;
}) {
  const t = useTranslations("PlanStartConversation");
  const operationT = useTranslations("AiOperationErrors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data: session } = useViewerSession();

  const [selected, setSelected] = useState<PlanStartDraft | null>(null);
  const [phase, setPhase] = useState<AssessmentPhase>({ step: "date" });
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const draftQuery = useQuery({
    queryKey: ["plan-start-draft", session?.user?.id, planId],
    queryFn: () => fetchPlanStartDraft(planId),
    enabled: Boolean(session?.user?.id),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const current = selected ?? draftQuery.data ?? null;

  useEffect(() => {
    onTitleChange(current?.plan.title ?? null);
  }, [current?.plan.title, onTitleChange]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const finishStart = useCallback(() => {
    void invalidateAfterPlanMutation(queryClient, { planId });
    toast.success(t("startedToast"));
    close();
  }, [close, planId, queryClient, t]);

  const dateMutation = useMutation({
    mutationFn: (startDate: string) => fetchPlanStartDraft(planId, startDate),
    onSuccess: (next) => {
      setSelected(next);
      setConfirmError(null);
      setVersionConflict(false);
      setPhase({ step: "date" });
    },
  });

  const runAssessment = useCallback(
    async (draft: PlanStartDraft) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setConfirmError(null);
      setVersionConflict(false);
      setPhase({ step: "evaluating" });
      try {
        const result = await assessPlanStart(
          planId,
          {
            startDate: draft.startDate,
            revision: draft.revision,
            lang: locale,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (result.outcome === "STARTED") {
          finishStart();
          return;
        }
        setPhase({ step: "result", result });
      } catch (err) {
        if (controller.signal.aborted) return;
        setPhase({
          step: "error",
          conflict: isReassessmentConflict(err),
          reason: aiOperationErrorReason(aiOperationErrorCode(err)),
        });
      }
    },
    [finishStart, locale, planId],
  );

  const confirmMutation = useMutation({
    mutationFn: (input: {
      choice: "ORIGINAL" | "SUGGESTED";
      startDate: string;
      revision: string;
      previewId?: string;
    }) =>
      confirmPlanStart(planId, {
        startDate: input.startDate,
        revision: input.revision,
        choice: input.choice,
        previewId: input.previewId,
      }),
    onMutate: () => {
      setConfirmError(null);
      setVersionConflict(false);
    },
    onSuccess: () => {
      finishStart();
    },
    onError: (err) => {
      if (isReassessmentConflict(err)) {
        setVersionConflict(true);
        setConfirmError(t("versionConflict"));
        return;
      }
      setConfirmError(t("confirmFailed"));
    },
  });

  const reloadDraft = useCallback(async () => {
    setSelected(null);
    setConfirmError(null);
    setVersionConflict(false);
    setPhase({ step: "date" });
    await draftQuery.refetch();
  }, [draftQuery]);

  const backToDate = useCallback(() => {
    abortRef.current?.abort();
    setConfirmError(null);
    setVersionConflict(false);
    setPhase({ step: "date" });
  }, []);

  const submitting = confirmMutation.isPending;
  const assessmentError = phase.step === "error" ? phase.reason : null;
  const managedRecovery = useManagedAiAccessRecovery(assessmentError, {
    retry: current ? () => void runAssessment(current) : undefined,
    retryDisabled: submitting,
  });

  if (draftQuery.isPending && !current) {
    return (
      <div
        role="status"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (draftQuery.isError || !current) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <AlertCircle className="size-5 text-destructive" aria-hidden />
          <p role="alert" className="text-sm text-destructive">
            {t("loadFailed")}
          </p>
        </div>
        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] pc:pb-3">
          <Button type="button" variant="outline" onClick={close}>
            {t("cancelAssessment")}
          </Button>
          <Button type="button" onClick={() => void reloadDraft()}>
            {t("retryAssessment")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const canStartOnDate =
    current.startDate >= current.earliestStartDate &&
    !dateMutation.isPending &&
    !submitting;
  const directStart = (
    <Button
      type="button"
      variant="outline"
      disabled={!canStartOnDate}
      onClick={() =>
        confirmMutation.mutate({
          choice: "ORIGINAL",
          startDate: current.startDate,
          revision: current.revision,
        })
      }
    >
      {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {t("directStart")}
    </Button>
  );

  if (phase.step === "date") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 sm:px-4">
        <PlanStartCalendarPreview current={current} />
        <PlanStartCalendarFooter
          startDate={current.startDate}
          earliestStartDate={current.earliestStartDate}
          canChangeDate={!dateMutation.isPending && !submitting}
          onChangeDate={(nextDate) => dateMutation.mutate(nextDate)}
          notice={
            confirmError || dateMutation.error ? (
              <p role="alert" className="text-sm text-destructive">
                {confirmError ?? t("loadFailed")}
              </p>
            ) : null
          }
        >
          {versionConflict ? (
            <Button type="button" onClick={() => void reloadDraft()}>
              {t("reloadDraft")}
            </Button>
          ) : (
            <>
              {directStart}
              <Button
                type="button"
                disabled={!canStartOnDate}
                onClick={() => void runAssessment(current)}
              >
                {t("evaluate")}
              </Button>
            </>
          )}
        </PlanStartCalendarFooter>
      </div>
    );
  }

  const compactDateBar = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
      <span>
        {current.startDate} · {current.calendarTimeZone}
      </span>
    </div>
  );

  if (phase.step === "evaluating") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {compactDateBar}
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
        >
          <Loader2 className="size-6 animate-spin text-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {t("evaluatingTitle")}
          </p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            {t("evaluatingHint")}
          </p>
        </div>
        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] pc:pb-3">
          <Button type="button" variant="outline" onClick={backToDate}>
            {t("changeDate")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (phase.step === "error") {
    const { recoveryAction } = managedRecovery;
    const requiresReload = phase.conflict || versionConflict;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {compactDateBar}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
          <AlertCircle className="size-5 text-destructive" aria-hidden />
          <p role="alert" className="max-w-md text-sm text-foreground">
            {phase.conflict
              ? t("versionConflict")
              : managedRecovery.message ??
                (phase.reason ? operationT(phase.reason) : t("assessmentFailed"))}
          </p>
          {confirmError ? (
            <p role="alert" className="text-sm text-destructive">{confirmError}</p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-wrap pc:pb-3">
          <Button type="button" variant="outline" disabled={submitting} onClick={backToDate}>
            {t("changeDate")}
          </Button>
          {requiresReload ? (
            <Button type="button" onClick={() => void reloadDraft()}>
              {t("reloadDraft")}
            </Button>
          ) : (
            <>
              {directStart}
              {recoveryAction ? (
                <Button type="button" disabled={submitting || recoveryAction.disabled} onClick={recoveryAction.onClick}>
                  {recoveryAction.label}
                </Button>
              ) : phase.reason !== "accessRequired" ? (
                <Button type="button" disabled={submitting} onClick={() => void runAssessment(current)}>
                  {t("retryAssessment")}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
        {managedRecovery.overlay}
      </div>
    );
  }

  const { result } = phase;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {compactDateBar}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {result.outcome === "CONFLICT" ? (
          <section className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {t("conflictHeading")}
            </h3>
            <ul className="space-y-1 text-xs leading-5 text-foreground">
              {result.conflicts.map((item, idx) => (
                <li key={`${item.code}-${item.date ?? idx}`}>
                  {item.date ? (
                    <span className="font-medium">{item.date}：</span>
                  ) : null}
                  {item.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {result.outcome === "INSUFFICIENT_DATA" ? (
          <section className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("insufficientDataHeading")}
            </h3>
            {result.summary ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {result.summary}
              </p>
            ) : null}
            {result.missingEvidence.length ? (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-foreground">
                  {t("missingEvidenceLabel")}
                </p>
                <ul className="list-disc space-y-0.5 ps-4 text-xs leading-5 text-muted-foreground">
                  {result.missingEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : result.summary ? (
          <section className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
            <h3 className="text-xs font-semibold text-muted-foreground">
              {t("coachRecommendation")}
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
              {result.summary}
            </p>
          </section>
        ) : null}

        {(result.outcome === "SUGGESTED_CHANGES" ||
          result.outcome === "CONFLICT") &&
        result.proposal ? (
          <CoachScheduleReview proposal={result.proposal} />
        ) : null}
      </div>

      <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/60 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-col pc:pb-3">
        {confirmError ? (
          <p role="alert" className="w-full text-start text-xs text-destructive">
            {confirmError}
          </p>
        ) : null}
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={backToDate}
            >
              {t("changeDate")}
            </Button>
            {result.outcome === "CONFLICT" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={close}
              >
                {t("adjustSchedule")}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {versionConflict ? (
              <Button type="button" onClick={() => void reloadDraft()}>
                {t("reloadDraft")}
              </Button>
            ) : (
              <>
                {result.outcome === "SUGGESTED_CHANGES" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() =>
                        confirmMutation.mutate({
                          choice: "ORIGINAL",
                          startDate: result.startDate,
                          revision: result.revision,
                        })
                      }
                    >
                      {t("startOriginal")}
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        confirmMutation.mutate({
                          choice: "SUGGESTED",
                          startDate: result.startDate,
                          revision: result.revision,
                          previewId: result.previewId,
                        })
                      }
                    >
                      {submitting ? (
                        <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden />
                      ) : null}
                      {t("startWithSuggestions")}
                    </Button>
                  </>
                ) : null}

                {result.outcome === "CONFLICT" && result.proposal ? (
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      confirmMutation.mutate({
                        choice: "SUGGESTED",
                        startDate: result.startDate,
                        revision: result.revision,
                        previewId: result.previewId,
                      })
                    }
                  >
                    {submitting ? (
                      <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden />
                    ) : null}
                    {t("startWithSuggestions")}
                  </Button>
                ) : null}

                {result.outcome === "INSUFFICIENT_DATA" &&
                result.originalCanStart ? (
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      confirmMutation.mutate({
                        choice: "ORIGINAL",
                        startDate: result.startDate,
                        revision: result.revision,
                      })
                    }
                  >
                    {submitting ? (
                      <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden />
                    ) : null}
                    {t("startOriginal")}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </DialogFooter>
    </div>
  );
}

export function PlanStartConversationDialog({
  open,
  planId,
  officialTitle,
  onOpenChange,
}: {
  open: boolean;
  planId: string | null;
  officialTitle?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PlanStartConversation");
  const activation = useTranslations("PlanActivationDialog");
  const titleId = useId();
  const invoker = useRef<HTMLElement | null>(null);
  const [planTitle, setPlanTitle] = useState<string | null>(null);

  return (
    <Dialog open={open && Boolean(planId)} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={titleId}
        onOpenAutoFocus={() => {
          if (document.activeElement instanceof HTMLElement)
            invoker.current = document.activeElement;
        }}
        className={cn(
          "flex h-[min(840px,94dvh)] w-full flex-col gap-0 overflow-hidden p-0 pc:w-[calc(100%-2rem)] pc:p-0",
          officialTitle ? "pc:max-w-6xl" : "pc:max-w-4xl",
        )}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          invoker.current?.focus();
        }}
      >
        <DialogHeader className="shrink-0 space-y-0.5 px-4 pt-3.5 pb-2.5 pr-10">
          <DialogTitle id={titleId} className="truncate text-base">
            {officialTitle ?? planTitle ?? t("title")}
          </DialogTitle>
          <DialogDescription
            className={officialTitle ? "sr-only" : "text-xs"}
          >
            {officialTitle ? activation("officialDescription") : t("description")}
          </DialogDescription>
        </DialogHeader>
        {open && planId ? (
          officialTitle ? (
            <OfficialPlanStartCalendar
              key={planId}
              planId={planId}
              close={() => onOpenChange(false)}
            />
          ) : (
            <PlanStartAssessmentBody
              key={planId}
              planId={planId}
              close={() => onOpenChange(false)}
              onTitleChange={setPlanTitle}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

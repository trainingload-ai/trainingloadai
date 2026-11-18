"use client";

import { isRollingPlan } from "@/lib/rolling-plan";
import { RollingPlanCoverage } from "@/components/plan/rolling-plan-coverage";
import { RollingPlanCalendar } from "@/components/plan/rolling-plan-calendar";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  openPlanStartConversation,
  type PlanStartConversation,
} from "@/api/plans";
import {
  aiCoachMessagesQueryKey,
  fetchCoachSessionMessages,
} from "@/api/ai-coach";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CalendarSelect from "@/components/calendar-select";
import { CoachRuntimeProvider } from "@/app/[locale]/(main)/ai-coach/coach-runtime-provider";
import { CoachThreadLoading } from "@/app/[locale]/(main)/ai-coach/coach-thread";
import { coachRowsToUiMessages } from "@/app/[locale]/(main)/ai-coach/coach-rows-to-ui-messages";
import { CoachPlanDraftCalendarPreview } from "@/app/[locale]/(main)/ai-coach/coach-plan-draft-calendar-preview";
import { savedPlanToCoachDraft } from "@/lib/coach-plan-start";
import { parseScheduleConstraints } from "@shared/plan-calendar";
import { getRestoredStartDecisionApply } from "@/app/[locale]/(main)/ai-coach/coach-plan-decision-state";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";

function PlanCoachDialogBody({ planId }: { planId: string }) {
  const t = useTranslations("PlanStartConversation");
  const queryClient = useQueryClient();
  const { data: session } = useViewerSession();
  const prepared = useQuery({
    queryKey: ["plan-start-conversation", session?.user?.id, planId],
    queryFn: () => openPlanStartConversation(planId),
    enabled: Boolean(session?.user?.id),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState<PlanStartConversation | null>(null);
  const [editingDate, setEditingDate] = useState(false);
  const [entered, setEntered] = useState(false);
  const [committed, setCommitted] = useState(false);
  const current = selected ?? prepared.data;
  const messages = useQuery({
    queryKey: aiCoachMessagesQueryKey(current?.sid ?? ""),
    queryFn: () => fetchCoachSessionMessages(current!.sid),
    enabled: Boolean(current?.sid && session?.user?.id),
    staleTime: 0,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
  const initialMessages = coachRowsToUiMessages(messages.data ?? []);
  const hasStartProposal = initialMessages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "data-coach-tool" &&
        (part.data.input as { decisionType?: string } | null)?.decisionType ===
          "PLAN_START",
    ),
  );
  const appliedDecisionIds = JSON.stringify(
    [
      ...new Set(
        initialMessages.flatMap((message) =>
          message.parts.flatMap((part) => {
            if (part.type !== "data-coach-tool") return [];
            const result = part.data.input as {
              kind?: string;
              result?: string;
              decisionId?: string;
            } | null;
            const restored = getRestoredStartDecisionApply(result);
            if (restored) return [restored.decisionId];
            return result?.kind === "coach_decision_apply" &&
              result.result === "APPLIED" &&
              typeof result.decisionId === "string"
              ? [result.decisionId]
              : [];
          }),
        ),
      ),
    ].sort(),
  );
  const appliedReceipt = appliedDecisionIds !== "[]";
  const invalidatedDecisions = useRef(new Set<string>());
  const invalidateAppliedDecision = useCallback(
    (decisionId: string) => {
      setCommitted(true);
      setEditingDate(false);
      if (invalidatedDecisions.current.has(decisionId)) return;
      invalidatedDecisions.current.add(decisionId);
      void invalidateAfterPlanMutation(queryClient, { planId });
    },
    [planId, queryClient],
  );
  useEffect(() => {
    if (
      !prepared.isFetchedAfterMount ||
      !messages.isFetchedAfterMount ||
      prepared.isError ||
      messages.isError
    )
      return;
    for (const decisionId of JSON.parse(appliedDecisionIds) as string[])
      invalidateAppliedDecision(decisionId);
  }, [
    appliedDecisionIds,
    invalidateAppliedDecision,
    prepared.isFetchedAfterMount,
    messages.isFetchedAfterMount,
    prepared.isError,
    messages.isError,
  ]);
  const dateMutation = useMutation({
    mutationFn: (startDate: string) =>
      openPlanStartConversation(planId, startDate),
    onSuccess: (next) => {
      setSelected(next);
      void queryClient.invalidateQueries({
        queryKey: aiCoachMessagesQueryKey(next.sid),
      });
    },
  });
  const [date, setDate] = useState<Date>();
  useEffect(() => {
    if (current) setDate(new Date(`${current.startDate}T12:00:00`));
  }, [current]);
  const error = prepared.error ?? dateMutation.error ?? messages.error;
  if (
    prepared.isError ||
    messages.isError ||
    !current ||
    messages.isPending ||
    !prepared.isFetchedAfterMount ||
    !messages.isFetchedAfterMount
  ) {
    return error ? (
      <p role="alert" className="p-4 text-sm text-destructive">
        {t("loadFailed")}
      </p>
    ) : (
      <CoachThreadLoading />
    );
  }
  const earliestStart = new Date(`${current.earliestStartDate}T00:00:00`);
  const showChat =
    !editingDate &&
    (entered ||
      current.evaluationStarted ||
      appliedReceipt ||
      current.plan.status === "ACTIVE");
  const changeDate = (next?: Date) => {
    if (next && next < earliestStart) return;
    setDate(next);
    setEntered(false);
    setEditingDate(true);
    if (!next) return;
    const value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    // Revoke old cards on the server before another evaluation can start.
    dateMutation.mutate(value);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {showChat ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 pb-3 text-sm">
            <span>
              {current.startDate} · {current.calendarTimeZone}
            </span>
            {current.plan.status === "DRAFT" &&
            !committed &&
            !appliedReceipt ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingDate(true)}
              >
                {t("changeDate")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("activePlanConversation")}
              </span>
            )}
          </div>
          <details open={!hasStartProposal} className="shrink-0 px-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t(
                current.plan.status === "ACTIVE" || committed || appliedReceipt
                  ? "activePlanCalendar"
                  : "pendingCalendar",
              )}
            </summary>
            <div className="max-h-64 overflow-y-auto py-3">
              {isRollingPlan(current.plan) ? (
                <>
                  <RollingPlanCoverage plan={current.plan} />
                  {current.plan.startDate ? (
                    <RollingPlanCalendar plan={current.plan} />
                  ) : null}
                </>
              ) : (
                <CoachPlanDraftCalendarPreview
                  draft={savedPlanToCoachDraft(current.plan)}
                  startDate={current.startDate}
                  calendarTimeZone={current.calendarTimeZone}
                  scheduleConstraints={parseScheduleConstraints(
                    current.plan.generationMetadata?.scheduleConstraints,
                  )}
                />
              )}
            </div>
          </details>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CoachRuntimeProvider
              key={current.entryKey}
              sid={current.sid}
              initialMessages={initialMessages}
              variant="embedded"
              enableUrlSeed={false}
              entry={{
                key: current.entryKey,
                resumeExisting: current.evaluationStarted,
                intent: "plan-start",
                branchContext: {
                  branchId: current.branchId,
                  planId,
                  openReason: "plan-start",
                },
                firstMessage: {
                  id: current.entryKey,
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text: t("evaluatePrompt", {
                        date: current.startDate,
                        timeZone: current.calendarTimeZone,
                      }),
                    },
                  ],
                },
              }}
              onTurnFinished={() => {
                void messages.refetch();
              }}
              onPlanApplied={invalidateAppliedDecision}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <CalendarSelect
            date={date}
            fromDate={earliestStart}
            disabled={{ before: earliestStart }}
            fromYear={earliestStart.getFullYear()}
            title={t("dateLabel")}
            placeholder={t("dateLabel")}
            onSelect={dateMutation.isPending ? undefined : changeDate}
          />
          <p className="text-sm text-muted-foreground">{t("dateHint")}</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t("loadFailed")}
            </p>
          ) : null}
          <Button
            disabled={!date || date < earliestStart || dateMutation.isPending}
            onClick={async () => {
              if (!date || date < earliestStart) return;
              const next = await dateMutation
                .mutateAsync(
                  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                )
                .catch(() => null);
              if (!next) return;
              setEditingDate(false);
              setEntered(true);
            }}
          >
            {t("evaluate")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PlanStartConversationDialog({
  open,
  planId,
  onOpenChange,
}: {
  open: boolean;
  planId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PlanStartConversation");
  const titleId = useId();
  const invoker = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open && Boolean(planId)} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={titleId}
        onOpenAutoFocus={() => {
          if (document.activeElement instanceof HTMLElement)
            invoker.current = document.activeElement;
        }}
        className="flex h-[min(840px,94dvh)] w-full pc:w-[calc(100%-2rem)] pc:max-w-4xl flex-col gap-3 overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          invoker.current?.focus();
        }}
      >
        <DialogHeader className="shrink-0 px-4 pt-4 pr-10">
          <DialogTitle id={titleId}>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open && planId ? (
          <PlanCoachDialogBody key={planId} planId={planId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

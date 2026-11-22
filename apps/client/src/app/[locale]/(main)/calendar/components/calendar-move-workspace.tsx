"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { featureAllowed, useFeatureAccess } from "@/api/feature-access";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import {
  aiCoachMessagesQueryKey,
  fetchCoachSessionMessages,
  rejectCoachDecision,
} from "@/api/ai-coach";
import {
  cancelCalendarMove,
  confirmCalendarMove,
  getCalendarMove,
  getPlanWorkoutDetail,
  openCalendarMoveCoach,
  previewCalendarMove,
  type PlanWorkout,
} from "@/api/plans";
import { ApiFetchError } from "@/lib/api-error";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { CoachRuntimeProvider } from "@/app/[locale]/(main)/ai-coach/coach-runtime-provider";
import {
  CoachConversationDialogContent,
  CoachConversationLayout,
  CoachPlanDraftPreviewContext,
  CoachPreviewPanel,
  CoachSchedulePreviewContext,
} from "@/app/[locale]/(main)/ai-coach/coach-preview-panel";
import { CoachDraftCalendar, CoachEditableCalendar } from "@/app/[locale]/(main)/ai-coach/coach-conversation-workspace";
import { CoachReadViewProvider, useCoachReadTabs } from "@/app/[locale]/(main)/ai-coach/coach-read-workspace";
import {
  calendarAdjustmentArtifact,
  calendarArtifactKey,
  calendarDraftKey,
  isReviewableSchedule,
  useCoachCalendarArtifacts,
  useCoachCalendarTabs,
  type CoachCalendarArtifact,
  type CoachScheduleArtifact,
} from "@/app/[locale]/(main)/ai-coach/coach-calendar-artifact";
import { useCoachCalendarMovePreview } from "@/app/[locale]/(main)/ai-coach/coach-calendar-move-recovery-card";
import { coachRowsToUiMessages } from "@/app/[locale]/(main)/ai-coach/coach-rows-to-ui-messages";
import {
  useCoachActions,
  useCoachThread,
} from "@/app/[locale]/(main)/ai-coach/coach-chat-provider";
import {
  PlanCalendarMoveState,
  type PlanCalendarCoachSession,
  type PlanCalendarMovePreview,
} from "@shared/plan-proposal";
import { canMoveCalendarWorkout } from "./calendar-move-model";
import { canDropCalendarWorkout } from "./calendar-workout-drop";
import { CalendarMoveDatePicker } from "./calendar-move-date-picker";
import { CalendarMoveWeekComparison } from "./calendar-move-week-comparison";

type MoveId = { planId: string; previewId: string };
type SavedMove = MoveId & { coach: boolean };
type CoachState = {
  running: boolean;
  confirming: boolean;
  review: "pending" | "completed" | "awaiting-input" | "unavailable";
  stop: () => Promise<void>;
  append: ReturnType<typeof useCoachActions>["append"];
};
type Review = { planId: string; preview: PlanCalendarMovePreview };
type MoveRequest = { workout: PlanWorkout; targetDate?: string };

export type CalendarMoveWorkspaceHandle = {
  request: (
    workout: PlanWorkout,
    date?: string,
    trigger?: HTMLElement | null,
  ) => void;
};

function CalendarCoachBridge({
  planId,
  onArtifacts,
  onState,
}: {
  planId: string;
  onArtifacts: (artifacts: CoachCalendarArtifact[]) => void;
  onState: (state: CoachState) => void;
}) {
  const { stop, append } = useCoachActions();
  const running = useCoachThread((state) => state.isRunning);
  const review = useCoachThread((state): CoachState["review"] => {
    if (state.isRunning) return "pending";
    if (state.status === "error") return "unavailable";
    const reply = state.messages.findLast((message) => message.role === "assistant");
    if (!reply) return "pending";
    const run = reply.ui.parts.findLast((part) => part.type === "data-coach-run");
    if (!run || run.data.status === "completed") return "completed";
    if (run.data.status === "awaiting_input") return "awaiting-input";
    return "unavailable";
  });
  const confirming = useCoachThread((state) =>
    Boolean(
      state.messages
        .findLast((message) => message.role === "user")
        ?.ui.parts.some(
          (part) =>
            part.type === "data-coach-user-tool-result" &&
            (part.data.content as { kind?: string } | null)?.kind ===
              "coach_decision_confirmation",
        ),
    ),
  );
  const artifacts = useCoachCalendarArtifacts(planId);
  useEffect(() => onArtifacts(artifacts), [artifacts, onArtifacts]);
  useEffect(
    () => onState({ running, confirming: running && confirming, review, stop, append }),
    [append, confirming, onState, review, running, stop],
  );
  return null;
}

export function CalendarMoveWorkspace({
  workspaceRef,
  showResume = true,
}: {
  workspaceRef: Ref<CalendarMoveWorkspaceHandle>;
  showResume?: boolean;
}) {
  const t = useTranslations("CalendarMove");
  const td = useTranslations("AiCoachPage.decision");
  const titleId = useId();
  const queryClient = useQueryClient();
  const { data: viewer } = useViewerSession();
  const storageKey = viewer?.user?.id
    ? `trainingload:calendar-move:${viewer.user.id}`
    : undefined;
  const access = useFeatureAccess();
  const hasCoach = featureAllowed(access.data, "ai.planAdvice");
  const [open, setOpen] = useState(false);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const { workout, targetDate: requestedDate } = moveRequest ?? {};
  const [review, setReview] = useState<Review | null>(null);
  const [saved, setSaved] = useState<SavedMove | null>(null);
  const [session, setSession] = useState<PlanCalendarCoachSession | null>(null);
  const [reviewInBackground, setReviewInBackground] = useState(false);
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const [artifacts, setArtifacts] = useState<CoachCalendarArtifact[]>([]);
  const [cancelledDecisionIds, setCancelledDecisionIds] = useState<string[]>(
    [],
  );
  const [appliedDecisionId, setAppliedDecisionId] = useState<string | null>(
    null,
  );
  const { data: currentMove } = useCoachCalendarMovePreview(session?.sid);
  const adjustment = calendarAdjustmentArtifact(currentMove);
  const closeEditor = useRef<() => void>(null);
  const workspace = useCoachCalendarTabs(
    adjustment ? [...artifacts, adjustment] : artifacts,
    appliedDecisionId
      ? [...cancelledDecisionIds, appliedDecisionId]
      : cancelledDecisionIds,
  );
  const read = useCoachReadTabs(session?.sid, workspace);
  const activeCalendarKey = workspace.active ? calendarArtifactKey(workspace.active) : undefined;
  const activeKey = read.activeId ?? activeCalendarKey;
  const [coachState, setCoachState] = useState<CoachState | null>(null);
  const [busy, setBusy] = useState<
    "preview" | "coach" | "confirm" | "refresh" | "close" | "reject" | "edit" | null
  >(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const invoker = useRef<HTMLElement | null>(null);
  const closePromptInvoker = useRef<HTMLElement | null>(null);
  const savedRef = useRef<SavedMove | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    let move: SavedMove | null = null;
    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey) ?? "null",
      ) as SavedMove | null;
      if (
        typeof stored?.planId === "string" &&
        typeof stored.previewId === "string"
      )
        move = stored;
    } catch {
      /* A damaged saved reference can be replaced by the next edit. */
    }
    savedRef.current = move;
    setSaved(move);
  }, [storageKey]);
  const remember = useCallback(
    (move: SavedMove | null) => {
      savedRef.current = move;
      setSaved(move);
      if (!storageKey) return;
      try {
        if (move) localStorage.setItem(storageKey, JSON.stringify(move));
        else localStorage.removeItem(storageKey);
      } catch {
        /* The current page can still retain the saved reference. */
      }
    },
    [storageKey],
  );

  const prepare = async (course: PlanWorkout, date: string) => {
    if (
      !canMoveCalendarWorkout(course) ||
      !canDropCalendarWorkout(course, date)
    )
      return;
    setMoveRequest({ workout: course, targetDate: date });
    setBusy("preview");
    setError(null);
    try {
      const preview = await previewCalendarMove(course.planId, course.id, {
        targetDate: date,
        expectedRevision: course.revision,
      });
      if (!preview) throw new Error("Missing calendar move preview");
      setReview({ planId: course.planId, preview });
    } catch {
      setError(t("previewFailed"));
    } finally {
      setBusy(null);
    }
  };

  useImperativeHandle(workspaceRef, () => ({
    request(course, date, trigger) {
      if (
        busy ||
        session ||
        !canMoveCalendarWorkout(course) ||
        (date !== undefined &&
          !canDropCalendarWorkout(course, date))
      )
        return;
      invoker.current =
        trigger ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      setReview(null);
      setError(null);
      setConfirmConflict(false);
      setOpen(true);
      if (date) void prepare(course, date);
      else setMoveRequest({ workout: course });
    },
  }));

  const startCoach = async ({ planId, previewId }: MoveId, background = false) => {
    setBusy("coach");
    setError(null);
    try {
      const next = await openCalendarMoveCoach(planId, previewId, background);
      if (!next) throw new Error("Missing calendar coaching session");
      setSession(next);
      workspace.setMobileView("conversation");
      return true;
    } catch {
      setError(t("coachFailed"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const clearEditor = useCallback(() => {
    setOpen(false);
    setClosing(false);
    setReview(null);
    setConfirmConflict(false);
    setSession(null);
    setReviewInBackground(false);
    setCoachState(null);
    setArtifacts([]);
    setCancelledDecisionIds([]);
    setAppliedDecisionId(null);
    setMoveRequest(null);
  }, []);
  const finish = useCallback(
    async (id: MoveId) => {
      await invalidateAfterPlanMutation(queryClient, { planId: id.planId });
      if (savedRef.current?.previewId === id.previewId) remember(null);
      clearEditor();
    },
    [clearEditor, queryClient, remember],
  );

  useEffect(() => {
    if (open || !session || !coachState || coachState.running) return;
    let active = true;
    void getCalendarMove(session.planId, session.previewId)
      .then((current) => {
        if (active && current?.state === PlanCalendarMoveState.Applied) return finish(session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) clearEditor();
      });
    return () => {
      active = false;
    };
  }, [clearEditor, coachState, finish, open, session]);

  const resume = async () => {
    if (!saved) return;
    invoker.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setBusy("preview");
    setOpen(true);
    setError(null);
    try {
      const preview = await getCalendarMove(saved.planId, saved.previewId);
      if (!preview) throw new Error("Missing saved calendar move");
      if (preview.state === PlanCalendarMoveState.Applied) {
        await finish(saved);
        return;
      }
      if (preview.state === PlanCalendarMoveState.Cancelled) {
        remember(null);
        clearEditor();
        return;
      }
      setReview({ planId: saved.planId, preview });
      if (saved.coach && hasCoach) await startCoach(saved);
    } catch {
      setError(t("previewFailed"));
    } finally {
      setBusy(null);
    }
  };

  const moveId = review
    ? { planId: review.planId, previewId: review.preview.previewId }
    : null;
  const close = async (keep: boolean) => {
    if (moveId && (busy === "confirm" || coachState?.confirming)) {
      remember({ ...moveId, coach: Boolean(session) });
      setOpen(false);
      return;
    }
    if (busy) return;
    setBusy("close");
    try {
      if (coachState?.running) await coachState.stop();
      if (moveId && keep) {
        remember({ ...moveId, coach: Boolean(session) });
      } else if (moveId) {
        const cancelled = await cancelCalendarMove(
          moveId.planId,
          moveId.previewId,
        );
        if (cancelled?.state === PlanCalendarMoveState.Applied) await finish(moveId);
        if (savedRef.current?.previewId === moveId.previewId) remember(null);
      }
      clearEditor();
    } catch {
      setError(t("closeFailed"));
    } finally {
      setBusy(null);
    }
  };
  const requestClose = () => {
    if (reviewInBackground || busy === "coach") return;
    if (appliedDecisionId && moveId) void finish(moveId);
    else if (busy === "confirm" || coachState?.confirming) void close(true);
    else if (session) {
      closePromptInvoker.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setError(null);
      setClosing(true);
    } else void close(false);
  };
  const confirm = useCallback(async (moveId: MoveId) => {
    setBusy("confirm");
    setError(null);
    try {
      const receipt = await confirmCalendarMove(
        moveId.planId,
        moveId.previewId,
      );
      if (!receipt?.readbackVerified)
        throw new Error("Missing calendar move confirmation");
      await finish(moveId);
    } catch (failure) {
      if (savedRef.current?.previewId === moveId.previewId) {
        setOpen(true);
      }
      if (failure instanceof ApiFetchError && failure.status === 409) {
        setConfirmConflict(true);
        setError(t("recovery.stalePreview"));
      } else {
        setError(t("recovery.confirmFailed"));
      }
    } finally {
      setBusy(null);
    }
  }, [finish, t]);

  const confirmMove = async () => {
    if (!moveId || !review || busy || reviewInBackground) return;
    if (hasCoach) {
      setReviewInBackground(true);
      if (await startCoach(moveId, true)) return;
      setReviewInBackground(false);
    }
    if (!review.preview.requiresCoachConfirmation) await confirm(moveId);
  };

  const reloadMoveReview = async () => {
    if (!moveId || !review || busy) return;
    setBusy("refresh");
    setError(null);
    const { workoutId, to } = review.preview.impact;
    try {
      const current = await getCalendarMove(moveId.planId, moveId.previewId);
      if (current?.state === PlanCalendarMoveState.Applied && current.receipt?.readbackVerified) {
        await finish(moveId);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["scheduled-workouts"] });
      const latest = await getPlanWorkoutDetail(moveId.planId, workoutId, { suppressErrorToast: true });
      if (latest?.scheduledDate === to) {
        await finish(moveId);
        return;
      }
      if (!canDropCalendarWorkout(latest, to)) {
        setReview({ ...review, preview: { ...review.preview, state: PlanCalendarMoveState.Invalidated } });
        setConfirmConflict(false);
        return;
      }
      const preview = await previewCalendarMove(latest.planId, latest.id, {
        targetDate: to,
        expectedRevision: latest.revision,
      });
      if (!preview) throw new Error("Missing refreshed calendar move preview");
      setMoveRequest({ workout: latest, targetDate: to });
      setReview({ planId: latest.planId, preview });
      setConfirmConflict(false);
      if (savedRef.current?.previewId === moveId.previewId) {
        remember({ planId: latest.planId, previewId: preview.previewId, coach: false });
      }
    } catch (failure) {
      if (failure instanceof ApiFetchError && failure.status === 404) {
        setReview({ ...review, preview: { ...review.preview, state: PlanCalendarMoveState.Invalidated } });
        setConfirmConflict(false);
      } else {
        setError(t("recovery.failed"));
      }
    } finally {
      setBusy(null);
    }
  };

  const history = useQuery({
    queryKey: aiCoachMessagesQueryKey(session?.sid ?? ""),
    queryFn: () => fetchCoachSessionMessages(session!.sid),
    enabled: Boolean(session),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const initialMessages = useMemo(
    () => coachRowsToUiMessages(history.data ?? []),
    [history.data],
  );
  const impact = review?.preview.impact;
  const moveDates =
    impact ??
    (workout?.scheduledDate && requestedDate
      ? { from: workout.scheduledDate, to: requestedDate }
      : null);
  const latestSchedule = artifacts.findLast(
    (artifact): artifact is CoachScheduleArtifact =>
      artifact.kind === "schedule-calendar" && isReviewableSchedule(artifact.state),
  );
  useEffect(() => {
    if (!reviewInBackground || !session || !review ||
        (!history.isError && (!coachState || coachState.review === "pending"))) return;
    setReviewInBackground(false);
    if (!history.isError && (coachState?.review === "awaiting-input" ||
        (latestSchedule && latestSchedule.presentation.calendarMoveOnly !== true))) {
      void openCalendarMoveCoach(session.planId, session.previewId).catch(() => undefined);
      return;
    }
    setSession(null);
    setCoachState(null);
    setArtifacts([]);
    if (review.preview.requiresCoachConfirmation) {
      setError(t("coachFailed"));
      return;
    }
    void confirm(session);
  }, [coachState, confirm, history.isError, latestSchedule, review, reviewInBackground, session, t]);
  const pending =
    workspace.active?.kind === "schedule-calendar" &&
    workspace.active.id === latestSchedule?.id
      ? workspace.active
      : null;
  const reviewAvailable = Boolean(
    pending && coachState && !coachState.running && !busy,
  );
  const previewContext = {
    open: (id: string) => workspace.openFromCard("schedule-calendar", id),
    isEditingAdjustment: workspace.isEditingAdjustment,
    openAdjustment: (id: string) => workspace.openFromCard("calendar-adjustment", id),
    openPublishedCalendar: (id: string) => workspace.openFromCard("published-calendar", id),
    cancelledDecisionId: cancelledDecisionIds.at(-1) ?? null,
    initialMove: impact,
    confirmInPreview: true,
    editingAdjustmentId: adjustment && workspace.drafts[adjustment.id] ? adjustment.id : undefined,
  };
  const rejectDraft = async (decisionId: string, reason: string) => {
    await rejectCoachDecision(decisionId, reason);
    setCancelledDecisionIds((current) => [...current, decisionId]);
    if (session) {
      void queryClient.invalidateQueries({
        queryKey: aiCoachMessagesQueryKey(session.sid),
      });
    }
  };
  const cancelPlanAdjustment = async () => {
    if (!reviewAvailable || !pending) return;
    setBusy("reject");
    setError(null);
    try {
      await rejectDraft(pending.id, "user_cancelled_plan_proposal");
    } catch {
      setError(td("rejectFailed"));
    } finally {
      setBusy(null);
    }
  };
  const confirmPlanAdjustment = async () => {
    if (!reviewAvailable || !pending || !coachState) return;
    setBusy("confirm");
    setError(null);
    try {
      await coachState.append({
        role: "user",
        content: [
          { type: "text", text: td("confirmPrompt") },
          {
            type: "data",
            name: "coach-user-tool-result",
            data: {
              toolUseId: pending.assistantId,
              content: {
                kind: "coach_decision_confirmation",
                repliesToAssistantMessageId: pending.assistantId,
                decisionId: pending.id,
              },
            },
          },
        ],
      });
    } catch {
      setError(t("confirmFailed"));
    } finally {
      setBusy(null);
    }
  };
  const restoreFocus = (event: Event) => {
    if (invoker.current?.isConnected) {
      event.preventDefault();
      invoker.current.focus();
    }
  };
  return (
    <CoachReadViewProvider read={read}>
    <CoachSchedulePreviewContext.Provider value={previewContext}>
      <CoachPlanDraftPreviewContext.Provider
        value={(id) => workspace.openFromCard("plan-draft-calendar", id)}
      >
        {showResume && saved && !session && !open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute bottom-3 right-3 z-30 shadow-sm"
            onClick={() => void resume()}
          >
            {t("resume")}
          </Button>
        ) : null}
        {session && history.isFetched && !history.isError ? (
          <CoachRuntimeProvider
            key={session.sid}
            sid={session.sid}
            initialMessages={initialMessages}
            variant="embedded"
            enableUrlSeed={false}
            threadContainer={mount}
            entry={{
              key: session.sid,
              intent: "plan-followup",
              branchContext: {
                planId: session.planId,
                branchId: session.branchId,
                openReason: "calendar-move",
              },
              resumeExisting: initialMessages.length > 0,
              firstMessage: {
                id: session.sid,
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: t("coachPrompt", {
                      from: session.impact.from,
                      to: session.impact.to,
                    }),
                  },
                ],
              },
            }}
            onPlanApplied={(id) => {
              if (
                !workspace.tabs.some(
                  (artifact) =>
                    artifact.kind === "plan-draft-calendar" ||
                    artifact.id !== id,
                )
              ) {
                void finish(session);
                return;
              }
              setAppliedDecisionId(id);
              if (savedRef.current?.previewId === session.previewId)
                remember(null);
              void invalidateAfterPlanMutation(queryClient, {
                planId: session.planId,
              });
            }}
          >
            <CalendarCoachBridge
              planId={session.planId}
              onArtifacts={setArtifacts}
              onState={setCoachState}
            />
          </CoachRuntimeProvider>
        ) : null}
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next) requestClose();
          }}
        >
          {session && !reviewInBackground ? (
            <CoachConversationDialogContent onCloseAutoFocus={restoreFocus}>
              {error && !closing ? (
                <p role="alert" className="px-4 pt-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <AlertDialog
                open={closing}
                onOpenChange={(next) => {
                  if (busy !== "close") setClosing(next);
                }}
              >
                <AlertDialogContent
                  onCloseAutoFocus={(event) => {
                    if (!open || !closePromptInvoker.current?.isConnected)
                      return;
                    event.preventDefault();
                    closePromptInvoker.current.focus();
                  }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("closeQuestion")}</AlertDialogTitle>
                    <AlertDialogDescription
                      className={coachState?.running ? undefined : "sr-only"}
                    >
                      {coachState?.running
                        ? t("stopBeforeClose")
                        : t("moving", {
                            from: session.impact.from,
                            to: session.impact.to,
                          })}
                    </AlertDialogDescription>
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy === "close"}>
                      {t("continueEditing")}
                    </AlertDialogCancel>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void close(false)}
                      disabled={Boolean(busy)}
                    >
                      {t("discard")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void close(true)}
                      disabled={Boolean(busy)}
                    >
                      {t("later")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <CoachConversationLayout
                conversationRef={workspace.conversationRef}
                mobileView={workspace.mobileView}
                onMobileViewChange={workspace.setMobileView}
                previewLabel={read.activeLabel}
                conversation={
                  <>
                    {history.isError ? (
                      <Button
                        className="m-3 self-start"
                        variant="outline"
                        onClick={() => void history.refetch()}
                      >
                        {t("retry")}
                      </Button>
                    ) : null}
                    <div
                      ref={setMount}
                      className="flex min-h-0 flex-1 flex-col"
                    />
                  </>
                }
                preview={
                  workspace.visible && activeKey ? (
                    <CoachPreviewPanel
                      onClose={() => !read.activeId && closeEditor.current ? closeEditor.current() : read.close()}
                      onTabClose={workspace.closeTab}
                      tabOrder={workspace.openedIds}
                      value={activeKey}
                      onValueChange={workspace.setSelection}
                      tabs={[...workspace.tabs.map((artifact) => {
                        const key = calendarArtifactKey(artifact);
                        if (artifact.kind === "published-calendar")
                          return {
                            id: key,
                            kind: artifact.kind,
                            label: artifact.title,
                            content: (
                              <CoachEditableCalendar
                                artifact={artifact}
                                closeRef={!read.activeId && key === activeCalendarKey ? closeEditor : undefined}
                                onClose={workspace.close}
                                draft={workspace.drafts[calendarDraftKey(artifact)] ?? null}
                                onDraftChange={(update) => workspace.updateDraft(calendarDraftKey(artifact), update)}
                              />
                            ),
                          };
                        const isDraft = artifact.kind === "plan-draft-calendar";
                        const label = isDraft
                          ? artifact.draft.title
                          : artifact.presentation.title;
                        if (isDraft)
                          return {
                            id: key,
                            kind: artifact.kind,
                            label,
                            content: <CoachDraftCalendar artifact={artifact} />,
                          };
                        if (artifact.kind === "calendar-adjustment")
                          return {
                            id: key,
                            kind: artifact.kind,
                            label,
                            content: (
                              <CoachEditableCalendar
                                artifact={artifact}
                                closeRef={!read.activeId && key === activeCalendarKey ? closeEditor : undefined}
                                onClose={workspace.close}
                                draft={workspace.drafts[calendarDraftKey(artifact)] ?? null}
                                onDraftChange={(update) => workspace.updateDraft(calendarDraftKey(artifact), update)}
                              />
                            ),
                          };
                        return {
                          id: key,
                          kind: artifact.kind,
                          label,
                          content: (
                            <CoachEditableCalendar
                              artifact={artifact}
                              closeRef={!read.activeId && key === activeCalendarKey ? closeEditor : undefined}
                              onClose={workspace.close}
                              draft={workspace.drafts[calendarDraftKey(artifact)] ?? null}
                              onDraftChange={(update) => workspace.updateDraft(calendarDraftKey(artifact), update)}
                              legacyActions={(
                              <div className="absolute inset-x-0 bottom-1 z-10 mx-auto flex w-fit gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    !reviewAvailable ||
                                    pending?.id !== artifact.id
                                  }
                                  onClick={() => void cancelPlanAdjustment()}
                                >
                                  {t("cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={
                                    !reviewAvailable ||
                                    pending?.id !== artifact.id
                                  }
                                  onClick={() => void confirmPlanAdjustment()}
                                >
                                  {t("confirmAdjustment")}
                                </Button>
                              </div>
                              )}
                            />
                          ),
                        };
                      }), ...read.tabs]}
                    />
                  ) : null
                }
              />
            </CoachConversationDialogContent>
          ) : (
            <DialogContent
              aria-labelledby={titleId}
              className={cn(
                "bg-background",
                workout && !requestedDate && "md:mx-auto md:max-w-[34rem] pc:right-auto pc:max-w-[34rem]",
              )}
              onCloseAutoFocus={restoreFocus}
            >
              <header className="space-y-1 pr-9">
                <DialogTitle id={titleId}>{t("title")}</DialogTitle>
                <DialogDescription>
                  {moveDates
                    ? t("moving", { from: moveDates.from, to: moveDates.to })
                    : t("chooseDate")}
                </DialogDescription>
              </header>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {impact ? (
                <div className="flex flex-col gap-3">
                  <CalendarMoveWeekComparison impact={impact} />
                  {impact.reasons.length ? (
                    <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                      <p className="font-medium">{t("affectsTraining")}</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {impact.reasons.map((reason) => (
                          <li key={reason}>{t(`reason.${reason}`)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {review?.preview.state === PlanCalendarMoveState.Expired ? (
                    <p role="status" className="text-sm">
                      {t("expired")}
                    </p>
                  ) : null}
                  {review?.preview.state === PlanCalendarMoveState.Invalidated ? (
                    <p role="status" className="text-sm">{t("recovery.scheduleChanged")}</p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void close(false)}
                      disabled={Boolean(busy) || reviewInBackground}
                    >
                      {t("cancel")}
                    </Button>
                    {confirmConflict || review?.preview.state === PlanCalendarMoveState.Expired ? (
                      <Button
                        type="button"
                        onClick={() => void reloadMoveReview()}
                        disabled={Boolean(busy)}
                        aria-busy={busy === "refresh"}
                      >
                        {busy === "refresh" ? (
                          <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                        ) : null}
                        {t(busy === "refresh" ? "refreshingSchedule" : "recovery.action")}
                      </Button>
                    ) : null}
                    {!confirmConflict && review?.preview.state === PlanCalendarMoveState.Pending &&
                    (hasCoach || !review.preview.requiresCoachConfirmation) ? (
                      <Button
                        type="button"
                        onClick={() => void confirmMove()}
                        disabled={Boolean(busy) || reviewInBackground || access.isLoading}
                        aria-busy={busy === "confirm" || reviewInBackground}
                      >
                        {busy === "confirm" || reviewInBackground ? (
                          <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                        ) : null}
                        {t(reviewInBackground ? "openingCoach" : busy === "confirm" ? "savingMove" : "moveOnly")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : workout?.scheduledDate && !requestedDate ? (
                <CalendarMoveDatePicker
                  scheduledDate={workout.scheduledDate}
                  targetWindow={workout.calendarMoveWindow}
                  pending={Boolean(busy)}
                  onSelect={(date) => void prepare(workout, date)}
                />
              ) : workout && requestedDate && error && !busy ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void close(false)}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void prepare(workout, requestedDate)}
                  >
                    {t("retry")}
                  </Button>
                </div>
              ) : null}
              {busy === "preview" || busy === "close" ? (
                <div
                  className="flex items-center gap-2 py-1 text-sm text-muted-foreground"
                  role="status"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("working")}
                </div>
              ) : null}
            </DialogContent>
          )}
        </Dialog>
      </CoachPlanDraftPreviewContext.Provider>
    </CoachSchedulePreviewContext.Provider>
    </CoachReadViewProvider>
  );
}

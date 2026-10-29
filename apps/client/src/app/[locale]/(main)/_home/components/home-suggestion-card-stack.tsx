"use client";

import { Bell, CalendarDays, Loader2, MessageCircle } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  confirmAndApplyCoachDecision,
  dismissCoachAssessmentCase,
  fetchCoachHomeReviewState,
  openCoachAssessmentCase,
  rejectCoachDecision,
  type CoachReviewGuidance,
  type PendingCoachDecision,
} from "@/api/ai-coach";
import type { CoachAssessmentInquiry } from "@shared/coach-assessment";
import { buildCoachHomeStackItems } from "@shared/coach-home-card-stack";
import {
  coachCycleStartHref,
  isCoachApplyNotAppliedError,
  isOpenNextCoachDecision,
} from "@shared/coach-adjustment-decision";
import { useRouter } from "@/i18n/navigation";
import type { V2HomeTodayAdvice } from "@/api/v2-home";
import { AccessGuardedLink } from "@deployment/managed-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { queryKeys } from "@/lib/query-keys";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { HomeAccessExtension } from "@deployment/managed-ui";
import { HomeSuggestionDeck } from "./home-suggestion-deck";
import {
  createTodaySuggestionWorkout,
  recordTodaySuggestionInteraction,
  scheduleTodaySuggestionReminder,
  type AiTodaySuggestionResponse,
} from "@/api/ai-today-suggestion";
import {
  isTodaySuggestionWorkout,
  type TodaySuggestionIntent,
} from "@shared/ai-today-suggestion-contract";
import { Input } from "@/components/ui/input";
import { ApiFetchError } from "@/lib/api";
import { PlanWorkoutListRow } from "@/components/plan/plan-workout-list-row";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { storeTodaySuggestionCoachContext } from "@/lib/today-suggestion-coach-context";

type SuggestionCard = {
  title: string;
  date: string;
  weekday: string;
  summary: string;
  tags: string[];
  weatherAttribution: V2HomeTodayAdvice["weatherAttribution"] | null;
  details?: AiTodaySuggestionResponse | null;
};

function localDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultReminderLocalValue() {
  return localDateTimeInput(new Date(Date.now() + 60 * 60_000));
}

type OpenCard =
  | { kind: "suggestion" }
  | { kind: "inquiry"; inquiry: CoachAssessmentInquiry }
  | { kind: "guidance"; guidance: CoachReviewGuidance }
  | { kind: "decision"; decision: PendingCoachDecision };

function isUsableTodaySuggestionIntent(
  intent: TodaySuggestionIntent | null | undefined,
): intent is TodaySuggestionIntent {
  if (!intent) return false;
  return (
    intent.type !== "CREATE_TODAY_WORKOUT" ||
    isTodaySuggestionWorkout(intent.preview)
  );
}

export function HomeSuggestionCardStack({
  suggestion,
  suggestionLeadingActions,
  suggestionPreviewLeading,
}: {
  suggestion: SuggestionCard;
  suggestionLeadingActions?: ReactNode;
  suggestionPreviewLeading?: ReactNode;
}) {
  const t = useTranslations("V2HomePage");
  const router = useRouter();
  const queryClient = useQueryClient();
  const publicDemo = usePublicDemo();
  const region = useRef<HTMLDivElement>(null);
  const presented = useRef(new Set<string>());
  const { data: reviewState } = useQuery({
    queryKey: queryKeys.ai.pendingDecisions(),
    queryFn: fetchCoachHomeReviewState,
    enabled: !publicDemo.active,
  });
  const pending = reviewState?.decisions ?? [];
  const guidance = reviewState?.guidance ?? null;
  const inquiry = reviewState?.inquiry ?? null;
  const items = useMemo(
    () => buildCoachHomeStackItems(pending, undefined, guidance, inquiry),
    [guidance, inquiry, pending],
  );
  const [opened, setOpened] = useState<OpenCard>({ kind: "suggestion" });
  const [open, setOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [workoutPreviewOpen, setWorkoutPreviewOpen] = useState(false);
  const [reminderAt, setReminderAt] = useState(defaultReminderLocalValue);
  const details = suggestion.details ?? null;
  const availableIntents = [
    details?.primaryIntent,
    ...(details?.secondaryIntents ?? []),
  ].filter(isUsableTodaySuggestionIntent);
  const primaryIntent = availableIntents[0] ?? null;
  const secondaryIntents = availableIntents.slice(1);
  const workoutIntent = availableIntents.find(
    (
      intent,
    ): intent is Extract<
      TodaySuggestionIntent,
      { type: "CREATE_TODAY_WORKOUT" }
    > => intent?.type === "CREATE_TODAY_WORKOUT",
  );
  const evidenceLabels =
    details?.evidence
      .map((evidence) => evidence.label.trim())
      .filter(Boolean)
      .slice(0, 3) ?? [];
  const reasoningDetails = [
    ...(details?.recommendation.details ?? []),
    ...(details?.uncertainty ? [details.uncertainty] : []),
  ]
    .map((line) => line.trim())
    .filter(Boolean);
  const quickIntent = availableIntents.find(
    (intent) => intent.type !== "ASK_COACH",
  );
  const workoutMeta = workoutIntent
    ? (() => {
        const preview = workoutIntent.preview;
        const sportKey =
          preview.sportDefinitionCode === "STRENGTH_TRAINING"
            ? "strength"
            : ["RUN", "CYCLING", "SWIM"].includes(preview.sportType)
              ? preview.sportType.toLowerCase()
              : "other";
        const durationMinutes = preview.summary.durationSeconds
          ? Math.round(preview.summary.durationSeconds / 60)
          : null;
        return [
          t(`todaySuggestionActions.sport.${sportKey}`),
          durationMinutes
            ? t("todaySuggestionActions.durationMinutes", {
                minutes: durationMinutes,
              })
            : null,
          details?.recommendation.intensity
            ? t(
                `todaySuggestionActions.intensity.${details.recommendation.intensity.toLowerCase()}`,
              )
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
      })()
    : null;
  const applyMutation = useMutation({
    mutationFn: (decision: PendingCoachDecision) =>
      confirmAndApplyCoachDecision(decision.id),
    onSuccess: async (_, decision) => {
      setOpen(false);
      toast.success(
        t(
          isOpenNextCoachDecision(decision)
            ? "decisionStack.startNextSuccess"
            : "decisionStack.applySuccess",
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.ai.pendingDecisions(),
        }),
        invalidateAfterPlanMutation(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() }),
      ]);
      if (isOpenNextCoachDecision(decision))
        router.push(coachCycleStartHref(decision));
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (decisionId: string) => rejectCoachDecision(decisionId),
    onSuccess: async () => {
      setOpen(false);
      toast.success(t("decisionStack.rejectSuccess"));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ai.pendingDecisions(),
      });
    },
  });
  const openInquiryMutation = useMutation({
    mutationFn: openCoachAssessmentCase,
    onSuccess: (result, caseId) => {
      setOpen(false);
      const params = new URLSearchParams({
        sid: result.sessionId,
        caseId,
        openReason: "athlete_state_assessment",
      });
      if (result.branchId) params.set("branchId", result.branchId);
      if (result.contextId) params.set("contextId", result.contextId);
      if (result.planId) params.set("planId", result.planId);
      router.push(`/ai-coach?${params.toString()}`);
    },
  });
  const dismissInquiryMutation = useMutation({
    mutationFn: dismissCoachAssessmentCase,
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ai.pendingDecisions(),
      });
    },
  });
  const workoutMutation = useMutation({
    mutationFn: (generationToken: string) =>
      createTodaySuggestionWorkout(generationToken),
    onSuccess: async (result) => {
      if (!result) {
        toast.error(t("todaySuggestionActions.workoutFailed"));
        return;
      }
      if (details) {
        await recordTodaySuggestionInteraction(details.suggestionId, {
          kind: "INTENT_SELECTED",
          intentType: "CREATE_TODAY_WORKOUT",
        }).catch(() => undefined);
      }
      setOpen(false);
      setWorkoutPreviewOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() }),
        queryClient.invalidateQueries({ queryKey: ["v2-home-today-advice"] }),
      ]);
      router.push(
        `/day/${encodeURIComponent(result.intent.scheduledDate)}?workout=${encodeURIComponent(result.workoutId)}`,
      );
    },
    onError: async (error) => {
      if (!(error instanceof ApiFetchError)) {
        toast.error(t("todaySuggestionActions.workoutFailed"));
        return;
      }
      if (
        error.errorCode === "TODAY_SUGGESTION_FACTS_CHANGED" ||
        error.errorCode === "TODAY_SUGGESTION_PROPOSAL_INVALID"
      ) {
        setOpen(false);
        setWorkoutPreviewOpen(false);
        toast.info(t("todaySuggestionActions.suggestionChanged"));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() }),
          queryClient.invalidateQueries({
            queryKey: ["v2-home-today-advice"],
          }),
        ]);
        return;
      }
      if (error.errorCode === "TODAY_SUGGESTION_TRAINING_WINDOW_CLOSED") {
        setOpen(false);
        toast.info(t("todaySuggestionActions.trainingWindowClosed"));
        return;
      }
      if (error.errorCode === "TODAY_WORKOUT_ALREADY_EXISTS") {
        setOpen(false);
        toast.info(t("todaySuggestionActions.workoutAlreadyExists"));
        await queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() });
        return;
      }
      toast.error(t("todaySuggestionActions.workoutFailed"));
    },
  });
  const reminderMutation = useMutation({
    mutationFn: async () => {
      if (!details) throw new Error("TODAY_SUGGESTION_UNAVAILABLE");
      const remindAt = new Date(reminderAt);
      if (Number.isNaN(remindAt.getTime())) {
        throw new Error("TODAY_SUGGESTION_REMINDER_TIME_INVALID");
      }
      return scheduleTodaySuggestionReminder(
        details.suggestionId,
        remindAt.toISOString(),
      );
    },
    onSuccess: async () => {
      if (details) {
        await recordTodaySuggestionInteraction(details.suggestionId, {
          kind: "INTENT_SELECTED",
          intentType: "SCHEDULE_REMINDER",
        }).catch(() => undefined);
      }
      setReminderOpen(false);
      toast.success(t("todaySuggestionActions.reminderScheduled"));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.root.notifications,
      });
    },
    onError: () => toast.error(t("todaySuggestionActions.reminderFailed")),
  });
  const busy =
    applyMutation.isPending ||
    rejectMutation.isPending ||
    openInquiryMutation.isPending ||
    dismissInquiryMutation.isPending ||
    workoutMutation.isPending ||
    reminderMutation.isPending;
  const error =
    applyMutation.error ??
    rejectMutation.error ??
    openInquiryMutation.error ??
    dismissInquiryMutation.error ??
    workoutMutation.error ??
    reminderMutation.error;

  const recordPresented = useCallback(
    (frontId: string | null) => {
      if (
        frontId !== "suggestion" ||
        !details ||
        publicDemo.active ||
        presented.current.has(details.suggestionId)
      ) {
        return;
      }
      presented.current.add(details.suggestionId);
      void recordTodaySuggestionInteraction(details.suggestionId, {
        kind: "PRESENTED",
      }).catch(() => {
        presented.current.delete(details.suggestionId);
      });
    },
    [details, publicDemo.active],
  );
  const navigateToTodaySuggestionCoach = () => {
    if (!details || publicDemo.active) return;
    storeTodaySuggestionCoachContext({
      suggestionId: details.suggestionId,
      date: suggestion.date,
      weekday: suggestion.weekday,
      headline: details.headline,
      summary: details.summary,
      recommendation: details.recommendation,
      confidence: details.confidence,
      uncertainty: details.uncertainty,
      evidence: details.evidence,
      primaryIntent,
      secondaryIntents,
      validUntil: details.validUntil,
    });
    const params = new URLSearchParams({
      intent: "today-suggestion",
      source: "home-today-suggestion",
      openReason: "today_suggestion",
      todaySuggestionId: details.suggestionId,
      prompt: t("todaySuggestionActions.coachPrompt"),
    });
    const coachIntent = availableIntents.find(
      (intent) => intent.type === "ASK_COACH",
    );
    if (coachIntent?.type === "ASK_COACH") {
      params.set("starterCode", coachIntent.starterCode);
    }
    router.push(`/ai-coach?${params.toString()}`);
  };
  const handleIntent = async (intent: TodaySuggestionIntent) => {
    if (!details || publicDemo.active) return;
    if (intent.type === "CREATE_TODAY_WORKOUT") {
      workoutMutation.mutate(details.suggestionId);
      return;
    }
    if (intent.type === "SCHEDULE_REMINDER") {
      setOpened({ kind: "suggestion" });
      setOpen(true);
      setReminderOpen(true);
      return;
    }
    await recordTodaySuggestionInteraction(details.suggestionId, {
      kind: "INTENT_SELECTED",
      intentType: intent.type,
    }).catch(() => undefined);
    setOpen(false);
    switch (intent.type) {
      case "OPEN_TODAY_WORKOUT":
        {
          const params = new URLSearchParams({ workout: intent.workoutId });
          if (intent.planId) params.set("planId", intent.planId);
          router.push(
            `/day/${encodeURIComponent(intent.scheduledDate)}?${params.toString()}`,
          );
        }
        return;
      case "OPEN_PLAN":
        router.push(`/plans/${encodeURIComponent(intent.planId)}`);
        return;
      case "OPEN_ASSESSMENT":
        openInquiryMutation.mutate(intent.caseId);
        return;
      case "OPEN_PROVIDER_SETTINGS":
        router.push("/account#connections");
        return;
      case "OPEN_IMPORT":
        router.push("/activities#import");
        return;
      case "OPEN_ACTIVITY_REVIEW":
        router.push(`/activities/${encodeURIComponent(intent.activityId)}`);
        return;
      case "OPEN_DECISION": {
        const matched = pending.find((item) => item.id === intent.decisionId);
        if (matched) {
          setOpened({ kind: "decision", decision: matched });
          setOpen(true);
        } else {
          router.push("/ai-coach?openReason=today_suggestion_decision");
        }
        return;
      }
      case "ASK_COACH": {
        navigateToTodaySuggestionCoach();
        return;
      }
      case "VIEW_TOMORROW":
        router.push(`/day/${encodeURIComponent(intent.date)}`);
        return;
    }
  };
  const openTodaySuggestionCoach = async () => {
    if (!details || publicDemo.active) return;
    await recordTodaySuggestionInteraction(details.suggestionId, {
      kind: "INTENT_SELECTED",
      intentType: "ASK_COACH",
    }).catch(() => undefined);
    navigateToTodaySuggestionCoach();
  };
  const openSuggestionDetails = () => {
    applyMutation.reset();
    rejectMutation.reset();
    workoutMutation.reset();
    reminderMutation.reset();
    setOpened({ kind: "suggestion" });
    setOpen(true);
  };
  const decision = opened.kind === "decision" ? opened.decision : null;
  const openedInquiry = opened.kind === "inquiry" ? opened.inquiry : null;
  const openedGuidance = opened.kind === "guidance" ? opened.guidance : null;
  const openNext = decision ? isOpenNextCoachDecision(decision) : false;
  const decisionTitle = (item: PendingCoachDecision) =>
    t(
      isOpenNextCoachDecision(item)
        ? "decisionStack.startNextTitle"
        : "decisionStack.title",
    );
  const decisionSummary = (item: PendingCoachDecision) =>
    item.rationale?.trim() || t("decisionStack.confirmDescription");
  const coachHref = decision
    ? openNext
      ? coachCycleStartHref(decision)
      : `/ai-coach?branchId=${encodeURIComponent(decision.branchId)}&contextId=${encodeURIComponent(decision.contextId)}&planId=${encodeURIComponent(decision.planId)}&openReason=${encodeURIComponent(decision.openReason || "runtime_day_review")}`
    : openedGuidance
      ? `/ai-coach?contextId=${encodeURIComponent(openedGuidance.contextId)}&planId=${encodeURIComponent(openedGuidance.planId)}&openReason=review_guidance`
      : "/ai-coach";

  return (
    <div ref={region} className="min-w-0 space-y-3">
      <div className="flex min-h-8 min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-mobile-caption text-muted-foreground pc:text-xs">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{suggestion.title}</span>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <AccessGuardedLink
            href="/ai-coach"
            aria-label={t("header.askCoach")}
            className="pointer-events-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pc:h-8 pc:w-auto pc:gap-1.5 pc:px-3"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            <span className="hidden text-mobile-caption font-semibold pc:inline pc:text-[11px]">
              {t("header.askCoach")}
            </span>
          </AccessGuardedLink>
          {suggestionLeadingActions}
          <HomeAccessExtension />
        </div>
      </div>
      <div className="flex min-w-0 items-stretch gap-2">
        {suggestionPreviewLeading}
        <div className="min-w-0 flex-1">
          <HomeSuggestionDeck
            disabled={busy || open}
            switchLabel={t("decisionStack.bringForward")}
            onFrontChange={recordPresented}
            cards={items.map((item) => ({
              id: item.id,
              label:
                item.kind === "decision"
                  ? `${decisionTitle(item.decision)} · ${decisionSummary(item.decision)}`
                  : item.kind === "inquiry"
                    ? `${item.inquiry.title} · ${item.inquiry.question.question} · ${item.inquiry.reason}`
                    : item.kind === "guidance"
                      ? `${t("aiTodaySuggestion.title")} · ${item.guidance.rationale}`
                      : details
                        ? `${details.headline} · ${suggestion.summary}`
                        : suggestion.title,
              className:
                item.kind === "decision"
                  ? "bg-[#fef3c7] dark:bg-[#382c20]"
                  : item.kind === "inquiry"
                    ? "bg-neutral-100 dark:bg-[#292b2a]"
                    : item.kind === "guidance"
                      ? "bg-neutral-100 dark:bg-[#292b2a]"
                      : "bg-neutral-100 dark:bg-[#292b2a]",
              onOpen: () => {
                applyMutation.reset();
                rejectMutation.reset();
                setOpened(
                  item.kind === "decision"
                    ? { kind: "decision", decision: item.decision }
                    : item.kind === "inquiry"
                      ? { kind: "inquiry", inquiry: item.inquiry }
                      : item.kind === "guidance"
                        ? { kind: "guidance", guidance: item.guidance }
                        : { kind: "suggestion" },
                );
                setOpen(true);
              },
              content: (
                <>
                  {item.kind === "suggestion" ? (
                    <span className="space-y-1">
                      <span className="block line-clamp-1 text-sm font-semibold leading-5">
                        {details?.headline || suggestion.title}
                      </span>
                      <span className="block line-clamp-2 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
                        {suggestion.summary}
                      </span>
                    </span>
                  ) : (
                    <span className="line-clamp-5 text-sm font-medium leading-5">
                      {item.kind === "decision"
                        ? decisionSummary(item.decision)
                        : item.kind === "inquiry"
                          ? item.inquiry.question.question
                          : item.guidance.rationale}
                    </span>
                  )}
                  {item.kind === "inquiry" ? (
                    <span className="line-clamp-2 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
                      {item.inquiry.reason}
                    </span>
                  ) : null}
                  <CardTags
                    tags={
                      item.kind === "decision"
                        ? [decisionTitle(item.decision)]
                        : item.kind === "inquiry"
                          ? [
                              t("stateInquiry.tag"),
                              item.inquiry.question.header,
                            ]
                          : item.kind === "guidance"
                            ? [t("aiTodaySuggestion.title")]
                            : (details?.evidence
                                .slice(0, 3)
                                .map((evidence) => evidence.label) ??
                              suggestion.tags.slice(0, 3))
                    }
                  />
                </>
              ),
              actions:
                item.kind === "suggestion" && details ? (
                  <>
                    <Button
                      type="button"
                      size="xs"
                      disabled={busy || publicDemo.active}
                      onClick={() => void openTodaySuggestionCoach()}
                    >
                      {t("todaySuggestionActions.viewSuggestion")}
                    </Button>
                    {quickIntent ? (
                      <Button
                        key={quickIntent.type}
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busy || publicDemo.active}
                        onClick={() => void handleIntent(quickIntent)}
                      >
                        {quickIntent.type === "SCHEDULE_REMINDER" ? (
                          <Bell className="h-3.5 w-3.5" aria-hidden />
                        ) : null}
                        {quickIntent.label}
                      </Button>
                    ) : null}
                  </>
                ) : null,
            }))}
          />
        </div>
      </div>
      <ResponsiveModal
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <ResponsiveModalContent
          className="flex max-h-[85dvh] min-h-[50dvh] flex-col gap-0 overflow-hidden p-0 pc:right-auto pc:bottom-auto pc:min-h-0 pc:p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            region.current
              ?.querySelector<HTMLButtonElement>('[data-front="true"]')
              ?.focus({ preventScroll: true });
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <ResponsiveModalHeader className="shrink-0 px-4 pt-5 pb-3 pr-16 text-left sm:text-left">
            <ResponsiveModalTitle>
              {decision
                ? decisionTitle(decision)
                : openedInquiry
                  ? openedInquiry.title
                  : openedGuidance
                    ? t("aiTodaySuggestion.title")
                    : details?.headline || suggestion.title}
            </ResponsiveModalTitle>
            <ResponsiveModalDescription>
              {decision?.planTitle ||
                (openedInquiry ? t("stateInquiry.subtitle") : null) ||
                openedGuidance?.planTitle ||
                [suggestion.date, suggestion.weekday]
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .join("  ")}
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4">
            <p className="whitespace-pre-wrap text-base leading-6">
              {decision
                ? decisionSummary(decision)
                : openedInquiry
                  ? openedInquiry.question.question
                  : openedGuidance?.rationale || suggestion.summary}
            </p>
            {decision ? (
              <>
                <p className="text-sm leading-5 text-muted-foreground">
                  {decisionImpact(t, decision)}
                </p>
                {openNext ? (
                  <p className="text-sm leading-5 text-muted-foreground">
                    {t("decisionStack.startNextConfirmDescription")}
                  </p>
                ) : null}
              </>
            ) : openedInquiry ? (
              <div className="space-y-2">
                <p className="text-sm leading-5 text-muted-foreground">
                  {openedInquiry.reason}
                </p>
                <p className="text-sm leading-5 text-muted-foreground">
                  {openedInquiry.decisionImpact}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {openedInquiry.observation}
                </p>
              </div>
            ) : openedGuidance ? null : (
              <>
                {suggestion.weatherAttribution ? (
                  <p className="text-xs text-muted-foreground">
                    {suggestion.weatherAttribution.legalPageUrl ? (
                      <a
                        href={suggestion.weatherAttribution.legalPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {t("aiTodaySuggestion.weatherAttribution", {
                          serviceName:
                            suggestion.weatherAttribution.serviceName,
                        })}
                      </a>
                    ) : (
                      t("aiTodaySuggestion.weatherAttribution", {
                        serviceName: suggestion.weatherAttribution.serviceName,
                      })
                    )}
                  </p>
                ) : null}
                {details &&
                (evidenceLabels.length > 0 || reasoningDetails.length > 0) ? (
                  <section className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("todaySuggestionActions.reasoning")}
                    </p>
                    {evidenceLabels.length > 0 ? (
                      <CardTags tags={evidenceLabels} />
                    ) : null}
                    {reasoningDetails.length > 0 ? (
                      <div className="space-y-1.5 rounded-md bg-muted/45 px-3 py-2.5 text-sm leading-5 text-muted-foreground">
                        {reasoningDetails.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : !details ? (
                  <CardTags tags={suggestion.tags} />
                ) : null}
                {details ? (
                  workoutIntent ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("todaySuggestionActions.workoutProposal")}
                      </p>
                      <PlanWorkoutListRow
                        displayKind="upcoming"
                        title={workoutIntent.preview.name}
                        subtitle={workoutIntent.preview.notes}
                        meta={workoutMeta}
                        onOpen={() => {
                          setOpen(false);
                          setWorkoutPreviewOpen(true);
                        }}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("todaySuggestionActions.independentWorkoutNote")}
                      </p>
                    </div>
                  ) : null
                ) : null}
              </>
            )}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {isCoachApplyNotAppliedError(error)
                  ? t("decisionStack.applyFailed")
                  : error instanceof Error
                    ? error.message
                    : t("decisionStack.applyFailed")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 space-y-2 px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
            {decision ? (
              <Button
                type="button"
                size="dialog-action"
                className="w-full"
                disabled={busy}
                aria-busy={applyMutation.isPending}
                onClick={() => {
                  rejectMutation.reset();
                  applyMutation.mutate(decision);
                }}
              >
                {t(
                  openNext
                    ? "decisionStack.startNext"
                    : "decisionStack.confirm",
                )}
              </Button>
            ) : openedInquiry ? (
              <Button
                type="button"
                size="dialog-action"
                className="w-full"
                disabled={busy}
                aria-busy={openInquiryMutation.isPending}
                onClick={() => openInquiryMutation.mutate(openedInquiry.caseId)}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t("stateInquiry.answer")}
              </Button>
            ) : opened.kind === "suggestion" && primaryIntent ? (
              <Button
                type="button"
                size="dialog-action"
                className="w-full"
                disabled={busy || publicDemo.active}
                aria-busy={busy}
                onClick={() => void handleIntent(primaryIntent)}
              >
                {workoutMutation.isPending || reminderMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                {primaryIntent.label}
              </Button>
            ) : null}
            {opened.kind === "suggestion" && secondaryIntents.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {secondaryIntents.slice(0, 2).map((intent) => (
                  <Button
                    key={intent.type}
                    type="button"
                    size="dialog-action"
                    variant="ghost"
                    disabled={busy || publicDemo.active}
                    onClick={() => void handleIntent(intent)}
                  >
                    {intent.type === "SCHEDULE_REMINDER" ? (
                      <Bell className="h-4 w-4" aria-hidden />
                    ) : null}
                    {intent.label}
                  </Button>
                ))}
              </div>
            ) : null}
            {opened.kind === "suggestion" && reminderOpen ? (
              <div className="flex items-end gap-2 rounded-md bg-muted/45 p-2">
                <label className="min-w-0 flex-1 space-y-1 text-xs font-medium">
                  <span>{t("todaySuggestionActions.remindAt")}</span>
                  <Input
                    type="datetime-local"
                    value={reminderAt}
                    min={localDateTimeInput(new Date(Date.now() + 5 * 60_000))}
                    max={
                      details?.validUntil
                        ? localDateTimeInput(new Date(details.validUntil))
                        : undefined
                    }
                    onChange={(event) => setReminderAt(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => reminderMutation.mutate()}
                >
                  {reminderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {t("todaySuggestionActions.schedule")}
                </Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              {decision ? (
                <Button
                  type="button"
                  size="dialog-action"
                  variant="ghost"
                  className="flex-1"
                  disabled={busy}
                  aria-busy={rejectMutation.isPending}
                  onClick={() => {
                    applyMutation.reset();
                    rejectMutation.mutate(decision.id);
                  }}
                >
                  {t(
                    openNext
                      ? "decisionStack.startNextDismiss"
                      : "decisionStack.dismiss",
                  )}
                </Button>
              ) : null}
              {openedInquiry ? (
                <Button
                  type="button"
                  size="dialog-action"
                  variant="ghost"
                  className="flex-1"
                  disabled={busy}
                  aria-busy={dismissInquiryMutation.isPending}
                  onClick={() =>
                    dismissInquiryMutation.mutate(openedInquiry.caseId)
                  }
                >
                  {t("stateInquiry.skip")}
                </Button>
              ) : opened.kind !== "suggestion" || !details ? (
                <AccessGuardedLink
                  href={coachHref}
                  aria-disabled={busy || undefined}
                  tabIndex={busy ? -1 : undefined}
                  onClick={(event) => {
                    if (busy) event.preventDefault();
                  }}
                  className={`${buttonVariants({ variant: decision ? "ghost" : "default", size: "dialog-action" })} flex-1`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  {t("header.askCoach")}
                </AccessGuardedLink>
              ) : null}
            </div>
          </div>
        </ResponsiveModalContent>
      </ResponsiveModal>
      {workoutIntent ? (
        <ResponsiveModal
          open={workoutPreviewOpen}
          onOpenChange={(next) => {
            if (busy) return;
            setWorkoutPreviewOpen(next);
            if (!next) setOpen(true);
          }}
        >
          <ResponsiveModalContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 pc:right-auto pc:bottom-auto pc:w-[min(92vw,520px)] pc:p-0">
            <ResponsiveModalHeader className="shrink-0 px-4 pt-5 pb-3 pr-16 text-left sm:text-left">
              <ResponsiveModalTitle>
                {workoutIntent.preview.name}
              </ResponsiveModalTitle>
              <ResponsiveModalDescription>
                {workoutMeta}
              </ResponsiveModalDescription>
            </ResponsiveModalHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
              <PlanWorkoutListRow
                displayKind="upcoming"
                title={workoutIntent.preview.name}
                subtitle={workoutIntent.preview.notes}
                meta={workoutMeta}
              />
              <div className="overflow-hidden rounded-md bg-muted/35">
                <WorkoutRenderer
                  workout={workoutIntent.preview}
                  density="DETAIL"
                />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("todaySuggestionActions.independentWorkoutNote")}
              </p>
            </div>
            <div className="shrink-0 px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                size="dialog-action"
                className="w-full"
                disabled={busy || publicDemo.active}
                aria-busy={workoutMutation.isPending}
                onClick={() => {
                  if (!details) return;
                  workoutMutation.mutate(details.suggestionId);
                }}
              >
                {workoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                {workoutIntent.label}
              </Button>
            </div>
          </ResponsiveModalContent>
        </ResponsiveModal>
      ) : null}
    </div>
  );
}

function CardTags({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="rounded-md bg-white/90 px-2 py-1 text-mobile-caption text-muted-foreground dark:bg-black/28 pc:text-[11px]"
        >
          {tag}
        </span>
      ))}
    </span>
  );
}

function decisionImpact(
  t: ReturnType<typeof useTranslations>,
  decision: PendingCoachDecision,
) {
  if (isOpenNextCoachDecision(decision)) {
    return t("decisionStack.startNextImpact", {
      name: decision.planTitle || t("decisionStack.unnamedWorkout"),
    });
  }
  const name = decision.workout.name || t("decisionStack.unnamedWorkout");
  if (decision.decisionType === "PLAN_WORKOUT_STATUS") {
    return t("decisionStack.skipImpact", { name });
  }
  if (
    decision.decisionType === "PLAN_WORKOUT_ADD" ||
    decision.decisionType === "PLAN_WORKOUT_RESCHEDULE"
  ) {
    return (
      decision.adjustment?.after?.summary ||
      decision.adjustment?.after?.name ||
      decision.rationale ||
      name
    );
  }
  if (decision.decisionType === "PLAN_WORKOUT_UPDATE") {
    const after =
      decision.adjustment?.after?.summary ||
      decision.adjustment?.after?.name ||
      name;
    const kind = decision.adjustment?.kind;
    if (kind === "reduce_volume") {
      return t("decisionStack.reduceVolumeImpact", { name, after });
    }
    if (kind === "reduce_intensity") {
      return t("decisionStack.reduceIntensityImpact", { name, after });
    }
    if (
      kind === "replace_next" ||
      kind === "increase_volume" ||
      kind === "increase_intensity"
    ) {
      return after;
    }
    return t("decisionStack.recoveryImpact", { name, after });
  }
  return t("decisionStack.postponeImpact", { name });
}

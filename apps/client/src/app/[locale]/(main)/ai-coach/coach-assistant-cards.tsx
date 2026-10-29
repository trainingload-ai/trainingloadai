"use client";

import { memo, useCallback, useMemo } from "react";
import {
  useCoachMessage,
  useCoachThread,
  useCoachActions,
} from "./coach-chat-provider";
import { CoachQuestionAnsweredView } from "./coach-question-answered-view";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Plan, PlanContent, PlanFooter } from "@/components/ai-elements/plan";
import { useCreateCoachPlanFromDraft } from "@/api/usePlanMutations";
import { getPlanLibraryHref } from "@/lib/plan-navigation";
import {
  COACH_PLAN_DRAFT_SAVED_KIND,
  COACH_QUESTION_REPLY_KIND,
  COACH_QUESTION_SKIP_KIND,
  PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND,
  safeParseAskUserQuestionData,
  type CoachPlanDraftSavedToolResultPayload,
  type CoachQuestionReplyToolResultPayload,
  type CoachQuestionSkipToolResultPayload,
  type PlanWorkoutAdjustmentAppliedToolResultPayload,
} from "@shared/ai-coach-schema";
import {
  type CoachAssistantToolData,
  type CoachUiMessage,
  type CoachUserToolResultData,
} from "@/lib/ai-coach-ui-parts";
import {
  safeParseCoachPlanDraftToolUseInput,
  type CoachPlanDraft,
} from "@/lib/coach-plan-draft";
import {
  safeParsePlanWorkoutAdjustmentDraftToolUseInput,
  type PlanWorkoutAdjustmentDraft,
} from "@/lib/plan-workout-adjustment-draft";
import { MutationAppliedCard } from "./cards/MutationAppliedCard";
import { COACH_READ_TOOL_CARD_NAMES } from "./coach-conversation-items";
import { CoachPlanDraftCalendarPreview } from "./coach-plan-draft-calendar-preview";
import { CoachQuestionCard } from "./coach-question-card";
import {
  CoachQuestionSurface,
  coachQuestionIdentity,
} from "./coach-question-flow";
import { CoachReadToolCard } from "./coach-read-tool-cards";
import { CoachVolatileDecisionCards } from "./coach-decision-cards";
import { PlanWorkoutAdjustmentDraftCard } from "./plan-workout-adjustment-draft-card";
import { CoachInvalidStructuredCard } from "./coach-invalid-structured-card";
import { useCoachThreadReceipts } from "./coach-thread-receipts";
import {
  buildQuestionAnswerMessage,
  dedupeCoachToolCards,
  getCoachToolRenderKey,
  getNormalizedToolCards,
  isMutationAppliedPayload,
  isValidDecisionPayload,
} from "./coach-assistant-card-model";

function useCurrentCoachUiMessage(): CoachUiMessage | null {
  const serializedMessage = useCoachMessage((message) =>
    JSON.stringify({
      id: message.id,
      role: message.role,
      parts: message.content
        .filter((part) => part.type === "data")
        .map((part) => ({
          type: `data-${part.name}`,
          data: part.data,
        })),
    }),
  );
  return useMemo(
    () => JSON.parse(serializedMessage) as CoachUiMessage,
    [serializedMessage],
  );
}

function appendCoachToolResult(
  thread: NonNullable<ReturnType<typeof useCoachActions>>,
  text: string,
  data: CoachUserToolResultData,
) {
  thread.append({
    role: "user",
    content: [
      ...(text.trim() ? [{ type: "text" as const, text }] : []),
      {
        type: "data" as const,
        name: "coach-user-tool-result",
        data,
      },
    ],
  });
}

function CoachV2AssistantCardsInner({
  toolsOverride,
  questionDisabled = false,
}: {
  toolsOverride?: CoachAssistantToolData[];
  questionDisabled?: boolean;
}) {
  const message = useCurrentCoachUiMessage();
  const messageTools = useMemo(
    () => dedupeCoachToolCards(getNormalizedToolCards(message)),
    [message],
  );
  const tools = useMemo(
    () => (toolsOverride ? dedupeCoachToolCards(toolsOverride) : messageTools),
    [messageTools, toolsOverride],
  );
  const thread = useCoachActions()!;
  const isRunning = useCoachThread((state) => state.isRunning);
  const receipts = useCoachThreadReceipts();
  const router = useRouter();
  const isMobile = useIsMobile();
  const createCoachPlan = useCreateCoachPlanFromDraft();
  const tq = useTranslations("AiCoachPage.questions");
  const tpd = useTranslations("AiCoachPage.planDraft");
  const twa = useTranslations("AiCoachPage.workoutAdjustment");
  const td = useTranslations("AiCoachPage.decision");

  const assistantMessageId = message?.id ?? "";

  const questionTool = useMemo(
    () => tools.find((item) => item.name === "AskUserQuestion") ?? null,
    [tools],
  );

  const question = useMemo(() => {
    const prompt = questionTool
      ? safeParseAskUserQuestionData(questionTool.input)
      : null;
    return prompt && questionTool ? { prompt, tool: questionTool } : null;
  }, [questionTool]);

  const questionReply =
    receipts.questionReplies.get(
      `${assistantMessageId}:${question?.tool.toolCallId ?? ""}`,
    ) ??
    (message?.parts.some((part) => part.type === "data-coach-interaction")
      ? null
      : (receipts.questionReplies.get(question?.tool.toolCallId ?? "") ??
        receipts.questionReplies.get(assistantMessageId) ??
        null));
  const planDraftAlreadySaved =
    receipts.savedPlanDrafts.has(assistantMessageId);

  const planDraftTool = useMemo(
    () => tools.find((item) => item.name === "PresentCoachPlanDraft") ?? null,
    [tools],
  );

  const planDraft = useMemo(
    () =>
      planDraftTool
        ? safeParseCoachPlanDraftToolUseInput(planDraftTool.input)
        : null,
    [planDraftTool],
  );

  const workoutAdjustmentDraft = useMemo(() => {
    const tool = tools.find(
      (item) => item.name === "PresentPlanWorkoutAdjustmentDraft",
    );
    return tool
      ? safeParsePlanWorkoutAdjustmentDraftToolUseInput(tool.input)
      : null;
  }, [tools]);

  const invalidStructuredCardCount = useMemo(
    () =>
      tools.filter((tool) => {
        if (tool.name === "AskUserQuestion") {
          return safeParseAskUserQuestionData(tool.input) == null;
        }
        if (tool.name === "PresentCoachPlanDraft") {
          return safeParseCoachPlanDraftToolUseInput(tool.input) == null;
        }
        if (tool.name === "PresentPlanWorkoutAdjustmentDraft") {
          return (
            safeParsePlanWorkoutAdjustmentDraftToolUseInput(tool.input) == null
          );
        }
        if (tool.name === "MutationApplied") {
          return !isMutationAppliedPayload(tool.input);
        }
        if (
          tool.name === "CoachDecisionDraft" ||
          tool.name === "CoachDecisionApplied"
        ) {
          return !isValidDecisionPayload(tool.name, tool.input);
        }
        return false;
      }).length,
    [tools],
  );

  const readCards = useMemo(
    () => tools.filter((item) => COACH_READ_TOOL_CARD_NAMES.has(item.name)),
    [tools],
  );

  const mutationCards = useMemo(
    () =>
      tools
        .filter((item) => item.name === "MutationApplied")
        .map((item) => item.input)
        .filter(isMutationAppliedPayload),
    [tools],
  );

  const decisionCards = useMemo(
    () =>
      tools
        .filter(
          (item) =>
            item.name === "CoachDecisionDraft" ||
            item.name === "CoachDecisionApplied",
        )
        .map((item) => ({ name: item.name, input: item.input })),
    [tools],
  );

  const submitQuestionAnswers = useCallback(
    (payload: {
      answers: Record<string, string | string[]>;
      notes: Record<string, string>;
      skippedQuestionIds: string[];
    }) => {
      if (!question || !assistantMessageId) return;
      if (isRunning) {
        toast.error(tq("submitWhileStreaming"));
        return;
      }
      const body = buildQuestionAnswerMessage(question.prompt, payload, {
        title: tq("answeredBadge"),
        note: tq("noteLabel"),
        skipped: tq("answeredSkipped"),
      });
      const toolResult: CoachQuestionReplyToolResultPayload = {
        kind: COACH_QUESTION_REPLY_KIND,
        repliesToAssistantMessageId: assistantMessageId,
        questionToolUseId: question.tool.toolCallId,
        answers: payload.answers,
        notes: payload.notes,
        ...(payload.skippedQuestionIds.length
          ? { skippedQuestionIds: payload.skippedQuestionIds }
          : {}),
      };
      appendCoachToolResult(thread, body, {
        toolUseId: assistantMessageId,
        content: toolResult,
      });
    },
    [assistantMessageId, isRunning, question, thread, tq],
  );

  const skipQuestion = useCallback(() => {
    if (!question || !assistantMessageId) return;
    if (isRunning) {
      toast.error(tq("submitWhileStreaming"));
      return;
    }
    const toolResult: CoachQuestionSkipToolResultPayload = {
      kind: COACH_QUESTION_SKIP_KIND,
      repliesToAssistantMessageId: assistantMessageId,
      questionToolUseId: question.tool.toolCallId,
    };
    appendCoachToolResult(thread, tq("skip"), {
      toolUseId: assistantMessageId,
      content: toolResult,
    });
  }, [assistantMessageId, isRunning, question, thread, tq]);

  const notifyPlanDraftSaved = useCallback(
    (planId: string) => {
      if (!assistantMessageId) return;
      const toolResult: CoachPlanDraftSavedToolResultPayload = {
        kind: COACH_PLAN_DRAFT_SAVED_KIND,
        repliesToAssistantMessageId: assistantMessageId,
        planId,
      };
      appendCoachToolResult(thread, tpd("savedMetaPrompt"), {
        toolUseId: assistantMessageId,
        content: toolResult,
      });
    },
    [assistantMessageId, thread, tpd],
  );

  const createPlanFromDraft = useCallback(
    (draft: CoachPlanDraft) => {
      if (isRunning) return;
      createCoachPlan.mutate(draft, {
        onSuccess: (result) => {
          notifyPlanDraftSaved(String(result.id));
          toast.success(tpd("createSuccess"));
          router.push(getPlanLibraryHref(isMobile));
        },
        onError: (err) => {
          const code = err instanceof Error ? err.message : String(err);
          toast.error(
            code === "NO_WORKOUTS" ? tpd("noWorkouts") : tpd("createFailed"),
          );
        },
      });
    },
    [createCoachPlan, isMobile, isRunning, notifyPlanDraftSaved, router, tpd],
  );

  const notifyWorkoutAdjustmentApplied = useCallback(
    async (payload: { planId: string; workoutId: string }) => {
      if (!assistantMessageId) return;
      const toolResult: PlanWorkoutAdjustmentAppliedToolResultPayload = {
        kind: PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND,
        repliesToAssistantMessageId: assistantMessageId,
        planId: payload.planId,
        workoutId: payload.workoutId,
      };
      appendCoachToolResult(thread, twa("appliedMetaPrompt"), {
        toolUseId: assistantMessageId,
        content: toolResult,
      });
    },
    [assistantMessageId, thread, twa],
  );

  const confirmCoachDecision = useCallback(
    (decisionId: string) => {
      if (!assistantMessageId || isRunning) return;
      appendCoachToolResult(thread, td("confirmPrompt"), {
        toolUseId: assistantMessageId,
        content: {
          kind: "coach_decision_confirmation",
          repliesToAssistantMessageId: assistantMessageId,
          decisionId,
        },
      });
    },
    [assistantMessageId, isRunning, td, thread],
  );

  const reanalyzeCoachDecision = useCallback(
    (decisionId: string) => {
      if (!assistantMessageId || isRunning) return;
      appendCoachToolResult(thread, td("rebasePrompt"), {
        toolUseId: assistantMessageId,
        content: {
          kind: "coach_decision_reanalyze",
          repliesToAssistantMessageId: assistantMessageId,
          decisionId,
        },
      });
    },
    [assistantMessageId, isRunning, td, thread],
  );

  if (!tools.length) return null;

  return (
    <div className="space-y-2">
      {question && questionReply ? (
        <CoachQuestionAnsweredView
          prompt={question.prompt}
          reply={questionReply}
        />
      ) : question ? (
        <CoachQuestionSurface
          id={coachQuestionIdentity(
            assistantMessageId,
            question.tool.toolCallId,
          )}
        >
          {(dismiss, inactive) => (
            <CoachQuestionCard
              onDismiss={dismiss}
              prompt={question.prompt}
              disabled={isRunning || questionDisabled || inactive}
              onSubmit={submitQuestionAnswers}
              onSkip={skipQuestion}
            />
          )}
        </CoachQuestionSurface>
      ) : null}

      {readCards.length > 0 ? (
        <div className="space-y-2">
          {readCards.map((tool, index) => (
            <CoachReadToolCard
              key={getCoachToolRenderKey(
                assistantMessageId,
                "read",
                tool,
                index,
              )}
              name={tool.name}
              input={tool.input}
              disabled={isRunning}
              onAction={(text, content) =>
                appendCoachToolResult(thread, text, {
                  toolUseId: tool.toolCallId,
                  content,
                })
              }
            />
          ))}
        </div>
      ) : null}

      {mutationCards.length > 0 ? (
        <div className="space-y-2">
          {mutationCards.map((result, index) => (
            <MutationAppliedCard
              key={`${assistantMessageId || "assistant-message"}:mutation:${result.actionId}:${index}`}
              result={result}
              dense
            />
          ))}
        </div>
      ) : null}

      <CoachVolatileDecisionCards
        cards={decisionCards}
        appliedDecisionIds={receipts.appliedDecisions}
        confirmDisabled={isRunning}
        onConfirmDecision={confirmCoachDecision}
        onReanalyzeDecision={reanalyzeCoachDecision}
      />

      {planDraft ? (
        <Plan open>
          <PlanContent className="p-0">
            <CoachPlanDraftCalendarPreview
              draft={planDraft}
              className="rounded-none bg-transparent dark:bg-transparent"
            />
          </PlanContent>
          <PlanFooter>
            <Button
              type="button"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              disabled={
                createCoachPlan.isPending || isRunning || planDraftAlreadySaved
              }
              title={isRunning ? tpd("waitStreamEnd") : undefined}
              onClick={() => createPlanFromDraft(planDraft)}
            >
              {createCoachPlan.isPending
                ? tpd("creating")
                : planDraftAlreadySaved
                  ? tpd("planAlreadySavedShort")
                  : tpd("createPlan")}
            </Button>
          </PlanFooter>
        </Plan>
      ) : null}

      {workoutAdjustmentDraft ? (
        <PlanWorkoutAdjustmentDraftCard
          draft={workoutAdjustmentDraft as PlanWorkoutAdjustmentDraft}
          alreadyApplied={
            receipts.appliedWorkoutAdjustments.has(assistantMessageId) ||
            Boolean(
              workoutAdjustmentDraft.decisionId &&
              receipts.appliedDecisions.has(workoutAdjustmentDraft.decisionId),
            )
          }
          disabled={isRunning}
          onApplied={notifyWorkoutAdjustmentApplied}
        />
      ) : null}

      {Array.from({ length: invalidStructuredCardCount }, (_, index) => (
        <CoachInvalidStructuredCard
          key={`${assistantMessageId}:invalid-structured-card:${index}`}
        />
      ))}
    </div>
  );
}

export const CoachV2AssistantCards = memo(
  CoachV2AssistantCardsInner,
  (previous, next) =>
    previous.questionDisabled === next.questionDisabled &&
    JSON.stringify(previous.toolsOverride ?? null) ===
      JSON.stringify(next.toolsOverride ?? null),
);

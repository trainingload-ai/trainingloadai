"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleHelp,
  FileText,
  LoaderCircle,
  Wrench,
  XCircle,
  BookOpen,
  Brain,
  PauseCircle,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CoachAssistantToolData,
  CoachUiMessage,
} from "@/lib/ai-coach-ui-parts";
import type { CoachActivity } from "@shared/ai-coach-run-contract";
import { isCoachPublicReasoningSummary } from "@shared/ai-coach-run-contract";
import {
  coachSkillLabelKey,
  coachToolLabelKey,
} from "@shared/ai-coach-activity-catalog";
import {
  CoachMessageProvider,
  useCoachActions,
  useCoachThread,
} from "./coach-chat-provider";
import {
  groupCoachTranscript,
  coachInteractionIndex,
  runSnapshot,
  coachActivityResults,
  shouldPinFailedActivity,
  type CoachTranscriptGroup,
} from "./coach-run-view-model";
import { COACH_MESSAGE_COMPONENTS } from "./coach-message-renderer";
import { CoachV2AssistantCards } from "./coach-assistant-cards";
import { CoachMarkdown } from "./coach-markdown";
import { useCoachTurnRetry } from "./coach-turn-retry-context";
import { CoachStructuredToolSkeleton } from "./coach-structured-card-skeletons";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { CoachReadToolCard } from "./coach-read-tool-cards";
import { CoachCardDetailsContext } from "./cards/CoachCard";
import { CoachReasoningSummary } from "./coach-reasoning-summary";

const icons = {
  analysis: Brain,
  skill: BookOpen,
  tool: Wrench,
  question: CircleHelp,
  narration: Circle,
  artifact: FileText,
  recovery: Circle,
};

function ActivityRow({
  activity,
  result,
}: {
  activity: CoachActivity;
  result?: CoachAssistantToolData;
}) {
  const t = useTranslations("AiCoachPage.timeline");
  const [open, setOpen] = useState(false);
  const skillKey = coachSkillLabelKey(activity.skillName);
  const toolKey = coachToolLabelKey(activity.toolName);
  const label =
    activity.kind === "skill"
      ? skillKey
        ? `${t("kind.skill")} · ${t(`skills.${skillKey}`)}`
        : t("kind.skill")
      : toolKey
        ? t(`tools.${toolKey}`)
        : t(`kind.${activity.kind}`);
  const failed =
    activity.status === "failed" || activity.status === "interrupted";
  const duration =
    activity.startedAt && activity.endedAt
      ? Math.max(
          0,
          Math.round(
            (Date.parse(activity.endedAt) - Date.parse(activity.startedAt)) /
              1000,
          ),
        )
      : null;
  const rowLabel = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>{label}</span>
      <span className="text-xs">{t(`activity.${activity.status}`)}</span>
      {duration !== null ? (
        <span className="text-xs tabular-nums">
          {t("seconds", { count: duration })}
        </span>
      ) : null}
      {result ? (
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      ) : null}
    </span>
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <ChainOfThoughtStep
        data-activity-id={activity.activityId}
        icon={
          failed
            ? XCircle
            : activity.status === "running"
              ? LoaderCircle
              : icons[activity.kind]
        }
        status={
          activity.status === "running"
            ? "active"
            : activity.status === "queued"
              ? "pending"
              : "complete"
        }
        className={cn(
          "motion-reduce:animate-none",
          failed && "text-destructive",
        )}
        description={
          activity.summary === "late_outcome" ? t("lateOutcome") : undefined
        }
        label={
          result ? (
            <CollapsibleTrigger className="rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {rowLabel}
            </CollapsibleTrigger>
          ) : (
            rowLabel
          )
        }
      >
        {result ? (
          <CollapsibleContent
            className="pt-2"
            data-activity-result={result.toolCallId}
          >
            <CoachCardDetailsContext.Provider value={true}>
              <CoachReadToolCard name={result.name} input={result.input} />
            </CoachCardDetailsContext.Provider>
          </CollapsibleContent>
        ) : null}
        {activity.status === "running" && activity.toolName ? (
          <CoachStructuredToolSkeleton toolName={activity.toolName} />
        ) : null}
      </ChainOfThoughtStep>
    </Collapsible>
  );
}

const RunTimeline = memo(function RunTimeline({
  group,
  allMessages,
}: {
  group: CoachTranscriptGroup;
  allMessages: readonly CoachUiMessage[];
}) {
  const t = useTranslations("AiCoachPage.timeline");
  const last = group.messages.at(-1)!;
  const run = runSnapshot(last);
  const actions = useCoachActions();
  const retryControls = useCoachTurnRetry();
  const busy = useCoachThread((state) => state.isRunning);
  const [userOpen, setUserOpen] = useState<boolean>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run?.status]);
  const interactions = useMemo(
    () => coachInteractionIndex(allMessages),
    [allMessages],
  );
  if (!run) return null;
  const answered =
    run.status === "awaiting_input" &&
    run.pendingInteractionId &&
    interactions.get(run.pendingInteractionId)?.status !== "pending";
  const displayStatus = answered ? "completed" : run.status;
  const open =
    userOpen ??
    (displayStatus === "running" || displayStatus === "awaiting_input");
  const duration =
    run.status === "running"
      ? run.previousExecutionMs + Math.max(0, now - Date.parse(run.startedAt))
      : run.executionMs;
  const latestAttempt =
    allMessages.findLast((message) => runSnapshot(message)?.runId === run.runId)
      ?.id === last.id;
  const nodes: React.ReactNode[] = [];
  const pinned: React.ReactNode[] = [];
  for (const message of group.messages) {
    const results = coachActivityResults(message);
    let textOrdinal = 0;
    const segments = new Map(
      message.parts.flatMap((part) =>
        part.type === "data-coach-text-segment"
          ? [[part.data.textOrdinal, part.data] as const]
          : [],
      ),
    );
    for (const part of message.parts) {
      if (
        part.type === "data-coach-activity" &&
        part.data.display !== "hidden" &&
        part.data.kind !== "question" &&
        part.data.kind !== "artifact"
      ) {
        const node =
          part.data.kind === "analysis" &&
          isCoachPublicReasoningSummary(part.data.publicSummary) ? (
            <CoachReasoningSummary
              key={part.data.activityId}
              activity={part.data}
              runActive={runSnapshot(message)?.status === "running"}
            />
          ) : (
            <ActivityRow
              key={part.data.activityId}
              activity={part.data}
              result={results.get(part.data.activityId)}
            />
          );
        nodes.push(node);
        if (
          shouldPinFailedActivity({
            open,
            runStatus: displayStatus,
            activityStatus: part.data.status,
          })
        )
          pinned.push(node);
      } else if (part.type === "text") {
        if (segments.get(textOrdinal++)?.placement !== "activity") continue;
        nodes.push(
          <div
            key={`${message.id}:text:${textOrdinal}`}
            className="border-l border-border pl-6 text-sm text-muted-foreground"
          >
            <CoachMarkdown>{part.text}</CoachMarkdown>
          </div>,
        );
      } else if (
        part.type === "data-coach-tool" &&
        part.data.name === "AskUserQuestion"
      ) {
        const interaction = [...interactions.values()].find(
          (item) =>
            item.questionMessageId === message.id &&
            item.questionToolCallId === part.data.toolCallId,
        );
        const awaiting = runSnapshot(message)?.status === "awaiting_input";
        const card = (
          <CoachMessageProvider
            key={`${message.id}:${part.data.toolCallId}`}
            id={message.id}
          >
            {interaction?.status === "pending" && !awaiting ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {t("questionInactive")}
              </p>
            ) : null}
            <CoachV2AssistantCards
              questionDisabled={!awaiting}
              toolsOverride={[part.data]}
            />
          </CoachMessageProvider>
        );
        if (interaction?.status === "pending" && awaiting) pinned.push(card);
        else nodes.push(card);
      }
    }
  }
  const hasErrorCard = last.parts.some(
    (part) => part.type === "data-coach-turn-error",
  );
  return (
    <section
      className="min-w-0 max-w-[860px] space-y-3"
      data-run-id={run.runId}
    >
      {group.resumed ? (
        <p className="text-xs text-muted-foreground">{t("resumed")}</p>
      ) : null}
      <ChainOfThought
        open={open}
        onOpenChange={setUserOpen}
        className="space-y-2"
      >
        <ChainOfThoughtHeader
          icon={
            displayStatus === "running"
              ? LoaderCircle
              : displayStatus === "awaiting_input"
                ? CircleHelp
                : displayStatus === "completed"
                  ? CheckCircle2
                  : displayStatus === "failed"
                    ? XCircle
                    : PauseCircle
          }
          aria-label={`${t(`run.${displayStatus}`)} · ${t("seconds", { count: Math.floor(duration / 1000) })}`}
          className={cn(
            "w-auto gap-2 rounded-sm py-1 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            displayStatus === "running" &&
              "[&>svg:first-child]:animate-spin motion-reduce:[&>svg:first-child]:animate-none",
          )}
        >
          <span role="status">{t(`run.${displayStatus}`)}</span>
          <span className="ml-2 tabular-nums">
            {t("seconds", { count: Math.floor(duration / 1000) })}
          </span>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent className="space-y-4 border-l border-border pl-4">
          {nodes}
        </ChainOfThoughtContent>
      </ChainOfThought>
      {pinned}
      {run.retryBlocked && ["failed", "interrupted"].includes(run.status) ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("retryBlocked")}
        </p>
      ) : null}
      {!hasErrorCard &&
      latestAttempt &&
      ["failed", "interrupted"].includes(run.status) &&
      !run.retryBlocked ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            retryControls?.prepareRetry();
            void actions.retry(last.id);
          }}
        >
          {t("retry")}
        </Button>
      ) : null}
      {group.messages.map((message) => (
        <CoachMessageProvider key={message.id} id={message.id}>
          <COACH_MESSAGE_COMPONENTS.AssistantMessage />
        </CoachMessageProvider>
      ))}
    </section>
  );
});

export function CoachMessageList() {
  const views = useCoachThread((state) => state.messages);
  const messages = useMemo(() => views.map((view) => view.ui), [views]);
  const groups = useMemo(() => groupCoachTranscript(messages), [messages]);
  return groups.map((group) =>
    group.runId ? (
      <RunTimeline key={group.key} group={group} allMessages={messages} />
    ) : (
      <CoachMessageProvider key={group.key} id={group.key}>
        {group.messages[0].role === "user" ? (
          <COACH_MESSAGE_COMPONENTS.UserMessage />
        ) : (
          <COACH_MESSAGE_COMPONENTS.AssistantMessage />
        )}
      </CoachMessageProvider>
    ),
  );
}

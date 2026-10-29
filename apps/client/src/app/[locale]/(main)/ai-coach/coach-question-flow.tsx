"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeParseAskUserQuestionData } from "@shared/ai-coach-schema";
import { useCoachThread } from "./coach-chat-provider";
import { coachInteractionIndex, runSnapshot } from "./coach-run-view-model";
import { useCoachThreadReceipts } from "./coach-thread-receipts";

type QuestionFlow = {
  activeId?: string;
  eligibleIds: ReadonlySet<string>;
  dismissed: boolean;
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
  open: (id: string) => void;
  dismiss: () => void;
};
const Context = createContext<QuestionFlow | null>(null);
export const coachQuestionIdentity = (messageId: string, toolCallId: string) =>
  `${messageId}:${toolCallId}`;

/** One answering surface per thread; domain submission stays in the source card.
 * A portal preserves card state, message identity and receipt context when the
 * user closes/reopens the dock or scrolls the transcript.
 */
export function CoachQuestionFlowProvider({
  children,
}: {
  children: ReactNode;
}) {
  const views = useCoachThread((state) => state.messages);
  const receipts = useCoachThreadReceipts();
  const [preferredId, setPreferredId] = useState<string>();
  const [dismissedId, setDismissedId] = useState<string>();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const eligibleIds = useMemo(() => {
    const messages = views.map((view) => view.ui);
    const interactions = coachInteractionIndex(messages);
    const latestRuns = new Map(
      messages.flatMap((message) => {
        const run = runSnapshot(message);
        return run ? [[run.runId, run] as const] : [];
      }),
    );
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const run = runSnapshot(message);
      if (
        run &&
        (run.status !== "awaiting_input" ||
          latestRuns.get(run.runId)?.attemptId !== run.attemptId)
      )
        continue;
      for (const part of message.parts) {
        if (
          part.type !== "data-coach-tool" ||
          part.data.name !== "AskUserQuestion" ||
          !safeParseAskUserQuestionData(part.data.input)
        )
          continue;
        const id = coachQuestionIdentity(message.id, part.data.toolCallId);
        const interaction = [...interactions.values()].find(
          (item) =>
            item.questionMessageId === message.id &&
            item.questionToolCallId === part.data.toolCallId,
        );
        if (
          run
            ? interaction?.status !== "pending"
            : receipts.questionReplies.has(id) ||
              receipts.questionReplies.has(message.id) ||
              receipts.questionReplies.has(part.data.toolCallId)
        )
          continue;
        ids.add(id);
      }
    }
    return ids;
  }, [views, receipts.questionReplies]);
  const activeId =
    preferredId && eligibleIds.has(preferredId)
      ? preferredId
      : [...eligibleIds].at(-1);
  return (
    <Context.Provider
      value={{
        activeId,
        eligibleIds,
        dismissed: activeId === dismissedId,
        target,
        setTarget,
        open: (id) => {
          setPreferredId(id);
          setDismissedId(undefined);
          requestAnimationFrame(() =>
            target
              ?.querySelector<HTMLElement>("[data-coach-question] h3")
              ?.focus({ preventScroll: true }),
          );
        },
        dismiss: () => {
          setDismissedId(activeId);
          requestAnimationFrame(() =>
            target
              ?.closest("[data-coach-question-anchor]")
              ?.querySelector<HTMLTextAreaElement>(
                "[data-coach-composer-layer] textarea",
              )
              ?.focus({ preventScroll: true }),
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

/** The question overlays the composer; neither its height nor visibility changes
 * the footer's layout. Keep the covered composer mounted to preserve its draft.
 */
export function CoachQuestionDock({
  children,
  embedded,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const flow = useContext(Context);
  const open = Boolean(flow?.activeId && !flow.dismissed);
  return (
    <div className="relative" data-coach-question-anchor>
      <div
        hidden={!open}
        data-coach-question-dock
        className={
          embedded
            ? "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-3"
            : "pointer-events-none absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-lg px-2 pb-safe-or-1 sm:max-w-[920px] sm:px-3"
        }
      >
        <div
          ref={flow?.setTarget}
          className="pointer-events-auto max-h-[65dvh] overflow-y-auto overscroll-contain rounded-md bg-background shadow-sm"
        />
      </div>
      <div
        data-coach-composer-layer
        inert={open}
        aria-hidden={open || undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function CoachQuestionSurface({
  id,
  children,
}: {
  id: string;
  children: (dismiss?: () => void, inactive?: boolean) => ReactNode;
}) {
  const flow = useContext(Context);
  const t = useTranslations("AiCoachPage.questions");
  if (!flow) return children();
  if (!flow.eligibleIds.has(id)) return children(undefined, true);
  const active = flow.activeId === id;
  return (
    <>
      {active && flow.target
        ? createPortal(children(flow.dismiss), flow.target, id)
        : null}
      {!active || flow.dismissed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => flow.open(id)}
        >
          <CircleHelp aria-hidden className="size-4" />
          {t("resumeAnswering")}
        </Button>
      ) : null}
    </>
  );
}

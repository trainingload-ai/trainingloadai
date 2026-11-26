import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readCoachPlanCalendar,
  type CoachPlanCalendar,
} from "@shared/ai-coach-schema";
import {
  type PlanCalendarMovePreview,
  type PlanProposalPresentation,
} from "@shared/plan-proposal";
import {
  safeParseCoachPlanDraftToolUseInput,
  type CoachPlanDraft,
} from "@/lib/coach-plan-draft";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { useCoachThread, type CoachMessageView } from "./coach-chat-provider";
import { normalizeCoachRenderableToolName } from "./coach-conversation-items";
import type { CalendarEditDraft } from "../calendar/components/calendar-edit-draft";

export type CoachScheduleArtifact = {
  kind: "schedule-calendar";
  id: string;
  state: string;
  assistantId: string;
  adjustmentId: string;
  planId: string;
  presentation: PlanProposalPresentation;
};

export type CoachPlanDraftArtifact = {
  kind: "plan-draft-calendar";
  id: string;
  draft: CoachPlanDraft;
};

export type CoachCalendarAdjustmentArtifact = {
  kind: "calendar-adjustment";
  id: string;
  planId: string;
  initialDate: string;
  presentation: PlanProposalPresentation;
  confirmationId: string;
};

export type CoachCalendarArtifact =
  | CoachScheduleArtifact
  | CoachPlanDraftArtifact
  | CoachCalendarAdjustmentArtifact
  | CoachPublishedCalendarArtifact;

export type CoachPublishedCalendarArtifact = CoachPlanCalendar & {
  kind: "published-calendar";
  id: string;
};

export function calendarAdjustmentArtifact(
  preview: PlanCalendarMovePreview | undefined,
): CoachCalendarAdjustmentArtifact | null {
  if (!preview?.planId || !preview.confirmationId ||
      preview.state === "CANCELLED" || preview.state === "APPLIED")
    return null;
  return {
    kind: "calendar-adjustment",
    id: preview.previewId,
    planId: preview.planId,
    initialDate: preview.impact.to,
    presentation: preview.presentation,
    confirmationId: preview.confirmationId,
  };
}

export const isReviewableSchedule = (state: string) =>
  ["PROPOSED", "DRAFT", "PENDING", "APPROVED"].includes(state);

const artifactCache = new WeakMap<CoachUiMessage, CoachCalendarArtifact[]>();

function readCoachCalendarArtifacts(
  message: CoachMessageView,
): CoachCalendarArtifact[] {
  if (message.role !== "assistant") return [];
  const cached = artifactCache.get(message.ui);
  if (cached) return cached;
  const artifacts: CoachCalendarArtifact[] = [];
  for (const part of message.ui.parts) {
    if (part.type !== "data-coach-tool") continue;
    if (part.data.name === "PlanCalendarView") {
      const view = readCoachPlanCalendar(part.data.input);
      if (view) artifacts.push({
        ...view,
        kind: "published-calendar",
        id: `${message.id}:tool:${part.data.toolCallId}`,
      });
      continue;
    }
    const name = normalizeCoachRenderableToolName(part.data.name);
    if (name === "PresentCoachPlanDraft") {
      const draft = safeParseCoachPlanDraftToolUseInput(part.data.input);
      if (draft?.workouts.length)
        artifacts.push({
          kind: "plan-draft-calendar",
          id: `${message.id}:tool:${part.data.toolCallId}`,
          draft,
        });
    }
    if (name !== "CoachDecisionDraft") continue;
    const result = part.data.input as {
      decisionId?: string;
      decisionType?: string;
      state?: string;
      payload?: { planId?: string; calendarAdjustmentId?: string; presentation?: PlanProposalPresentation };
    } | null;
    const presentation = result?.payload?.presentation;
    const targetPlan = result?.payload?.planId;
    if (
      result?.decisionType === "PLAN_SCHEDULE" &&
      targetPlan &&
      result.decisionId &&
      result.state &&
      presentation?.mode === "SCHEDULE" &&
      Array.isArray(presentation.rows) &&
      presentation.rows.some(
        (row) => row.changeKind && row.changeKind !== "PRESERVED",
      )
    ) {
      artifacts.push({
        kind: "schedule-calendar",
        id: result.decisionId,
        state: result.state,
        presentation,
        assistantId: message.id,
        adjustmentId: result.payload?.calendarAdjustmentId ?? result.decisionId,
        planId: targetPlan,
      });
    }
  }
  artifactCache.set(message.ui, artifacts);
  return artifacts;
}

export function readCoachPublishedCalendar(message: CoachMessageView) {
  return readCoachCalendarArtifacts(message).findLast(
    (artifact) => artifact.kind === "published-calendar",
  );
}

export function useCoachCalendarArtifacts(planId?: string) {
  const messages = useCoachThread((state) => state.messages);
  return useMemo(
    () =>
      messages
        .flatMap(readCoachCalendarArtifacts)
        .filter(
          (artifact) =>
            !planId ||
            artifact.kind !== "schedule-calendar" ||
            artifact.planId === planId,
        ),
    [messages, planId],
  );
}

export const calendarDraftKey = (artifact: CoachCalendarArtifact) =>
  artifact.kind === "schedule-calendar" ? artifact.adjustmentId : artifact.id;

export const calendarArtifactKey = (artifact: CoachCalendarArtifact) =>
  `${artifact.kind}:${calendarDraftKey(artifact)}`;

export function useCoachCalendarTabs(
  artifacts: CoachCalendarArtifact[],
  excludedIds: readonly string[] = [],
) {
  const [ids, setIds] = useState<string[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const queryClient = useQueryClient();
  const draftKey = ["coach-calendar-drafts"] as const;
  const { data: drafts } = useQuery<Record<string, CalendarEditDraft>>({
    queryKey: draftKey,
    queryFn: async () => ({}),
    initialData: {},
    enabled: false,
  });
  const [mobileView, setMobileView] = useState<"conversation" | "preview">(
    "conversation",
  );
  const autoOpened = useRef(new Set<string>());
  const openers = useRef(new Map<string, HTMLElement>());
  const conversationRef = useRef<HTMLDivElement>(null);
  const available = new Map(
    artifacts
      .filter(
        (artifact) =>
          artifact.kind !== "schedule-calendar" ||
          (isReviewableSchedule(artifact.state) &&
            !excludedIds.includes(artifact.id)),
      )
      .map((artifact) => [calendarArtifactKey(artifact), artifact]),
  );
  const latest = artifacts.at(-1);
  const latestKey = latest && calendarArtifactKey(latest);
  const autoKey = latest?.kind !== "published-calendar" && latestKey && available.has(latestKey)
    ? latestKey
    : null;
  const open = useCallback((key: string) => {
    setIds((current) => (current.includes(key) ? current : [...current, key]));
    setSelection(key);
    setVisible(true);
  }, []);
  useEffect(() => {
    if (!autoKey || autoOpened.current.has(autoKey)) return;
    autoOpened.current.add(autoKey);
    open(autoKey);
  }, [autoKey, open]);
  const openTab = (id: string) => {
    const trigger = document.activeElement;
    if (trigger instanceof HTMLElement && trigger !== document.body)
      openers.current.set(id, trigger);
    open(id);
    setMobileView("preview");
  };
  const openFromCard = (kind: CoachCalendarArtifact["kind"], id: string) => {
    const requested = artifacts.find((artifact) => artifact.kind === kind && artifact.id === id);
    if (!requested) return;
    const key = calendarArtifactKey(requested);
    if (!available.has(key)) return;
    openTab(key);
  };
  const close = () => {
    setVisible(false);
    setMobileView("conversation");
  };
  const closeTab = (id: string, nextId: string | null) => {
    autoOpened.current.add(id);
    const opener = openers.current.get(id);
    openers.current.delete(id);
    setIds((current) => current.filter((item) => item !== id));
    setSelection(nextId);
    if (nextId) return;
    close();
    requestAnimationFrame(() => {
      const conversation = conversationRef.current;
      const target = opener?.isConnected && opener.getClientRects().length
        ? opener
        : conversation?.querySelector<HTMLElement>("textarea") ?? conversation;
      target?.focus({ preventScroll: true });
    });
  };
  const tabs = ids.flatMap((id) => {
    const artifact = available.get(id);
    return artifact ? [artifact] : [];
  });
  const active = (selection && available.get(selection)) || tabs.at(-1) || null;
  const updateDraft = (
    id: string,
    update: (draft: CalendarEditDraft | null) => CalendarEditDraft | null,
  ) => queryClient.setQueryData<Record<string, CalendarEditDraft>>(draftKey, (current = {}) => {
    const next = update(current[id] ?? null);
    if (next === current[id]) return current;
    const drafts = { ...current };
    if (next) drafts[id] = next;
    else delete drafts[id];
    return drafts;
  });
  return {
    tabs,
    active,
    visible,
    mobileView,
    setMobileView,
    openFromCard,
    openTab,
    openedIds: ids,
    selection,
    conversationRef,
    close,
    closeTab,
    setSelection,
    drafts,
    updateDraft,
    isEditingAdjustment: (id: string) => {
      const artifact = artifacts.find((item) => item.id === id);
      return Boolean(drafts[artifact ? calendarDraftKey(artifact) : id]);
    },
  };
}

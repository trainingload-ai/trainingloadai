"use client";

import * as React from "react";
import type { UIMessage } from "ai";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  getCoachAssistantToolItemsByName,
  getCoachConversationItemsFromAssistantContent,
  getCoachConversationItems,
} from "./coach-conversation-items";
import {
  CoachDecisionAppliedCard,
  CoachDecisionDraftCard,
  type CoachDecisionApplyToolResult,
  type CoachDecisionDraftToolResult,
} from "./cards/CoachDecisionCard";

function isDecisionDraft(v: unknown): v is CoachDecisionDraftToolResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === "coach_decision_draft" &&
    typeof o.decisionId === "string" &&
    typeof o.branchId === "string" &&
    typeof o.state === "string" &&
    typeof o.riskTier === "string" &&
    typeof o.decisionType === "string"
  );
}

function isDecisionApply(v: unknown): v is CoachDecisionApplyToolResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === "coach_decision_apply" &&
    typeof o.decisionId === "string" &&
    typeof o.result === "string"
  );
}

function latestDraftOnly(
  drafts: CoachDecisionDraftToolResult[],
): CoachDecisionDraftToolResult[] {
  const latest = drafts[drafts.length - 1];
  return latest ? [latest] : [];
}

function CoachDecisionDraftTabs({
  drafts,
  appliedDecisionIds,
  confirmDisabled,
  onConfirmDecision,
}: {
  drafts: CoachDecisionDraftToolResult[];
  appliedDecisionIds?: Set<string>;
  confirmDisabled?: boolean;
  onConfirmDecision?: (decisionId: string) => void;
}) {
  const t = useTranslations("AiCoachPage.decision");
  const [selectedDecisionId, setSelectedDecisionId] = React.useState(
    drafts[0]?.decisionId ?? "",
  );

  if (drafts.length === 0) return null;
  if (drafts.length === 1) {
    const draft = drafts[0];
    return (
      <CoachDecisionDraftCard
        result={draft}
        dense
        isApplied={appliedDecisionIds?.has(draft.decisionId)}
        confirmDisabled={confirmDisabled}
        onConfirm={onConfirmDecision}
      />
    );
  }

  const activeDecisionId = drafts.some(
    (draft) => draft.decisionId === selectedDecisionId,
  )
    ? selectedDecisionId
    : drafts[0].decisionId;
  const activeDraft =
    drafts.find((draft) => draft.decisionId === activeDecisionId) ?? drafts[0];
  const activeDraftIndex = drafts.findIndex(
    (draft) => draft.decisionId === activeDraft.decisionId,
  );
  const activeDraftApplied = appliedDecisionIds?.has(activeDraft.decisionId);

  return (
    <Tabs
      value={activeDecisionId}
      onValueChange={setSelectedDecisionId}
      className="w-full"
    >
      <TabsList className="h-auto max-w-full flex-wrap justify-start bg-neutral-100 p-1 dark:bg-muted/45">
        {drafts.map((draft, index) => (
          <TabsTrigger
            key={draft.decisionId}
            value={draft.decisionId}
            className="h-7 gap-1.5 rounded-sm px-2.5 text-mobile-caption pc:text-xs"
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                activeDecisionId === draft.decisionId
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-transparent",
              )}
            >
              <Check className="h-2.5 w-2.5" />
            </span>
            {t("draftTab", { index: index + 1 })}
          </TabsTrigger>
        ))}
      </TabsList>
      {drafts.map((draft) => (
        <TabsContent key={draft.decisionId} value={draft.decisionId}>
          <CoachDecisionDraftCard
            result={draft}
            dense
            isApplied={appliedDecisionIds?.has(draft.decisionId)}
            confirmDisabled={confirmDisabled}
            showConfirmControls={false}
            onConfirm={onConfirmDecision}
          />
        </TabsContent>
      ))}
      <div className="mt-2 flex flex-col gap-2 rounded-md bg-neutral-100 p-3 dark:bg-muted/45 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {t("selectedDraft", { index: activeDraftIndex + 1 })}
        </p>
        {onConfirmDecision && !activeDraftApplied ? (
          <Button
            type="button"
            size="sm"
            disabled={confirmDisabled}
            onClick={() => onConfirmDecision(activeDraft.decisionId)}
          >
            {t("confirmSelectedButton")}
          </Button>
        ) : null}
      </div>
    </Tabs>
  );
}

export function CoachAssistantDecisionCards({
  message,
  appliedDecisionIds,
  confirmDisabled,
  onConfirmDecision,
  rebasePendingDecisionId,
  onReanalyzeDecision,
}: {
  message: UIMessage;
  appliedDecisionIds?: Set<string>;
  confirmDisabled?: boolean;
  onConfirmDecision?: (decisionId: string) => void;
  rebasePendingDecisionId?: string | null;
  onReanalyzeDecision?: (decisionId: string) => void;
}) {
  if (message.role !== "assistant") return null;
  const blocks = getCoachAssistantToolItemsByName(
    message,
    new Set(["CoachDecisionDraft", "CoachDecisionApplied"]),
  );
  const drafts = latestDraftOnly(
    blocks
      .filter((b) => b.name === "CoachDecisionDraft")
      .map((b) => b.payload)
      .filter(isDecisionDraft),
  );
  const applies = blocks
    .filter((b) => b.name === "CoachDecisionApplied")
    .map((b) => b.payload)
    .filter(isDecisionApply);
  if (!drafts.length && !applies.length) return null;
  return (
    <div className="mt-2 space-y-2">
      <CoachDecisionDraftTabs
        drafts={drafts}
        appliedDecisionIds={appliedDecisionIds}
        confirmDisabled={confirmDisabled}
        onConfirmDecision={onConfirmDecision}
      />
      {applies.map((r) => (
        <CoachDecisionAppliedCard
          key={`${r.decisionId}:${r.result}`}
          result={r}
          dense
          rebasePending={rebasePendingDecisionId === r.decisionId}
          onReanalyze={onReanalyzeDecision}
        />
      ))}
    </div>
  );
}

export function CoachVolatileDecisionCards({
  cards,
  appliedDecisionIds,
  confirmDisabled,
  onConfirmDecision,
  rebasePendingDecisionId,
  onReanalyzeDecision,
}: {
  cards: Array<{ name: string; input: unknown }>;
  appliedDecisionIds?: Set<string>;
  confirmDisabled?: boolean;
  onConfirmDecision?: (decisionId: string) => void;
  rebasePendingDecisionId?: string | null;
  onReanalyzeDecision?: (decisionId: string) => void;
}) {
  const drafts = latestDraftOnly(
    cards
      .filter((b) => b.name === "CoachDecisionDraft")
      .map((b) => b.input)
      .filter(isDecisionDraft),
  );
  const applies = cards
    .filter((b) => b.name === "CoachDecisionApplied")
    .map((b) => b.input)
    .filter(isDecisionApply);
  if (!drafts.length && !applies.length) return null;
  return (
    <div className="mt-2 space-y-2">
      <CoachDecisionDraftTabs
        drafts={drafts}
        appliedDecisionIds={appliedDecisionIds}
        confirmDisabled={confirmDisabled}
        onConfirmDecision={onConfirmDecision}
      />
      {applies.map((r) => (
        <CoachDecisionAppliedCard
          key={`${r.decisionId}:${r.result}`}
          result={r}
          dense
          rebasePending={rebasePendingDecisionId === r.decisionId}
          onReanalyze={onReanalyzeDecision}
        />
      ))}
    </div>
  );
}

export function parseDecisionCardsFromAssistantContent(
  content: unknown[],
): Array<{ name: string; input: unknown }> {
  return getCoachConversationItemsFromAssistantContent(content)
    .filter(
      (item) =>
        item.name === "CoachDecisionDraft" ||
        item.name === "CoachDecisionApplied",
    )
    .map((item) => ({ name: item.name!, input: item.payload }));
}

export function buildAppliedCoachDecisionIds(
  messages: UIMessage[],
  volatileCards: Array<{ name: string; input: unknown }> = [],
): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const item of getCoachConversationItems(message)) {
      if (item.name !== "CoachDecisionApplied") continue;
      if (isDecisionApply(item.payload) && item.payload.result === "APPLIED") {
        ids.add(item.payload.decisionId);
      }
    }
  }
  for (const card of volatileCards) {
    if (card.name !== "CoachDecisionApplied") continue;
    if (isDecisionApply(card.input) && card.input.result === "APPLIED") {
      ids.add(card.input.decisionId);
    }
  }
  return ids;
}

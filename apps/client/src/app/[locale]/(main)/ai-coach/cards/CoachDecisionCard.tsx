"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  CircleX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
} from "@/components/ai-elements/confirmation";
import { CoachCard } from "./CoachCard";
import { coachDecisionPreviewRows } from "@shared/coach-decision-preview";
import type { PlanSportType } from "@/api/plans";
import { CoachWorkoutPreview } from "../coach-workout-preview";
import { rejectCoachDecision } from "@/api/ai-coach";

export type CoachDecisionDraftToolResult = {
  kind: "coach_decision_draft";
  decisionId: string;
  branchId: string;
  state: string;
  riskTier: string;
  decisionType: string;
  payload?: Record<string, unknown>;
  rationale?: string | null;
  confidence?: number | null;
  options?: Array<{
    optionKey: string;
    title?: string | null;
    pros?: unknown;
    cons?: unknown;
    impact?: unknown;
    isSelected?: boolean;
  }>;
};

export type CoachDecisionApplyToolResult = {
  receipt?: unknown;
  kind: "coach_decision_apply";
  decisionId: string;
  result: string;
  commitId?: string | null;
  branchId?: string | null;
  conflict?: {
    expectedBaseEventSeq: number;
    currentHeadEventSeq: number;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type PlanProposalPresentation = {
  title: string;
  summary: string;
  mode: "ADAPT" | "SUPERSEDE";
  effectiveFrom?: string;
  facts: Array<{ type: string; label: string; value?: unknown }>;
  counts: {
    total: number;
    changed: number;
    preserved: number;
    skipped: number;
  };
  estimatedLoadDelta?: number | null;
  syncImpact: string;
  rows: Array<{
    name: string;
    scheduledDate?: string | null;
    sportType: string;
    disposition: "APPLY" | "PRESERVE";
    before: string;
    after: string;
    rationale: string;
  }>;
  warnings: string[];
};

function getPlanProposalPresentation(
  result: CoachDecisionDraftToolResult,
): PlanProposalPresentation | null {
  if (
    result.decisionType !== "PLAN_ADAPTATION" &&
    result.decisionType !== "PLAN_SUPERSESSION"
  )
    return null;
  const value = asRecord(asRecord(result.payload).presentation);
  const counts = asRecord(value.counts);
  const mode = asText(value.mode);
  if (
    !asText(value.title) ||
    !asText(value.summary) ||
    (mode !== "ADAPT" && mode !== "SUPERSEDE") ||
    !Array.isArray(value.rows)
  )
    return null;
  return {
    title: asText(value.title),
    summary: asText(value.summary),
    mode,
    effectiveFrom: asText(value.effectiveFrom) || undefined,
    facts: Array.isArray(value.facts)
      ? value.facts.flatMap((item) => {
          const fact = asRecord(item);
          const label = asText(fact.label);
          return label
            ? [{ type: asText(fact.type), label, value: fact.value }]
            : [];
        })
      : [],
    counts: {
      total: asNumber(counts.total) ?? value.rows.length,
      changed: asNumber(counts.changed) ?? 0,
      preserved: asNumber(counts.preserved) ?? 0,
      skipped: asNumber(counts.skipped) ?? 0,
    },
    estimatedLoadDelta: asNumber(value.estimatedLoadDelta),
    syncImpact: asText(value.syncImpact),
    rows: value.rows.flatMap((item) => {
      const row = asRecord(item);
      const disposition = asText(row.disposition);
      const name = asText(row.name);
      if (!name || (disposition !== "APPLY" && disposition !== "PRESERVE"))
        return [];
      return [
        {
          name,
          scheduledDate: asText(row.scheduledDate) || null,
          sportType: asText(row.sportType),
          disposition,
          before: asText(row.before),
          after: asText(row.after),
          rationale: asText(row.rationale),
        },
      ];
    }),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map(asText).filter(Boolean)
      : [],
  };
}

function formatStatusValue(
  t: ReturnType<typeof useTranslations>,
  value: string,
): string {
  switch (value) {
    case "PLANNED":
      return t("statusValue.PLANNED");
    case "IN_PROGRESS":
      return t("statusValue.IN_PROGRESS");
    case "DONE":
      return t("statusValue.DONE");
    case "SKIPPED":
      return t("statusValue.SKIPPED");
    case "MOVED":
      return t("statusValue.MOVED");
    default:
      return value;
  }
}

function formatDecisionFieldValue(
  t: ReturnType<typeof useTranslations>,
  labelKey: string,
  value: unknown,
): string {
  const text = asText(value);
  if (!text) return "";
  if (labelKey === "status") return formatStatusValue(t, text);
  return text;
}

function getApplyResultLabel(
  t: ReturnType<typeof useTranslations>,
  result: string,
): string {
  switch (result) {
    case "APPLIED":
      return t("applyResult.APPLIED");
    case "REBASE_REQUIRED":
      return t("applyResult.REBASE_REQUIRED");
    case "FAILED":
      return t("applyResult.FAILED");
    case "SKIPPED":
      return t("applyResult.SKIPPED");
    default:
      return result;
  }
}

function formatPosition(
  t: ReturnType<typeof useTranslations>,
  dto: Record<string, unknown>,
) {
  const week = asNumber(dto.weekIndex);
  const day = asNumber(dto.dayIndex);
  const session = asNumber(dto.sessionIndex);
  if (week == null && day == null && session == null) return "";
  return t("position", {
    week: week ?? "-",
    day: day ?? "-",
    session: session ?? 1,
  });
}

function buildDecisionPreviewRows(
  t: ReturnType<typeof useTranslations>,
  result: CoachDecisionDraftToolResult,
): Array<{ label: string; value: string }> {
  const payload = asRecord(result.payload);
  const verified = coachDecisionPreviewRows(payload);
  if (verified.length)
    return verified.map((row) => ({
      label: `${row.position} · ${t(({ name: "workoutName", text: "workoutText", notes: "notes", sportType: "sportType" } as Record<string, string>)[row.field] ?? "positionLabel")}`,
      value: row.value,
    }));
  // Workout additions have their own structured preview below. Rendering the
  // DTO again as key/value rows would expose the workout DSL and duplicate the
  // same proposal. A composite schedule may still have verified update rows.
  if (result.decisionType === "PLAN_WORKOUT_ADD") return [];
  const dto = asRecord(payload.dto ?? payload.change);
  const rows: Array<{ label: string; value: string }> = [];
  const add = (labelKey: string, value: unknown) => {
    const text = formatDecisionFieldValue(t, labelKey, value);
    if (text) rows.push({ label: t(labelKey), value: text });
  };

  if (result.decisionType === "PLAN_WORKOUT_UPDATE") {
    const position = formatPosition(t, dto);
    if (position) rows.push({ label: t("positionLabel"), value: position });
    add("sportType", dto.sportType);
    add("workoutName", dto.name);
    add("workoutText", dto.text);
    add("notes", dto.notes);
    add("reason", dto.reason);
    return rows.slice(0, 6);
  }

  if (result.decisionType === "PLAN_WORKOUT_POSTPONE") {
    const position = formatPosition(t, payload);
    if (position) rows.push({ label: t("newPosition"), value: position });
    add("reason", payload.reason);
    return rows.slice(0, 4);
  }

  if (result.decisionType === "PLAN_WORKOUT_STATUS") {
    add("status", payload.status);
    add("reason", payload.reason);
    return rows.slice(0, 4);
  }

  if (result.decisionType === "PLAN_LIFECYCLE") {
    add("action", payload.action);
    add("startDate", payload.startDate);
    add("reason", payload.reason);
    return rows.slice(0, 4);
  }

  if (result.decisionType === "ACTIVITY_PLAN_LINK") {
    add("activity", payload.hashId);
    add("workout", payload.workoutId);
    return rows.slice(0, 4);
  }

  const keys = Object.keys(payload).slice(0, 4);
  for (const key of keys) {
    const raw = payload[key];
    const value =
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean"
        ? String(raw)
        : "";
    if (value) rows.push({ label: key, value });
  }
  return rows;
}

function getWorkoutDrafts(result: CoachDecisionDraftToolResult) {
  const payload = asRecord(result.payload);
  if (result.decisionType === "PLAN_WORKOUT_ADD") {
    const dto = asRecord(payload.dto ?? payload.change);
    return Object.keys(dto).length ? [dto] : [];
  }
  if (result.decisionType === "PLAN_WORKOUT_SCHEDULE") {
    const additions = Array.isArray(payload.additions) ? payload.additions : [];
    return additions
      .map((item) => asRecord(asRecord(item).dto ?? item))
      .filter((item) => Object.keys(item).length > 0);
  }
  return [];
}

function WorkoutDraftPreview({
  dto,
  pending,
}: {
  dto: Record<string, unknown>;
  pending: boolean;
}) {
  const t = useTranslations("AiCoachPage.decision");
  const tw = useTranslations("WorkoutEditor.fields.sportType.options");
  const text = asText(dto.text);
  const structureInput = asRecord(dto.definition);
  const structureKind =
    asText(structureInput.kind) || asText(dto.structureKind) || "ENDURANCE";
  const sportRaw = asText(dto.sportType) || "RUN";
  const sportType = (
    ["RUN", "CYCLING", "SWIM"].includes(sportRaw) ? sportRaw : "RUN"
  ) as PlanSportType;

  const sportLabel =
    sportType === "CYCLING"
      ? tw("cycling")
      : sportType === "SWIM"
        ? tw("swim")
        : tw("run");
  const name = asText(dto.name) || sportLabel;
  const position = formatPosition(t, dto);
  const notes = asText(dto.notes);

  return (
    <div className="rounded-md bg-background/80 p-3 dark:bg-background/45">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {name}
          </div>
          <div className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
            {[sportLabel, position].filter(Boolean).join(" · ")}
          </div>
        </div>
        {pending && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
            {t("willAdd")}
          </span>
        )}
      </div>
      <CoachWorkoutPreview
        text={text}
        sportType={sportType}
        kind={
          structureKind === "STRENGTH" || structureKind === "FREEFORM"
            ? structureKind
            : "ENDURANCE"
        }
      />
      {notes ? (
        <p className="mt-2 whitespace-pre-line text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {notes}
        </p>
      ) : null}
    </div>
  );
}

function getDecisionSummary(
  t: ReturnType<typeof useTranslations>,
  result: CoachDecisionDraftToolResult,
  previewRows: Array<{ label: string; value: string }>,
): string {
  const selectedOption = (result.options ?? []).find(
    (option) => option.isSelected,
  );
  const selectedTitle = asText(selectedOption?.title);
  if (selectedTitle) return selectedTitle;

  const namedPreview = previewRows.find((row) =>
    [t("workoutName"), t("workoutText"), t("action")].includes(row.label),
  );
  if (namedPreview?.value) return namedPreview.value;

  const workoutName = getWorkoutDrafts(result)
    .map((draft) => asText(draft.name))
    .find(Boolean);
  if (workoutName) return workoutName;

  return t("suggestionTitle");
}

export function CoachDecisionDraftCard({
  result,
  dense,
  isApplied,
  confirmDisabled,
  showConfirmControls = true,
  onConfirm,
}: {
  result: CoachDecisionDraftToolResult;
  dense?: boolean;
  isApplied?: boolean;
  confirmDisabled?: boolean;
  showConfirmControls?: boolean;
  onConfirm?: (decisionId: string) => void;
}) {
  const t = useTranslations("AiCoachPage.decision");
  const [showAllProposalRows, setShowAllProposalRows] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isCancelled, setIsCancelled] = React.useState(false);
  const [cancelFailed, setCancelFailed] = React.useState(false);
  const applied = Boolean(isApplied || result.state === "APPLIED");
  const rejected = !applied && (isCancelled || result.state === "REJECTED");
  const approved = !rejected && (applied || result.state === "APPROVED");
  const isHighRisk = result.riskTier === "HIGH";
  const proposal = getPlanProposalPresentation(result);
  const workoutDrafts = getWorkoutDrafts(result);
  const previewRows = buildDecisionPreviewRows(t, result);
  const summary = proposal?.title ?? getDecisionSummary(t, result, previewRows);
  const selectedOptions = (result.options ?? []).filter(
    (option) => option.isSelected,
  );
  const proposalRows = proposal
    ? showAllProposalRows
      ? proposal.rows
      : proposal.rows.slice(0, 10)
    : [];
  return (
    <CoachCard
      tone={workoutDrafts.length ? "neutral" : isHighRisk ? "warning" : "info"}
      icon={
        workoutDrafts.length ? (
          <CalendarPlus className="h-4 w-4" />
        ) : isHighRisk ? (
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <GitBranch className="h-4 w-4" />
        )
      }
      title={summary}
      subtitle={
        applied || rejected || approved
          ? undefined
          : (proposal?.summary ??
            (workoutDrafts.length
              ? t("workoutDraftSubtitle")
              : t("draftSubtitle")))
      }
      headerRight={
        applied ? (
          <span className="text-xs text-muted-foreground">
            {t("appliedBadge")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {rejected
              ? t("rejectedTitle")
              : approved
                ? t("approvedTitle")
                : isHighRisk
                  ? t("reviewBadge")
                  : t("draftBadge")}
          </span>
        )
      }
      dense={dense}
      footer={
        showConfirmControls && (onConfirm || approved || rejected) ? (
          <Confirmation
            approval={{
              id: result.decisionId,
              approved: rejected ? false : approved ? true : undefined,
            }}
            state={
              rejected
                ? "output-denied"
                : applied
                  ? "output-available"
                  : approved
                    ? "approval-responded"
                    : "approval-requested"
            }
            className="w-full bg-transparent p-0 dark:bg-transparent"
            aria-label={t("suggestionTitle")}
          >
            <ConfirmationRequest>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("confirmHint")}
              </p>
            </ConfirmationRequest>
            <ConfirmationAccepted>
              <p
                role="status"
                className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"
              >
                <CheckCircle2 className="size-3.5 shrink-0" />
                {applied ? t("appliedTitle") : t("approvedHint")}
              </p>
            </ConfirmationAccepted>
            <ConfirmationRejected>
              <p
                role="status"
                className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"
              >
                <CircleX className="size-3.5 shrink-0" />
                {t("rejectedHint")}
              </p>
            </ConfirmationRejected>
            {cancelFailed && (
              <p role="alert" className="text-xs text-destructive">
                {t("rejectFailed")}
              </p>
            )}
            <ConfirmationActions>
              {proposal ? (
                <ConfirmationAction
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={confirmDisabled || isCancelling}
                  onClick={() => {
                    setIsCancelling(true);
                    setCancelFailed(false);
                    void rejectCoachDecision(
                      result.decisionId,
                      "user_cancelled_plan_proposal",
                    )
                      .then(() => setIsCancelled(true))
                      .catch(() => setCancelFailed(true))
                      .finally(() => setIsCancelling(false));
                  }}
                >
                  {t("cancelButton")}
                </ConfirmationAction>
              ) : null}
              <ConfirmationAction
                type="button"
                size="sm"
                disabled={confirmDisabled || isCancelling}
                onClick={() => onConfirm?.(result.decisionId)}
              >
                {proposal?.mode === "SUPERSEDE"
                  ? t("applySupersessionButton")
                  : proposal
                    ? t("applyAdaptationButton")
                    : t("confirmButton")}
              </ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>
        ) : null
      }
    >
      <div className="space-y-2.5">
        {proposal ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["total", "changed", "preserved", "skipped"] as const).map(
                (key) => (
                  <div
                    key={key}
                    className="rounded-md bg-background/80 px-3 py-2 dark:bg-background/45"
                  >
                    <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                      {t(key)}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-foreground">
                      {proposal.counts[key]}
                    </div>
                  </div>
                ),
              )}
            </div>
            {proposal.facts.length ? (
              <div className="space-y-1.5 rounded-md bg-background/80 px-3 py-3 dark:bg-background/45">
                <CoachCard.SectionTitle>{t("evidence")}</CoachCard.SectionTitle>
                {proposal.facts.map((fact, index) => (
                  <CoachCard.MetaRow
                    key={`${fact.type}:${fact.label}:${index}`}
                    label={fact.label}
                  >
                    {fact.value == null ? "—" : String(fact.value)}
                  </CoachCard.MetaRow>
                ))}
              </div>
            ) : null}
            <div className="space-y-1.5 rounded-md bg-background/80 px-3 py-3 dark:bg-background/45">
              {proposal.estimatedLoadDelta != null ? (
                <CoachCard.MetaRow label={t("loadDelta")}>
                  {proposal.estimatedLoadDelta > 0 ? "+" : ""}
                  {proposal.estimatedLoadDelta}
                </CoachCard.MetaRow>
              ) : null}
              <CoachCard.MetaRow label={t("syncImpact")}>
                {proposal.syncImpact || "—"}
              </CoachCard.MetaRow>
              {proposal.effectiveFrom ? (
                <CoachCard.MetaRow label={t("startDate")}>
                  {proposal.effectiveFrom}
                </CoachCard.MetaRow>
              ) : null}
            </div>
            <div className="space-y-3 rounded-md bg-background/80 px-3 py-3 dark:bg-background/45">
              <CoachCard.SectionTitle>
                {t("changePreview")}
              </CoachCard.SectionTitle>
              {proposalRows.map((row, index) => (
                <div
                  key={`${row.name}:${row.scheduledDate}:${index}`}
                  className="pt-1 first:pt-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-xs font-medium text-foreground">
                      {row.name}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {[row.scheduledDate, row.sportType]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {row.before} → {row.after}
                  </div>
                  {row.rationale ? (
                    <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {row.rationale}
                    </div>
                  ) : null}
                </div>
              ))}
              {proposal.rows.length > 10 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5"
                  onClick={() => setShowAllProposalRows((value) => !value)}
                >
                  {showAllProposalRows ? (
                    <ChevronUp className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="mr-1 h-3.5 w-3.5" />
                  )}
                  {showAllProposalRows ? t("showLess") : t("showAll")}
                </Button>
              ) : null}
            </div>
            {proposal.warnings.map((warning) => (
              <div
                key={warning}
                className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
              >
                {warning}
              </div>
            ))}
          </>
        ) : null}
        {workoutDrafts.map((draft, index) => (
          <WorkoutDraftPreview
            key={`${asText(draft.name)}:${asNumber(draft.weekIndex)}:${asNumber(draft.dayIndex)}:${index}`}
            dto={draft}
            pending={!approved && !rejected}
          />
        ))}
        {!proposal && previewRows.length > 0 ? (
          <div className="space-y-1.5 rounded-md bg-background/80 px-3 py-3 dark:bg-background/45">
            <CoachCard.SectionTitle>
              {t("changePreview")}
            </CoachCard.SectionTitle>
            {previewRows.map((row) => (
              <CoachCard.MetaRow
                key={`${row.label}:${row.value}`}
                label={row.label}
              >
                {row.value}
              </CoachCard.MetaRow>
            ))}
          </div>
        ) : null}
        {!proposal && selectedOptions.length > 0 ? (
          <div className="space-y-1.5 rounded-md bg-background/80 px-3 py-3 dark:bg-background/45">
            <CoachCard.SectionTitle>
              {t("selectedOption")}
            </CoachCard.SectionTitle>
            {selectedOptions.map((option) => (
              <div
                key={option.optionKey}
                className="text-mobile-caption pc:text-xs leading-5 text-foreground"
              >
                {option.title || option.optionKey}
              </div>
            ))}
          </div>
        ) : null}
        {result.rationale ? (
          <div className="px-1 pt-1 text-xs leading-5 text-muted-foreground">
            <CoachCard.SectionTitle className="mb-1">
              {t("whyThis")}
            </CoachCard.SectionTitle>
            <p>{result.rationale}</p>
          </div>
        ) : null}
      </div>
    </CoachCard>
  );
}

export function CoachDecisionAppliedCard({
  result,
  dense,
  rebasePending,
  onReanalyze,
}: {
  result: CoachDecisionApplyToolResult;
  dense?: boolean;
  rebasePending?: boolean;
  onReanalyze?: (decisionId: string) => void;
}) {
  const t = useTranslations("AiCoachPage.decision");
  const applied = result.result === "APPLIED";
  const rebaseRequired = result.result === "REBASE_REQUIRED";
  return (
    <CoachCard
      tone={applied ? "success" : "warning"}
      icon={
        applied ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )
      }
      title={
        applied
          ? t("appliedTitle")
          : rebaseRequired
            ? t("rebaseTitle")
            : t("applyResultTitle")
      }
      subtitle={getApplyResultLabel(t, result.result)}
      dense={dense}
      footer={
        rebaseRequired && onReanalyze ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={rebasePending}
            onClick={() => onReanalyze(result.decisionId)}
          >
            {rebasePending ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {rebasePending ? t("rebaseStarting") : t("rebaseButton")}
          </Button>
        ) : null
      }
    >
      <div className="space-y-1.5">
        {applied
          ? coachDecisionPreviewRows(result.receipt).map((row) => (
              <CoachCard.MetaRow
                key={row.key}
                label={`${row.position} · ${t(({ name: "workoutName", text: "workoutText", notes: "notes", sportType: "sportType" } as Record<string, string>)[row.field] ?? "positionLabel")}`}
              >
                {row.value}
              </CoachCard.MetaRow>
            ))
          : null}
        {rebaseRequired ? (
          <div className="rounded-md bg-background/70 px-2.5 py-2 text-mobile-caption pc:text-xs leading-5 text-muted-foreground dark:bg-background/40">
            {t("rebaseNoChange")}
          </div>
        ) : null}
      </div>
    </CoachCard>
  );
}

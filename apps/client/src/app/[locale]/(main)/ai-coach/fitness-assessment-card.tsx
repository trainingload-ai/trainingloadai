"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CoachCard } from "./cards/CoachCard";
import {
  isFitnessResult,
  fitnessMessageKey,
  fitnessAdoptionMessageKey,
  fitnessCheckText,
  fitnessDateTime,
  fitnessEvidenceSummary,
  fitnessMetricLabel,
} from "@shared/fitness-assessment";
export function FitnessAssessmentCard({
  input,
  disabled,
  onAction,
}: {
  input: unknown;
  disabled?: boolean;
  onAction?: (text: string, content: unknown) => void | Promise<void>;
}) {
  const locale = useLocale();
  const t = useTranslations("AiCoachPage.fitnessAssessment");
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(false),
    [renderedAt] = useState(Date.now);
  if (!isFitnessResult(input)) return null;
  const r = input;
  if (
    (r.status !== "ESTIMATED" && r.status !== "OBSERVATION_ONLY") ||
    (r.candidates.length === 0 && r.observations.length === 0)
  ) {
    return null;
  }
  const segment = r.evidence.segment;
  const send = async (text: string, content: unknown) => {
    if (!onAction || busy || disabled) return;
    setBusy(true);
    setError(false);
    try {
      await onAction(text, content);
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const locked = !!disabled || busy || sent || !onAction;
  const canRecompute =
    (r.preparationStatus !== "READY" ||
      r.candidates.some((c) => c.metric === "VDOT")) &&
    r.reasonCode !== "AMBIGUOUS_SCOPE" &&
    r.reasonCode !== "PROTOCOL_UNKNOWN" &&
    r.reasonCode !== "METHOD_UNAVAILABLE" &&
    r.reasonCode !== "SCOPE_UNSUPPORTED";
  const canOfferWorkout = r.nextActions.includes("OFFER_WORKOUT");
  const hasActions =
    r.applyOptions.length > 0 || canRecompute || canOfferWorkout;
  return (
    <CoachCard
      title={t("title")}
      subtitle={`${t(`sports.${r.sport}`)} · ${fitnessDateTime(r.assessedAt, locale, r.timezone)}`}
    >
      <div className="space-y-3 text-sm">
        <p>{t(`statuses.${r.status}`)}</p>
        {r.candidates.map((c) => (
          <p key={c.metric} className="font-medium tabular-nums">
            {fitnessMetricLabel(c.metric)}: {c.currentValue ?? "—"} → {c.value}{" "}
            {c.unit}
            {c.currentRecordedAt
              ? ` (${t("priorRecord")}: ${c.currentRecordedAt.slice(0, 10)})`
              : ""}
          </p>
        ))}
        {r.reasonCode && <p>{t(`reasons.${r.reasonCode}`)}</p>}
        <p className="text-muted-foreground">
          {r.application ? t("adopted") : t("noWrite")}
        </p>
        {segment && (
          <p>
            {t("testSegment")}: {segment.startSeconds / 60}–
            {segment.endSeconds / 60} min
          </p>
        )}
        {r.observations.map((o) => (
          <p key={o.metric}>
            {fitnessMessageKey("observations", o.metric)
              ? t(fitnessMessageKey("observations", o.metric)!)
              : o.metric}
            : {o.value.toFixed(1)} {o.unit}
          </p>
        ))}
        <details>
          <summary className="cursor-pointer">{t("details")}</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>
              {fitnessMessageKey("methods", r.method.id)
                ? t(fitnessMessageKey("methods", r.method.id)!)
                : r.method.id}{" "}
              · {fitnessEvidenceSummary(r.evidence, t)}
            </p>
            <p>
              {fitnessDateTime(r.evidence.from, locale, r.timezone)} —{" "}
              {fitnessDateTime(r.evidence.to, locale, r.timezone)} {r.timezone}
            </p>
            {r.evidence.checks.map((c) => (
              <p key={c.code}>{fitnessCheckText(c, t)}</p>
            ))}
            {r.limitations.map((v) => (
              <p key={v}>
                {t(
                  fitnessMessageKey("limitations", v) ?? "limitations.unknown",
                )}
              </p>
            ))}
          </div>
        </details>
        {r.applyOptions.map((o) => (
          <div
            key={o.id}
            className="space-y-2 rounded-md bg-background/80 p-3 dark:bg-background/45"
          >
            <p>
              {o.effectiveDate} ·{" "}
              {o.changes
                .map(
                  (c) =>
                    `${fitnessMetricLabel(c.metric)} ${c.currentValue ?? "—"} → ${c.value} ${c.unit}`,
                )
                .join(", ")}
            </p>
            <p>{t(fitnessAdoptionMessageKey(r))}</p>
            <p className="text-muted-foreground">{t("zoneImpact")}</p>
          </div>
        ))}
        {hasActions && (
          <div className="flex flex-wrap items-center gap-2">
            {r.applyOptions.map((o) => (
              <Button
                key={o.id}
                size="sm"
                disabled={
                  locked ||
                  !!r.application ||
                  o.changes.some((c) => c.metric === "VDOT") ||
                  Date.parse(o.expiresAt) <= renderedAt
                }
                onClick={() =>
                  void send(t("apply"), {
                    kind: "fitness_apply_confirmation",
                    calculationId: r.calculationId,
                    applyOptionId: o.id,
                    proposalDigest: o.proposalDigest,
                  })
                }
              >
                {t("apply")}
              </Button>
            ))}
            {canRecompute && (
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() =>
                  void send(t("recompute"), {
                    kind: "fitness_recompute",
                    taskId: r.taskId,
                    calculationId: r.calculationId,
                  })
                }
              >
                {t("recompute")}
              </Button>
            )}
            {canOfferWorkout && (
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() =>
                  void send(t("testDraft"), {
                    kind: "fitness_workout_request",
                    taskId: r.taskId,
                  })
                }
              >
                {t("testDraft")}
              </Button>
            )}
          </div>
        )}
        {sent && <p role="status">{t("sent")}</p>}
        {error && <p role="alert">{t("failure")}</p>}
      </div>
    </CoachCard>
  );
}

export function FitnessTrackingCard({
  input,
  onAction,
  disabled,
}: {
  input: unknown;
  disabled?: boolean;
  onAction?: (text: string, content: unknown) => void | Promise<void>;
}) {
  const t = useTranslations("AiCoachPage.fitnessAssessment");
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const r = input as {
    kind?: string;
    taskId?: string;
    workoutId?: string;
    workoutName?: string;
  };
  if (r?.kind !== "fitness_tracking_offer" || !r.taskId || !r.workoutId)
    return null;
  const send = async (action: "START" | "STOP") => {
    if (disabled || sent || busy) return;
    setBusy(true);
    setError(false);
    try {
      await onAction?.(
        t(
          action === "START" ? "tracking.startMessage" : "tracking.stopMessage",
        ),
        {
          kind: "fitness_tracking_reply",
          taskId: r.taskId,
          workoutId: r.workoutId,
          action,
        },
      );
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <CoachCard title={r.workoutName ?? t("tracking.title")}>
      <p className="mb-3 text-sm">{t("tracking.description")}</p>
      <div className="flex gap-2">
        <Button
          disabled={disabled || sent || busy || !onAction}
          onClick={() => void send("START")}
        >
          {t("tracking.start")}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || sent || busy || !onAction}
          onClick={() => void send("STOP")}
        >
          {t("tracking.stop")}
        </Button>
      </div>
      {error && <p role="alert">{t("failure")}</p>}
    </CoachCard>
  );
}

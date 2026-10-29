"use client";

import { useMemo } from "react";
import {
  useCoachActions,
  useCoachThread,
  useCoachMessage,
} from "./coach-chat-provider";
import { useTranslations } from "next-intl";
import { localizedAiOperationError } from "@/lib/ai-operation-errors";
import { aiOperationErrorReason } from "@shared/ai-operation-errors";
import type {
  CoachTurnErrorData,
  CoachTurnErrorReason,
} from "@shared/coach-turn-error";
import { localizedCoachTurnError } from "@/lib/coach-turn-errors";
import { useManagedAiAccessRecovery } from "@deployment/managed-ui";
import { CoachTranscriptMetaRow } from "./coach-transcript-meta-row";
import {
  buildCoachTurnErrorItem,
  shouldOfferCoachModelSwitch,
  shouldOfferCoachRetry,
} from "./coach-turn-error-model";
import { useCoachTurnRetry } from "./coach-turn-retry-context";

/**
 * Inline failure card for an assistant turn that produced no answer. It is
 * rendered from the streamed / persisted `coach-turn-error` part, so it looks
 * the same live and after a refresh. Only the latest turn can be retried.
 */
export function CoachTurnErrorCard({
  turnError,
  messageId,
  isLastMessage,
}: {
  turnError: CoachTurnErrorData;
  messageId: string;
  isLastMessage: boolean;
}) {
  const t = useTranslations("AiCoachPage.transcript");
  const operationT = useTranslations("AiOperationErrors");
  const turnErrorT = useTranslations("CoachTurnErrors");
  const retryControls = useCoachTurnRetry();
  const messageRuntime = useCoachActions();
  const isThreadRunning = useCoachThread((state) => state.isRunning);

  const item = useMemo(
    () =>
      buildCoachTurnErrorItem(turnError, `${messageId}:turn-error`, {
        localizeOperationCode: (code) =>
          localizedAiOperationError(code, operationT),
        localizeTurnError: (error) =>
          localizedCoachTurnError(error, (reason: CoachTurnErrorReason) =>
            turnErrorT(reason),
          ),
      }),
    [messageId, operationT, turnError, turnErrorT],
  );

  const run = useCoachMessage((message) =>
    message.ui.parts.find((part) => part.type === "data-coach-run"),
  );
  const isLatestAttempt = useCoachThread((state) =>
    run?.type === "data-coach-run"
      ? state.messages.findLast((message) =>
          message.ui.parts.some(
            (part) =>
              part.type === "data-coach-run" &&
              part.data.runId === run.data.runId,
          ),
        )?.id === messageId
      : isLastMessage,
  );
  const canRetry =
    isLatestAttempt &&
    shouldOfferCoachRetry(turnError) &&
    retryControls != null &&
    (run?.type !== "data-coach-run" ||
      (["failed", "interrupted"].includes(run.data.status) &&
        !run.data.retryBlocked));
  const retry = (options?: { thinkingEnabled?: boolean }) => {
    if (!retryControls || isThreadRunning) return;
    retryControls.prepareRetry(options);
    void messageRuntime.retry(messageId);
  };

  const secondaryAction =
    canRetry && shouldOfferCoachModelSwitch(turnError)
      ? {
          label: retryControls.thinkingEnabled
            ? t("switchToStandardAndRetry")
            : t("switchToDeepAndRetry"),
          onClick: () =>
            retry({ thinkingEnabled: !retryControls.thinkingEnabled }),
          disabled: isThreadRunning,
        }
      : undefined;
  const operationReason = aiOperationErrorReason(turnError.code);
  const managedRecovery = useManagedAiAccessRecovery(operationReason);

  return (
    <>
      <CoachTranscriptMetaRow
        item={{ ...item, retryable: canRetry }}
        onRetry={canRetry ? () => retry() : undefined}
        retryDisabled={isThreadRunning}
        recoveryAction={managedRecovery.recoveryAction}
        secondaryAction={secondaryAction}
      />
      {managedRecovery.overlay}
    </>
  );
}

"use client";

import { CoachTranscriptMetaRow } from "./coach-transcript-meta-row";
import { buildCoachTranscriptErrorItem } from "./coach-transcript-model";

type CoachErrorNoticeProps = {
  error: Error;
  onRetry?: () => void;
  retryDisabled?: boolean;
};

export function CoachErrorNotice({
  error,
  onRetry,
  retryDisabled,
}: CoachErrorNoticeProps) {
  return (
    <CoachTranscriptMetaRow
      item={buildCoachTranscriptErrorItem({
        error,
        retryable: typeof onRetry === "function",
      })}
      onRetry={onRetry}
      retryDisabled={retryDisabled}
    />
  );
}

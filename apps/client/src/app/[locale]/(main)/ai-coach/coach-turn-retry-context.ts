"use client";

import { createContext, useContext } from "react";

export type CoachTurnRetryControls = {
  /** Current model mode (`true` = reasoning). */
  thinkingEnabled: boolean;
  /**
   * Prepares a retry of a failed turn: drops the stale idempotency key so the
   * retry is a new AI operation and, when given, switches the model mode
   * before the request is built.
   */
  prepareRetry: (options?: { thinkingEnabled?: boolean }) => void;
};

export const CoachTurnRetryContext =
  createContext<CoachTurnRetryControls | null>(null);

export function useCoachTurnRetry() {
  return useContext(CoachTurnRetryContext);
}

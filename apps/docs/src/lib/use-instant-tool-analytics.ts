"use client";

import { useEffect, useRef } from "react";
import { trackToolEvent, type ToolId } from "@/lib/tool-analytics";

/** Tracks one lifecycle when an instant calculator transitions to a valid result. */
export function useInstantToolAnalytics(
  toolId: ToolId,
  action: string,
  hasValidResult: boolean,
) {
  const wasValid = useRef(false);

  useEffect(() => {
    if (hasValidResult && !wasValid.current) {
      trackToolEvent("tool_started", toolId, { action });
      trackToolEvent("tool_completed", toolId, { action });
    }
    wasValid.current = hasValidResult;
  }, [action, hasValidResult, toolId]);
}

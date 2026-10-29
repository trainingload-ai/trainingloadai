import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import {
  getAiInfo,
  getAiInfoStream,
} from "@/api/activity";
import { queryKeys } from "@/lib/query-keys";
import { useEffect, useState } from "react";
import {
  fetchAiOperation,
  type AiOperationResult,
} from "@/api/ai-operations";
import {
  aiOperationRequestFingerprint,
  operationIdForRequest,
  clearPendingAiOperation,
} from "@/lib/ai-operation-recovery";
import { localizedAiOperationError } from "@/lib/ai-operation-errors";

export function useAiAnalysis(activityId: string, useCache = true) {
  const locale = useLocale();
  const requestFingerprint = aiOperationRequestFingerprint({
    activityId,
    locale,
    useCache,
  });

  return useQuery({
    queryKey: queryKeys.activity.aiDigest(activityId, locale, useCache),
    queryFn: () =>
      getAiInfo(
        activityId,
        locale,
        useCache,
        "DEFAULT",
        operationIdForRequest({
          kind: "ACTIVITY_REVIEW",
          entityId: activityId,
          requestFingerprint,
        }),
      ),
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

export function useAiAnalysisStream(
  activityId: string,
  useCache = true,
  /** 递增可强制重新拉流（同 activityId / useCache 下再次解读） */
  restartKey = 0,
  /** 为 false 时不请求 SSE（例如已有复盘或等待 Worker） */
  enabled = true,
) {
  const locale = useLocale();
  const operationErrorT = useTranslations("AiOperationErrors");
  const queryClient = useQueryClient();
  const [data, setData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [operation, setOperation] = useState<AiOperationResult | null>(null);
  const purpose = "DEFAULT" as const;

  useEffect(() => {
    if (!activityId || !enabled) {
      if (!enabled) {
        setIsLoading(false);
        setIsDone(false);
        setData("");
        setError(null);
      }
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    let active = true;
    const requestFingerprint = aiOperationRequestFingerprint({
      activityId,
      locale,
      purpose,
      restartKey,
      useCache,
    });
    const operationId = operationIdForRequest({
      kind: "ACTIVITY_REVIEW",
      entityId: activityId,
      requestFingerprint,
    });

    setIsLoading(true);
    setError(null);
    setIsDone(false);
    setData("");
    setOperation(null);

    const queue: string[] = [];
    let isProcessingQueue = false;

    const processQueue = async () => {
      if (isProcessingQueue || queue.length === 0 || !active) return;
      isProcessingQueue = true;

      while (queue.length > 0 && active) {
        const chunk = queue.shift();
        if (chunk) {
          setData((prev) => prev + chunk);
          // Adjust delay based on chunk length to smooth out large chunks
          // Basic delay: 100ms, max delay: 500ms (approx 5x slower than before)
          const delay = Math.min(Math.max(chunk.length * 10, 100), 500);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      isProcessingQueue = false;
      // If new items arrived while processing, restart
      if (queue.length > 0 && active) {
        processQueue();
      }
    };

    getAiInfoStream(
      activityId,
      (chunk) => {
        if (active) {
          queue.push(chunk);
          processQueue();
        }
      },
      locale,
      useCache,
      signal,
      purpose,
      setOperation,
      operationId,
    )
      .then(() => {
        if (active) {
          setIsDone(false);
          // Wait for queue to empty before setting isLoading to false
          const checkQueue = setInterval(() => {
            if (queue.length === 0) {
              clearInterval(checkQueue);
              if (active) {
                setIsLoading(false);
                setIsDone(true);
              }
            }
          }, 100);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof DOMException && e.name === "AbortError") {
            return;
          }
          const localized = localizedAiOperationError(e, operationErrorT);
          setError(localized ? new Error(localized) : e);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activityId,
    operationErrorT,
    locale,
    useCache,
    restartKey,
    enabled,
    purpose,
  ]);

  useEffect(() => {
    if (
      !operation ||
      (operation.status !== "STARTED" && operation.status !== "RUNNING")
    ) {
      if (operation) {
        clearPendingAiOperation(
          "ACTIVITY_REVIEW",
          activityId,
          operation.operationId,
        );
      }
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const action = await fetchAiOperation(operation.operationId);
        if (!active) return;
        setOperation(action);
        if (action.status === "COMPLETED") {
          clearPendingAiOperation(
            "ACTIVITY_REVIEW",
            activityId,
            action.operationId,
          );
          setIsLoading(false);
          setIsDone(true);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.activity.aiReview(activityId, locale),
          });
          return;
        }
        if (action.status === "FAILED" || action.status === "ABANDONED") {
          clearPendingAiOperation(
            "ACTIVITY_REVIEW",
            activityId,
            action.operationId,
          );
          setError(new Error(action.errorCode || "AI analysis failed"));
          setIsLoading(false);
          setIsDone(true);
          return;
        }
      } catch {
        // A transient status read must not create a duplicate operation.
      }
      if (active) timer = setTimeout(poll, 1_500);
    };
    setIsLoading(true);
    setIsDone(false);
    timer = setTimeout(poll, 500);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [activityId, operation, locale, queryClient]);

  return { data, isLoading, isDone, error, operation };
}

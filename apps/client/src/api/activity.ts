import {
  apiFetch,
  apiDownloadFetch,
  apiFetchErrorFromResponse,
  ApiFetchError,
} from "@/lib/api";
import { notifyAiDataConsentRequiredFromResponse } from "@/lib/ai-data-consent-events";
import { getRegion } from "@/lib/config";
import type {
  ActivityStrengthExerciseV1,
  ActivityStrengthResponse,
} from "../../../../packages/shared/strength-activity";
import type { StrengthLoadV1 } from "../../../../packages/shared/strength-workout-ir";
import type { AiModelPurpose, AiOperationResult } from "@/api/ai-operations";

function getProxyApiUrl(url: string): string {
  return typeof window === "undefined" ? url : `/api/proxy${url}`;
}

export const deleteActivity = async (
  id: string,
): Promise<boolean | undefined> => {
  return await apiFetch(`/activities/${id}`, {
    method: "DELETE",
  });
};

export type UpdateActivitySessionRpeResult = {
  hashId: string;
  activityId: number;
  sessionRpe: number | null;
};

/** PATCH session RPE（1–10）；传 `null` 清除 */
export const updateActivitySessionRpe = async (
  hashId: string,
  sessionRpe: number | null,
): Promise<UpdateActivitySessionRpeResult | undefined> => {
  return await apiFetch<UpdateActivitySessionRpeResult>(
    `/activities/${hashId}/session-rpe`,
    {
      method: "PATCH",
      body: JSON.stringify({ sessionRpe }),
    },
  );
};

export const fetchActivityStrength = async (
  hashId: string,
): Promise<ActivityStrengthResponse | undefined> => {
  return await apiFetch<ActivityStrengthResponse>(
    `/activities/${hashId}/strength`,
  );
};

export const replaceActivityStrength = async (
  hashId: string,
  exercises: ActivityStrengthExerciseV1[],
): Promise<ActivityStrengthResponse | undefined> => {
  return await apiFetch<ActivityStrengthResponse>(
    `/activities/${hashId}/strength`,
    {
      method: "PUT",
      body: JSON.stringify({
        exercises: exercises.map(({ id: _exerciseId, sets, ...exercise }) => ({
          ...exercise,
          sets: sets.map(({ id: _setId, ...set }) => set),
        })),
      }),
    },
  );
};

export type CompleteActivityStrengthSetInput = {
  completed?: boolean;
  completedReps?: number;
  completedDurationSeconds?: number;
  load?: StrengthLoadV1;
  actualRpe?: number;
  actualRir?: number;
  source?: string;
};

export const completeActivityStrengthSet = async (
  hashId: string,
  setId: string,
  input: CompleteActivityStrengthSetInput,
): Promise<ActivityStrengthResponse | undefined> => {
  return await apiFetch<ActivityStrengthResponse>(
    `/activities/${hashId}/strength/sets/${setId}/complete`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
};

export type ActivityAiReviewApiResult =
  | { found: false; reason: "ACTIVITY_NOT_FOUND" }
  | {
      found: true;
      activityId: number;
      status: string | null;
      markdown: string | null;
      summary: string | null;
      verdict: string | null;
      evidenceHash: string | null;
      updatedAt: string | null;
    };

export const fetchActivityAiReview = async (
  hashId: string,
  lang: string,
): Promise<ActivityAiReviewApiResult | undefined> => {
  const q = new URLSearchParams();
  if (lang) q.set("lang", lang);
  return await apiFetch<ActivityAiReviewApiResult>(
    `/activities/${hashId}/ai-review?${q.toString()}`,
  );
};

export const getAiInfo = async (
  id: string,
  lang?: string,
  useCache = true,
  purpose: AiModelPurpose = "DEFAULT",
  operationId = crypto.randomUUID(),
): Promise<string | undefined> => {
  const query = new URLSearchParams();
  query.set("useCache", String(useCache));
  if (lang) query.set("lang", lang);
  query.set("operationId", operationId);
  query.set("purpose", purpose);
  const url = `/ai/activity-reviews/${encodeURIComponent(id)}/stream?${query.toString()}`;
  return await apiFetch(url);
};

export const getAiInfoStream = async (
  id: string,
  onMessage: (chunk: string) => void,
  lang?: string,
  useCache = true,
  signal?: AbortSignal,
  purpose: AiModelPurpose = "DEFAULT",
  onOperation?: (operation: AiOperationResult) => void,
  operationId = crypto.randomUUID(),
): Promise<void> => {
  const query = new URLSearchParams();
  query.set("useCache", String(useCache));
  if (lang) query.set("lang", lang);
  query.set("operationId", operationId);
  query.set("purpose", purpose);
  const url = `/ai/activity-reviews/${encodeURIComponent(id)}/stream?${query.toString()}`;

  const response = await fetch(getProxyApiUrl(url), {
    signal,
    headers: {
      "X-Region": getRegion(),
      ...(lang ? { "x-lang": lang } : {}),
    },
    credentials: "include",
  });

  if (!response.ok || !response.body) {
    await notifyAiDataConsentRequiredFromResponse(response);
    throw await apiFetchErrorFromResponse(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const processLine = (line: string) => {
    if (line.trim() === "" || !line.startsWith("data: ")) return;
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line.substring(6));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return;
      }
      data = parsed as Record<string, unknown>;
    } catch (error) {
      console.error("Error parsing SSE data", error, line);
      return;
    }

    const nested =
      data.data && typeof data.data === "object" && !Array.isArray(data.data)
        ? (data.data as Record<string, unknown>)
        : null;
    const event = nested ?? data;
    if (event.type === "error") {
      const code =
        typeof event.code === "string" ? event.code : "AI_STREAM_ERROR";
      const message =
        typeof event.message === "string" && event.message.trim()
          ? event.message
          : code;
      throw new ApiFetchError(message, 500, code, event.data, true);
    }
    if (typeof event.content === "string") onMessage(event.content);
    if (
      event.type === "operation" &&
      event.operation &&
      typeof event.operation === "object"
    ) {
      onOperation?.(event.operation as AiOperationResult);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) processLine(line);
  }
  processLine(buffer + decoder.decode());
};

/**
 * Export as specified file type (gpx/fit/tcx) by activity hashId, return Blob for download
 */
export const exportActivityByHashId = async (
  fileHashId: string,
  type: "gpx" | "fit" | "tcx",
): Promise<{ blob: Blob; filename: string }> => {
  return await apiDownloadFetch("/activities/convert/byId", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fileHashId, type }),
  });
};

/**
 * 检查活动分析是否完成，返回 parquet 文件是否存在
 * @param hashId 活动 hashId
 * @returns parquet 文件是否存在
 */
export const checkParquetFileGenerated = async (
  hashId: string,
): Promise<boolean | undefined> => {
  return await apiFetch(`/activities/${hashId}/analysis`);
};

const activityApi = {
  deleteActivity,
  exportActivityByHashId,
};

export default activityApi;

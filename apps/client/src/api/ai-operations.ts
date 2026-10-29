import { apiFetch } from "@/lib/api";

export type AiModelPurpose = "DEFAULT" | "REASONING";

export type AiOperationStatus =
  | "STARTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "ABANDONED";

export type AiOperationRecovery =
  | {
      kind: "COACH_SESSION";
      sid: string;
      messageId: string;
      branchId?: string | null;
    }
  | {
      kind: "ACTIVITY_REVIEW";
      activityHashId: string;
      reviewId: string;
    }
  | Record<string, unknown>
  | null;

export type AiOperationResult = {
  operationId: string;
  status: AiOperationStatus;
  purpose: AiModelPurpose;
  replayed: boolean;
  pending: boolean;
  recovery: AiOperationRecovery;
  completedAt: string | null;
  errorCode: string | null;
};

export async function fetchAiOperation(
  operationId: string,
  signal?: AbortSignal,
) {
  return (await apiFetch<AiOperationResult>(
    `/ai/operations/${encodeURIComponent(operationId)}`,
    { suppressErrorToast: true, signal },
  ))!;
}

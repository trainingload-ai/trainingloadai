import { ApiFetchError } from "@/lib/api-error";
import {
  aiOperationErrorReason,
  asAiOperationErrorCode,
} from "@shared/ai-operation-errors";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function collectErrorCandidates(error: unknown): unknown[] {
  const candidates: unknown[] = [error];
  if (error instanceof ApiFetchError) {
    candidates.push(error.errorCode, error.message);
  } else if (error instanceof Error) {
    candidates.push(error.message);
  }

  const record = asRecord(error);
  if (record) {
    candidates.push(
      record.errorCode,
      record.error_code,
      record.code,
      record.message,
    );
  }

  const rawText =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof record?.message === "string"
          ? record.message
          : "";
  const parsed = rawText ? parseJsonObject(rawText) : null;
  if (parsed) {
    candidates.push(
      parsed,
      parsed.errorCode,
      parsed.error_code,
      parsed.code,
      parsed.message,
    );
  }

  return candidates;
}

export function aiOperationErrorCode(error: unknown) {
  for (const candidate of collectErrorCandidates(error)) {
    const code = asAiOperationErrorCode(candidate);
    if (code) return code;
  }
  return null;
}

export function localizedAiOperationError(
  error: unknown,
  translate: (key: string) => string,
) {
  const code = aiOperationErrorCode(error);
  const reason = aiOperationErrorReason(code);
  return reason ? translate(reason) : null;
}

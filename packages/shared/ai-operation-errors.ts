/**
 * Runtime-neutral AI operation failures shared by Self-host server and clients.
 *
 * Deployment-specific implementations may translate private policy errors to
 * this vocabulary at the Managed boundary. Core only exposes stable operation
 * state and recovery semantics.
 */
export const AI_OPERATION_ERROR_CODES = [
  "AI_ACCESS_REQUIRED",
  "AI_OPERATION_IN_PROGRESS",
  "AI_OPERATION_SETTLEMENT_PENDING",
  "AI_MODEL_PURPOSE_UNAVAILABLE",
] as const;

export type AiOperationErrorCode = (typeof AI_OPERATION_ERROR_CODES)[number];

export type AiOperationErrorReason =
  | "accessRequired"
  | "inProgress"
  | "settlementPending"
  | "purposeUnavailable";

const REASONS = {
  AI_ACCESS_REQUIRED: "accessRequired",
  AI_OPERATION_IN_PROGRESS: "inProgress",
  AI_OPERATION_SETTLEMENT_PENDING: "settlementPending",
  AI_MODEL_PURPOSE_UNAVAILABLE: "purposeUnavailable",
} as const satisfies Record<AiOperationErrorCode, AiOperationErrorReason>;

const CODE_SET = new Set<string>(AI_OPERATION_ERROR_CODES);

export function asAiOperationErrorCode(
  value: unknown,
): AiOperationErrorCode | null {
  return typeof value === "string" && CODE_SET.has(value)
    ? (value as AiOperationErrorCode)
    : null;
}

export function aiOperationErrorReason(
  value: unknown,
): AiOperationErrorReason | null {
  const code = asAiOperationErrorCode(value);
  return code ? REASONS[code] : null;
}

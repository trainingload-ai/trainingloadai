import {
  ConflictException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

export type AiOperationErrorCode =
  | 'AI_ACCESS_REQUIRED'
  | 'AI_OPERATION_IN_PROGRESS'
  | 'AI_OPERATION_COMPLETION_PENDING'
  | 'AI_MODEL_PURPOSE_UNAVAILABLE';

const CODES = new Set<AiOperationErrorCode>([
  'AI_ACCESS_REQUIRED',
  'AI_OPERATION_IN_PROGRESS',
  'AI_OPERATION_COMPLETION_PENDING',
  'AI_MODEL_PURPOSE_UNAVAILABLE',
]);

export function isAiOperationErrorCode(
  value: unknown,
): value is AiOperationErrorCode {
  return CODES.has(value as AiOperationErrorCode);
}

/** Admission/lease contention is a wait condition, not a failed model attempt. */
export function isAiOperationBusyError(error: unknown): boolean {
  const response = error instanceof HttpException ? error.getResponse() : error;
  const code =
    typeof response === 'string'
      ? response
      : response && typeof response === 'object' && 'code' in response
        ? response.code
        : error instanceof Error
          ? error.message
          : null;
  return (
    code === 'AI_OPERATION_IN_PROGRESS' ||
    code === 'AI_OPERATION_COMPLETION_PENDING' ||
    code === 'AI_OPERATION_SETTLEMENT_PENDING'
  );
}

export function aiOperationError(
  code: AiOperationErrorCode,
  data?: Record<string, unknown>,
) {
  const body = { code, message: code, ...(data ? { data } : {}) };
  if (
    code === 'AI_OPERATION_IN_PROGRESS' ||
    code === 'AI_OPERATION_COMPLETION_PENDING'
  ) {
    return new ConflictException(body);
  }
  if (code === 'AI_ACCESS_REQUIRED') {
    return new HttpException(body, HttpStatus.PAYMENT_REQUIRED);
  }
  return new ServiceUnavailableException(body);
}

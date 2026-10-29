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

import {
  errorHttpStatus,
  isAbortError,
} from "@shared/runtime-reliability";

export class ApiFetchError<T = unknown> extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
    readonly data?: T,
    readonly suppressNotification = false,
  ) {
    super(message);
    this.name = "ApiFetchError";
  }
}

export type ApiErrorKind =
  | "authentication"
  | "permission"
  | "not-found"
  | "validation"
  | "rate-limit"
  | "network"
  | "server"
  | "cancelled"
  | "unknown";

export function classifyApiError(error: unknown): ApiErrorKind {
  if (isAbortError(error)) return "cancelled";

  const status = errorHttpStatus(error);
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 404) return "not-found";
  if (status === 408 || status === 425 || status === 429) {
    return "rate-limit";
  }
  if (status != null && status >= 500) return "server";
  if (status != null && status >= 400) return "validation";

  if (
    error instanceof ApiFetchError &&
    (error.status === 0 || error.errorCode === "NETWORK_ERROR")
  ) {
    return "network";
  }

  return "unknown";
}

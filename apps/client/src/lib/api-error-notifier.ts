import { toast } from "sonner";

import {
  ApiFetchError,
  classifyApiError,
  type ApiErrorKind,
} from "./api-error";
import { isAuthFailureInProgress } from "./auth-failure";

export type ApiErrorNoticeSurface = "background" | "page" | "action";

export type ApiErrorNoticeContext = {
  scope?: string;
  surface?: ApiErrorNoticeSurface;
  message?: string;
};

type ErrorNotifierOptions = {
  notify: (message: string, options: { id: string }) => void;
  now?: () => number;
  dedupeWindowMs?: number;
};

const DEFAULT_DEDUPE_WINDOW_MS = 4_000;
const MAX_TRACKED_NOTICES = 64;

function shouldNotify(kind: ApiErrorKind, surface: ApiErrorNoticeSurface) {
  if (
    kind === "authentication" ||
    kind === "cancelled" ||
    kind === "not-found"
  ) {
    return false;
  }

  // Validation errors belong next to the field/action that caused them.
  if (kind === "validation" && surface !== "action") return false;

  return true;
}

function noticeMessage(error: unknown, context: ApiErrorNoticeContext) {
  if (context.message?.trim()) return context.message.trim();
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Request failed. Please try again.";
}

export function createApiErrorNotifier({
  notify,
  now = Date.now,
  dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS,
}: ErrorNotifierOptions) {
  const lastNotifiedAt = new Map<string, number>();

  return {
    report(error: unknown, context: ApiErrorNoticeContext = {}) {
      if (error instanceof ApiFetchError && error.suppressNotification) {
        return false;
      }

      const kind = classifyApiError(error);
      const surface = context.surface ?? "background";
      if (!shouldNotify(kind, surface)) return false;

      const scope = context.scope?.trim() || "global";
      const key = `${kind}:${scope}`;
      const currentTime = now();
      const previousTime = lastNotifiedAt.get(key);
      if (
        previousTime !== undefined &&
        currentTime - previousTime < dedupeWindowMs
      ) {
        return false;
      }

      if (lastNotifiedAt.size >= MAX_TRACKED_NOTICES) {
        for (const [trackedKey, timestamp] of lastNotifiedAt) {
          if (currentTime - timestamp >= dedupeWindowMs) {
            lastNotifiedAt.delete(trackedKey);
          }
        }
      }

      lastNotifiedAt.set(key, currentTime);
      notify(noticeMessage(error, context), {
        id: `api-error:${key}`,
      });
      return true;
    },
  };
}

const apiErrorNotifier = createApiErrorNotifier({
  notify: (message, options) => {
    toast.error(message, options);
  },
});

export function reportApiError(
  error: unknown,
  context?: ApiErrorNoticeContext,
) {
  if (isAuthFailureInProgress()) return false;
  return apiErrorNotifier.report(error, context);
}

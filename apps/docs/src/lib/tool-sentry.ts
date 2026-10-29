"use client";

import * as Sentry from "@sentry/nextjs";
import { isFileInputToolRequestError } from "./tool-request-error";

type Primitive = string | number | boolean | null | undefined;

type ToolFailureProperties = Record<string, Primitive>;

type CaptureToolFailureArgs = {
  action: string;
  endpoint?: string;
  error: unknown;
  properties?: ToolFailureProperties;
  reason: string;
  tool: string;
};

function cleanProperties(properties: ToolFailureProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value != null),
  );
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

export function captureToolFailure({
  action,
  endpoint,
  error,
  properties,
  reason,
  tool,
}: CaptureToolFailureArgs) {
  // 已确认由上传文件导致的 4xx 是产品反馈，不是应用异常；保留业务埋点，
  // 但不要作为 Sentry error 上报。
  if (isFileInputToolRequestError(error)) return;

  try {
    const context = cleanProperties({
      action,
      endpoint,
      reason,
      tool,
      ...properties,
    });

    Sentry.withScope((scope) => {
      scope.setLevel("error");
      scope.setTag("area", "docs_tools");
      scope.setTag("tool", tool);
      scope.setTag("tool_action", action);
      scope.setTag("tool_failure_reason", reason);
      scope.setContext("tool", context);
      scope.setFingerprint(["docs-tool-failure", tool, action, reason]);
      Sentry.captureException(normalizeError(error));
    });
  } catch {
    // Error monitoring should never affect the tool experience.
  }
}

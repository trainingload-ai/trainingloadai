import type { ErrorEvent } from "@sentry/nextjs";
import { LACTATE_ENGINE_VERSION } from "@trainingloadai/shared/lactate-analysis";

/** This route contains manually entered health data; retain code locations only. */
export function sanitizeLactateSentryEvent(
  event: ErrorEvent,
  pathname: string,
): ErrorEvent {
  if (!/(?:^|\/)lactate-curve-calculator\/?$/.test(pathname)) return event;
  const action = event.tags?.tool_action;
  const stage =
    typeof action === "string" &&
    ["load", "analysis", "visualization", "export", "clipboard"].includes(
      action,
    )
      ? action
      : "unknown";
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    level: event.level,
    tags: {
      area: "docs_tools",
      tool: "lactate_curve_calculator",
      tool_action: stage,
      engine_version: LACTATE_ENGINE_VERSION,
    },
    fingerprint: ["docs-tool-failure", "lactate_curve_calculator", stage],
    exception: {
      values: event.exception?.values?.map((value) => ({
        type: "Error",
        value: "Lactate tool error (input details removed)",
        stacktrace: {
          frames: value.stacktrace?.frames?.map((frame) => ({
            function: frame.function,
            filename: frame.filename?.split(/[?#]/, 1)[0],
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}

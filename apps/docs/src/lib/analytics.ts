import * as Sentry from "@sentry/nextjs";
import { capturePostHogEvent, isPostHogEnabled } from "@/lib/posthog-client";
import { toGa4ToolName } from "@shared/product-analytics";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

function cleanProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value != null),
  );
}

function getStandardProperties() {
  if (typeof window === "undefined") return {};

  return {
    app: "docs",
    page_path: window.location.pathname,
  };
}

const TOOL_ERROR_CODES: Record<string, string> = {
  clipboard_failed: "unknown",
  export_failed: "conversion_failed",
  file_missing: "missing_input",
  file_too_large: "invalid_file",
  file_type_unsupported: "unsupported_format",
  invalid_file: "invalid_file",
  invalid_input: "missing_input",
  parse_failed: "parse_failed",
  request_failed: "network_error",
  response_invalid: "parse_failed",
  unknown: "unknown",
  worker_unavailable: "parse_failed",
};

function ga4ToolCategory(toolName: string | undefined) {
  if (!toolName) return undefined;
  if (toolName.includes("calculator")) return "calculator";
  if (
    toolName.includes("converter") ||
    toolName.includes("file_viewer") ||
    /^(fit|gpx|tcx)_to_(fit|gpx|tcx)$/.test(toolName)
  ) {
    return "file_tool";
  }
  if (toolName.includes("workout_review")) return "ai_tool";
  if (toolName.includes("plan_generator")) return "plan_tool";
  return "other";
}

function localeFromPath(path: string | undefined) {
  return path?.split("/").filter(Boolean)[0];
}

function sourceContextFromPlacement(placement: string | undefined) {
  return placement === "result" ||
    placement === "result_sidebar" ||
    placement === "post_conversion_prompt"
    ? "tool_result"
    : "tool_page";
}

function toGa4Event(
  eventName: string,
  payload: AnalyticsProperties,
): { name: string; properties: AnalyticsProperties } | null {
  const toolName = toGa4ToolName(
    typeof payload.tool_id === "string" ? payload.tool_id : undefined,
  );
  const pagePath =
    typeof payload.page_path === "string" ? payload.page_path : undefined;
  const locale =
    typeof payload.lang === "string"
      ? payload.lang
      : localeFromPath(pagePath);

  if (eventName === "tool_started" || eventName === "tool_completed") {
    return {
      name: eventName === "tool_started" ? "tool_start" : "tool_success",
      properties: cleanProperties({
        tool_name: toolName,
        tool_category: ga4ToolCategory(toolName),
        page_path: pagePath,
        locale,
        result_type:
          typeof payload.output_format === "string"
            ? payload.output_format
            : typeof payload.status === "string"
              ? payload.status
              : undefined,
      }),
    };
  }

  if (eventName === "tool_failed") {
    // Clipboard failures happen after a valid result exists and must not turn a
    // successful tool run into a business-level tool_error.
    if (payload.error_code === "clipboard_failed") return null;
    const rawCode =
      typeof payload.error_code === "string" ? payload.error_code : "unknown";
    return {
      name: "tool_error",
      properties: cleanProperties({
        tool_name: toolName,
        tool_category: ga4ToolCategory(toolName),
        page_path: pagePath,
        locale,
        error_code: TOOL_ERROR_CODES[rawCode] ?? "unknown",
      }),
    };
  }

  if (eventName === "tool_app_cta_clicked") {
    const destination =
      typeof payload.destination === "string" ? payload.destination : undefined;
    return {
      name: "signup_click",
      properties: cleanProperties({
        source_page: pagePath,
        source_context: sourceContextFromPlacement(
          typeof payload.cta_placement === "string"
            ? payload.cta_placement
            : undefined,
        ),
        tool_name: toolName,
        cta_name:
          destination === "signup"
            ? "create_account"
            : destination === "ai_coach"
              ? "analyze_training"
              : destination === "plan_import"
                ? "save_result"
                : "start_free",
        locale,
      }),
    };
  }

  if (
    eventName === "marketing_cta_clicked" &&
    typeof payload.href === "string" &&
    payload.href.startsWith("https://app.trainingload.ai")
  ) {
    const location =
      typeof payload.location === "string" ? payload.location : "other";
    return {
      name: "signup_click",
      properties: cleanProperties({
        source_page: pagePath,
        source_context: location.includes("tool") ? "tool_page" : "other",
        cta_name: "start_free",
        locale,
      }),
    };
  }

  return { name: eventName, properties: payload };
}

export function fileAnalyticsProperties(file: File | null | undefined) {
  if (!file) return {};

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;

  return cleanProperties({
    file_extension: extension,
    file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
  });
}

export function getErrorDebugInfo(error: unknown) {
  if (error instanceof Error) {
    return cleanProperties({
      error_name: error.name || "Error",
      error_message: error.message || "unknown_error",
      error_stack: error.stack
        ? error.stack.split("\n").slice(0, 3).join(" | ").slice(0, 500)
        : undefined,
    });
  }

  if (typeof error === "string") {
    return cleanProperties({
      error_name: "ThrownString",
      error_message: error,
    });
  }

  try {
    return cleanProperties({
      error_name: "UnknownThrownValue",
      error_message: JSON.stringify(error),
    });
  } catch {
    return cleanProperties({
      error_name: "UnknownThrownValue",
      error_message: String(error),
    });
  }
}

export function trackMarketingEvent(
  eventName: string,
  properties: AnalyticsProperties = {},
) {
  if (typeof window === "undefined") return;

  const payload = cleanProperties({
    ...properties,
    ...getStandardProperties(),
  });

  try {
    const ga4Event = toGa4Event(eventName, payload);
    if (ga4Event) {
      window.gtag?.("event", ga4Event.name, ga4Event.properties);
    }
  } catch {
    // One analytics sink must never block another sink or the user path.
  }

  try {
    if (isPostHogEnabled()) capturePostHogEvent(eventName, payload);
  } catch {
    // One analytics sink must never block another sink or the user path.
  }

  try {
    Sentry.addBreadcrumb({
      category: "marketing",
      data: payload,
      level: eventName.endsWith("_failed") ? "warning" : "info",
      message: eventName,
    });
  } catch {
    // Sentry breadcrumbs must never block analytics or the user path.
  }
}

export function trackMarketingPageView(properties: AnalyticsProperties = {}) {
  if (!isPostHogEnabled()) return;

  const payload = cleanProperties({
    ...properties,
    ...getStandardProperties(),
  });

  try {
    capturePostHogEvent("$pageview", payload);
  } catch {
    // Analytics must never block the user path.
  }
}

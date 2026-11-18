import {
  LACTATE_ENGINE_VERSION,
  LACTATE_METHOD_IDS,
} from "@trainingloadai/shared/lactate-analysis";
import { trackToolEvent, type ToolEventName } from "./tool-analytics";
import { captureToolFailure } from "./tool-sentry";

export type LactateOrigin = "example" | "example_edited" | "user";
export const LACTATE_TOOL_ID = "lactate_curve_calculator";
const REASONS = [
  "invalid_value",
  "too_few_stages",
  "too_many_stages",
  "duplicate_intensity",
  "unsorted_stages",
  "fit_degenerate",
  "target_not_reached",
  "loglog_unavailable",
  "no_lactate_rise",
  "no_distance",
  "no_resting_sample",
  "few_stages",
  "early_dip",
  "final_not_rising",
  "uneven_steps",
  "threshold_at_edge",
  "negative_fit",
  "invalid_pair",
  "file_too_large",
  "parse_failed",
  "invalid_input",
  "too_many_rows",
  "column_mapping",
  "no_applicable_method",
  "runtime_failed",
  "export_failed",
  "clipboard_failed",
] as const;
const ALLOWED: Record<string, readonly string[]> = {
  input_origin: ["example", "example_edited", "user"],
  input_method: ["example", "manual", "paste", "csv"],
  sport: ["cycling", "running"],
  lang: ["en", "zh", "zh-hant", "ja", "de", "fr", "es", "it", "ko", "pt-BR"],
  status: ["complete", "partial", "unavailable"],
  stage: [
    "validation",
    "parsing",
    "load",
    "analysis",
    "visualization",
    "export",
    "clipboard",
  ],
  action: [
    "analyze",
    "method_selected",
    "method_explained",
    "print_opened",
    "csv",
    "copy",
  ],
  reason_code: REASONS,
  method_id: LACTATE_METHOD_IDS,
  point_count_bucket: ["4-5", "6-10", "11-20", "21-30"],
  export_format: ["csv"],
  output_format: ["lactate_analysis"],
  file_extension: ["csv"],
  file_size_bucket: ["0-16KiB", "16-256KiB", "over-limit"],
  error_code: [
    "invalid_input",
    "parse_failed",
    "request_failed",
    "unknown",
    "export_failed",
    "clipboard_failed",
  ],
  destination: ["signup", "app_home"],
  cta_placement: ["result", "tool_footer"],
  renderer: ["svg"],
  visualization_status: ["ready"],
};

export function safeLactateProperties(input: Record<string, unknown>) {
  const result: Record<string, string | number> = {
    engine_version: LACTATE_ENGINE_VERSION,
  };
  for (const [key, values] of Object.entries(ALLOWED)) {
    const value = input[key];
    if (typeof value === "string" && values.includes(value))
      result[key] = value;
  }
  if (
    typeof input.duration_ms === "number" &&
    Number.isFinite(input.duration_ms)
  )
    result.duration_ms = Math.round(
      Math.max(0, Math.min(300_000, input.duration_ms)),
    );
  return result;
}

export function trackLactateEvent(
  name: ToolEventName,
  properties: Record<string, unknown> = {},
) {
  trackToolEvent(name, LACTATE_TOOL_ID, safeLactateProperties(properties));
}

export function lactatePointBucket(count: number) {
  return count <= 5
    ? "4-5"
    : count <= 10
      ? "6-10"
      : count <= 20
        ? "11-20"
        : "21-30";
}

export function editedLactateOrigin(origin: LactateOrigin): LactateOrigin {
  return origin === "example" || origin === "example_edited"
    ? "example_edited"
    : "user";
}

/** Local ownership prevents duplicate terminal events; no run identifier leaves the tab. */
export function createLactateAttempt() {
  let running = false;
  return {
    start() {
      if (running) return false;
      running = true;
      return true;
    },
    finish() {
      if (!running) return false;
      running = false;
      return true;
    },
    get running() {
      return running;
    },
  };
}

export function captureLactateFailure(
  stage: "load" | "analysis" | "visualization" | "export" | "clipboard",
) {
  captureToolFailure({
    tool: LACTATE_TOOL_ID,
    action: stage,
    reason: "runtime_failed",
    error: new Error(`Lactate tool ${stage} failed`),
    properties: { engine_version: LACTATE_ENGINE_VERSION },
  });
}

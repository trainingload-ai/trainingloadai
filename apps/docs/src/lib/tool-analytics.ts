import { trackMarketingEvent } from "@/lib/analytics";
import {
  PRODUCT_ANALYTICS_SCHEMA_VERSION,
  type ProductAnalyticsToolId,
  type ToolAppDestination,
  type ToolCtaPlacement,
} from "@shared/product-analytics";

export const TOOL_ANALYTICS_SCHEMA_VERSION = PRODUCT_ANALYTICS_SCHEMA_VERSION;
export type ToolId = ProductAnalyticsToolId;

export type ToolEventName =
  | "tool_viewed"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "tool_exported"
  | "tool_result_copied"
  | "tool_file_picker_opened"
  | "tool_file_selected"
  | "tool_file_removed"
  | "tool_visualization_rendered"
  | "tool_visualization_interacted"
  | "tool_app_cta_clicked";

export type ToolErrorCode =
  | "file_missing"
  | "file_too_large"
  | "file_type_unsupported"
  | "invalid_input"
  | "invalid_file"
  | "parse_failed"
  | "request_failed"
  | "response_invalid"
  | "export_failed"
  | "clipboard_failed"
  | "worker_unavailable"
  | "unknown";

type SafeToolEventProperties = {
  action?: string;
  duration_ms?: number;
  destination?: ToolAppDestination;
  error_code?: ToolErrorCode;
  export_format?: string;
  file_extension?: string;
  file_size_mb?: number;
  file_size_bucket?: string;
  input_method?: string;
  lang?: string;
  output_format?: string;
  point_count_bucket?: string;
  question_preset?: string;
  referrer_group?: string;
  renderer?: string;
  sport?: string;
  stage?: string;
  visualization_status?: string;
  source_format?: string;
  status?: string;
  cta_placement?: ToolCtaPlacement;
};

/**
 * Canonical Tools event contract for every configured analytics sink.
 * Never include filenames, decoded activity data, health metrics, free-form
 * errors, stacks, or file contents in these properties.
 */
export function trackToolEvent(
  name: ToolEventName,
  toolId: ToolId,
  properties: SafeToolEventProperties = {},
) {
  trackMarketingEvent(name, {
    event_schema_version: TOOL_ANALYTICS_SCHEMA_VERSION,
    tool_id: toolId,
    ...properties,
  });
}

export function elapsedMilliseconds(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

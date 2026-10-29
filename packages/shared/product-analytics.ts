export const PRODUCT_ANALYTICS_SCHEMA_VERSION = "1.0";

// Production previews are often started with `next start`, so NODE_ENV alone
// cannot distinguish a real deployment from a developer's machine. Keep local
// and private-network traffic out of the production analytics property unless
// the deployment explicitly opts in.
export const LOCAL_ANALYTICS_HOSTNAME_PATTERN =
  /^(?:localhost|.+\.localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|::1|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)$/i;

export function isLocalAnalyticsHostname(hostname: string) {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return (
    normalized.endsWith(".local") ||
    LOCAL_ANALYTICS_HOSTNAME_PATTERN.test(normalized)
  );
}

export function resolveGa4MeasurementId(value: string | null | undefined) {
  const candidate = value?.trim().toUpperCase();
  return candidate && /^G-[A-Z0-9]+$/.test(candidate)
    ? candidate
    : null;
}

// Self-host analytics has a deliberately smaller contract than the managed
// product. Only these fixed operation names may leave the browser. Call-site
// properties are never forwarded, so training values, record identifiers,
// routes, account details, and AI content cannot accidentally become event
// parameters.
export const SELF_HOST_OPERATION_EVENT_NAMES = [
  "$pageview",
  "ai_consent_decided",
  "ai_consent_reminder_opened",
  "ai_consent_reminder_viewed",
  "ai_consent_step_viewed",
  "auth_completed",
  "calendar_opened",
  "checkout_started",
  "login_failed",
  "login_started",
  "onboarding_completed",
  "onboarding_failed",
  "onboarding_import_uploaded",
  "onboarding_provider_connection_failed",
  "onboarding_provider_connection_started",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_step_viewed",
  "signup_completed",
  "signup_failed",
  "signup_otp_failed",
  "signup_otp_requested",
  "signup_otp_sent",
  "signup_started",
] as const;

export type SelfHostOperationEventName =
  (typeof SELF_HOST_OPERATION_EVENT_NAMES)[number];

const selfHostOperationEventNameSet = new Set<string>(
  SELF_HOST_OPERATION_EVENT_NAMES,
);

export function isSelfHostOperationEventName(
  value: string,
): value is SelfHostOperationEventName {
  return selfHostOperationEventNameSet.has(value);
}

export function toSelfHostGa4OperationName(
  eventName: SelfHostOperationEventName,
) {
  if (eventName === "$pageview") return "screen_opened";
  if (eventName === "signup_completed") return "sign_up";
  if (eventName === "checkout_started") return "begin_checkout";
  return eventName;
}

const BASE_TOOL_IDS = [
  "activity_file_converter",
  "critical_power_calculator",
  "css_calculator",
  "fit_course_converter",
  "fit_file_viewer",
  "free_ai_workout_review",
  "ftp_calculator",
  "heart_rate_zones_calculator",
  "lactate_threshold_calculator",
  "max_heart_rate_calculator",
  "power_zones_calculator",
  "race_time_predictor",
  "running_pace_calculator",
  "training_load_calculator",
  "tss_calculator",
  "vdot_calculator",
  "vdot_plan_generator",
  "vo2_max_calculator",
  "workout_editor",
  "zone_2_heart_rate_calculator",
] as const;

const CONVERTER_DIRECTION_TOOL_IDS = [
  "activity_file_converter_fit-to-gpx",
  "activity_file_converter_gpx-to-fit",
  "activity_file_converter_tcx-to-gpx",
  "activity_file_converter_gpx-to-tcx",
  "activity_file_converter_fit-to-tcx",
  "activity_file_converter_tcx-to-fit",
] as const;

export const PRODUCT_ANALYTICS_TOOL_IDS = [
  ...BASE_TOOL_IDS,
  ...CONVERTER_DIRECTION_TOOL_IDS,
] as const;

export type ProductAnalyticsToolId =
  | (typeof BASE_TOOL_IDS)[number]
  | `activity_file_converter_${string}`;

export function toGa4ToolName(toolId: string | null | undefined) {
  if (!toolId) return undefined;
  if (toolId === "activity_file_converter") return "file_converter";
  if (toolId.startsWith("activity_file_converter_")) {
    return toolId.slice("activity_file_converter_".length).replaceAll("-", "_");
  }
  return toolId;
}

export const TOOL_CTA_PLACEMENTS = [
  "bottom_signup",
  "post_conversion_prompt",
  "result",
  "result_sidebar",
  "tool_footer",
] as const;

export type ToolCtaPlacement = (typeof TOOL_CTA_PLACEMENTS)[number];

export const TOOL_APP_DESTINATIONS = [
  "ai_coach",
  "app_home",
  "plan_import",
  "signup",
] as const;

export type ToolAppDestination = (typeof TOOL_APP_DESTINATIONS)[number];

const toolIdSet = new Set<string>(PRODUCT_ANALYTICS_TOOL_IDS);
const ctaPlacementSet = new Set<string>(TOOL_CTA_PLACEMENTS);

export function isProductAnalyticsToolId(
  value: string | null | undefined,
): value is ProductAnalyticsToolId {
  return Boolean(value && toolIdSet.has(value));
}

export function isToolCtaPlacement(
  value: string | null | undefined,
): value is ToolCtaPlacement {
  return Boolean(value && ctaPlacementSet.has(value));
}

export function buildToolAppUrl({
  locale,
  toolId,
  ctaPlacement,
  destination,
  intent,
}: {
  locale: string;
  toolId: ProductAnalyticsToolId;
  ctaPlacement: ToolCtaPlacement;
  destination: Exclude<ToolAppDestination, "plan_import">;
  intent?: "training-plan";
}) {
  const destinationPath = {
    ai_coach: "ai-coach",
    app_home: "",
    signup: "signup",
  }[destination];
  const url = new URL(
    `/${encodeURIComponent(locale)}/${destinationPath}`,
    "https://app.trainingload.ai",
  );

  url.searchParams.set("from", "docs-tool");
  url.searchParams.set("tool", toolId);
  url.searchParams.set("cta", ctaPlacement);
  if (intent) url.searchParams.set("intent", intent);

  return url.toString();
}

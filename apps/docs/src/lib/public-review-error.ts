export type PublicReviewErrorKey =
  | "file"
  | "limit"
  | "visitorLimit"
  | "networkLimit"
  | "sharedLimit"
  | "activityLimit"
  | "unavailable"
  | "timeout"
  | "invalidResponse"
  | "upstream"
  | "generation"
  | "request";

export function publicReviewErrorKey(code: string): PublicReviewErrorKey {
  if (code === "LIMIT_REACHED") return "limit";
  if (code === "VISITOR_LIMIT_REACHED") return "visitorLimit";
  if (code === "NETWORK_LIMIT_REACHED") return "networkLimit";
  if (code === "ROLLING_BUDGET_EXHAUSTED") return "sharedLimit";
  if (code === "DUPLICATE_ACTIVITY_REVIEW") return "activityLimit";
  if (code === "UNAVAILABLE") return "unavailable";
  if (code === "UPSTREAM_TIMEOUT") return "timeout";
  if (code === "RESPONSE_INVALID") return "invalidResponse";
  if (code === "UPSTREAM_UNAVAILABLE") return "upstream";
  if (code === "INTERNAL_ERROR") return "generation";
  if (code === "HTTP_400" || code === "HTTP_413") return "file";
  return "request";
}

export function formatPublicReviewRecoveryTime(
  value: unknown,
  locale: string,
  timeZone?: string,
) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

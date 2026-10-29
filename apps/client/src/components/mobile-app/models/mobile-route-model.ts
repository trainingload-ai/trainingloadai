export type MobileTabId = "today" | "plan" | "coach" | "calendar" | "me";

const ME_ROUTES = new Set([
  "me",
  "activities",
  "map",
  "dashboard",
  "pmc",
  "power",
  "heart-rate",
  "pace",
  "notifications",
  "usage",
  "analysis",
  "account",
  "settings",
  "competitions",
]);

export function getRouteRoot(pathname: string) {
  return pathname.split("?")[0]?.split("/").filter(Boolean)[0] ?? "";
}

export function getActiveMobileTab(pathname: string): MobileTabId | null {
  const route = getRouteRoot(pathname);
  if (!route) return "today";
  if (route === "metrics") return "today";
  if (route === "plan" || route === "plans") return "plan";
  if (route === "ai-coach" || route === "coach") return "coach";
  if (route === "calendar" || route === "day") return "calendar";
  return ME_ROUTES.has(route) ? "me" : null;
}

export function isMobileTabRoot(pathname: string) {
  const normalized = `/${pathname.split("?")[0]?.split("/").filter(Boolean).join("/") ?? ""}`;
  return ["/", "/plan", "/ai-coach", "/calendar", "/me"].includes(normalized);
}

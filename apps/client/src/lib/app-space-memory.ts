const LAST_PRODUCT_ROUTE_STORAGE_KEY = "app-shell:last-product-route:v1";
const LAST_COACH_SID_STORAGE_KEY = "ai_coach_sid";

function isSafeInternalProductRoute(route: string) {
  return (
    route.startsWith("/") &&
    !route.startsWith("//") &&
    route !== "/ai-coach" &&
    !route.startsWith("/ai-coach/")
  );
}

export function rememberLastProductRoute(route: string) {
  if (typeof window === "undefined" || !isSafeInternalProductRoute(route)) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_PRODUCT_ROUTE_STORAGE_KEY, route);
  } catch {
    // Ignore private browsing, disabled storage, and quota errors.
  }
}

export function readLastProductRoute() {
  if (typeof window === "undefined") return "/";

  try {
    const route = window.localStorage
      .getItem(LAST_PRODUCT_ROUTE_STORAGE_KEY)
      ?.trim();
    return route && isSafeInternalProductRoute(route) ? route : "/";
  } catch {
    return "/";
  }
}

/** 侧栏「教练」入口始终打开新对话，不把 localStorage 里的旧 sid 拼进 URL。 */
export const COACH_SPACE_HREF = "/ai-coach";

export function readLastCoachRoute() {
  return COACH_SPACE_HREF;
}

export function clearLastCoachSession() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LAST_COACH_SID_STORAGE_KEY);
  } catch {
    // Ignore private browsing, disabled storage, and quota errors.
  }
}

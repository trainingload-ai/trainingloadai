export const MOBILE_PLAN_LIBRARY_QUERY = "openLibrary";
export const MOBILE_PLAN_LIBRARY_HREF = "/plan?openLibrary=1";

export function getPlanLibraryHref(isMobile: boolean) {
  return isMobile ? MOBILE_PLAN_LIBRARY_HREF : "/plans";
}

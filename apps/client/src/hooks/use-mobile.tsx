import * as React from "react";

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = MOBILE_BREAKPOINT;
export const PC_BREAKPOINT = 1024;
export const WIDE_DESKTOP_BREAKPOINT = 1280;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
export const TABLET_MEDIA_QUERY = `(min-width: ${TABLET_BREAKPOINT}px) and (max-width: ${PC_BREAKPOINT - 1}px)`;
export const PC_MEDIA_QUERY = `(min-width: ${PC_BREAKPOINT}px)`;
export const BELOW_PC_MEDIA_QUERY = `(max-width: ${PC_BREAKPOINT - 1}px)`;
export const COMPACT_SIDEBAR_MEDIA_QUERY = `(max-width: ${WIDE_DESKTOP_BREAKPOINT - 1}px)`;

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useMobileViewport() {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}

export function useIsMobile() {
  return useMobileViewport() ?? false;
}

export function useTabletViewport() {
  return useMediaQuery(TABLET_MEDIA_QUERY);
}

export function usePcViewport() {
  return useMediaQuery(PC_MEDIA_QUERY);
}

/** Tablet and compact desktop widths use the icon-only sidebar by default. */
export function useCompactSidebarViewport() {
  return useMediaQuery(COMPACT_SIDEBAR_MEDIA_QUERY);
}

/**
 * Keeps mobile-only portals from retaining an overlay, focus lock, or scroll
 * lock after the viewport crosses into the PC layout.
 */
export function useMobileOnlyOpen(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  mediaQuery = MOBILE_MEDIA_QUERY,
) {
  const matches = useMediaQuery(mediaQuery);

  React.useEffect(() => {
    if (!open || matches) return;
    // The query is unresolved during SSR/hydration. Check the live media query
    // before closing so an initially open responsive surface is not dismissed.
    if (!window.matchMedia(mediaQuery).matches) {
      onOpenChange(false);
    }
  }, [matches, mediaQuery, onOpenChange, open]);

  return Boolean(matches && open);
}

"use client";

import { useCompactSidebarViewport } from "@/hooks/use-mobile";
import { usePersistedSidebarCollapsed } from "@/hooks/use-persisted-sidebar-collapsed";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";

export function useWorkspaceSidebarCollapsed() {
  const { isDesktopSelfHost } = useRuntimeEnvironment();
  const compact = useCompactSidebarViewport() === true;

  return usePersistedSidebarCollapsed({
    mode: isDesktopSelfHost ? "desktop-coach" : compact ? "compact" : "wide",
    defaultCollapsed: !isDesktopSelfHost && compact,
  });
}

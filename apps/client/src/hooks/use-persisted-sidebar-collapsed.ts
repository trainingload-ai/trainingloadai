"use client";

import { useCallback, useSyncExternalStore } from "react";

const LEGACY_STORAGE_KEY = "sidebar:collapsed:v1";
const STORAGE_KEY_PREFIX = "sidebar:collapsed:v2";

export type SidebarPreferenceMode = "compact" | "wide";

function getStorageKey(mode: SidebarPreferenceMode) {
  return `${STORAGE_KEY_PREFIX}:${mode}`;
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === LEGACY_STORAGE_KEY ||
      event.key?.startsWith(STORAGE_KEY_PREFIX)
    ) {
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function readCollapsed(
  mode: SidebarPreferenceMode,
  defaultCollapsed: boolean,
) {
  try {
    const stored = window.localStorage.getItem(getStorageKey(mode));
    if (stored !== null) return stored === "1";
    if (mode === "wide") {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) return legacy === "1";
    }
    return defaultCollapsed;
  } catch {
    return defaultCollapsed;
  }
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function writeCollapsed(mode: SidebarPreferenceMode, collapsed: boolean) {
  try {
    window.localStorage.setItem(getStorageKey(mode), collapsed ? "1" : "0");
  } catch {
    // private mode / disabled storage
  }
  emitChange();
}

export function usePersistedSidebarCollapsed({
  mode,
  defaultCollapsed,
}: {
  mode: SidebarPreferenceMode;
  defaultCollapsed: boolean;
}) {
  const getSnapshot = useCallback(
    () => readCollapsed(mode, defaultCollapsed),
    [defaultCollapsed, mode],
  );
  const getServerSnapshot = useCallback(
    () => defaultCollapsed,
    [defaultCollapsed],
  );
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(mode, !readCollapsed(mode, defaultCollapsed));
  }, [defaultCollapsed, mode]);

  return { collapsed, toggleCollapsed };
}

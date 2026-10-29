"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "sidebar:width:v2";

export const SIDEBAR_WIDTH_LIMITS = {
  default: 224,
  min: 208,
  max: 384,
};

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function clampSidebarWidth(width: number) {
  return Math.min(
    SIDEBAR_WIDTH_LIMITS.max,
    Math.max(SIDEBAR_WIDTH_LIMITS.min, Math.round(width)),
  );
}

function readWidth() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return SIDEBAR_WIDTH_LIMITS.default;
    }

    const parsedWidth = Number(stored);
    return Number.isFinite(parsedWidth)
      ? clampSidebarWidth(parsedWidth)
      : SIDEBAR_WIDTH_LIMITS.default;
  } catch {
    return SIDEBAR_WIDTH_LIMITS.default;
  }
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function writeWidth(width: number) {
  const nextWidth = clampSidebarWidth(width);

  try {
    window.localStorage.setItem(STORAGE_KEY, String(nextWidth));
  } catch {
    // private mode / disabled storage
  }
  emitChange();
}

export function usePersistedSidebarWidth() {
  const getSnapshot = useCallback(() => readWidth(), []);
  const getServerSnapshot = useCallback(
    () => SIDEBAR_WIDTH_LIMITS.default,
    [],
  );
  const width = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setWidth = useCallback((nextWidth: number) => writeWidth(nextWidth), []);

  return { setWidth, width };
}

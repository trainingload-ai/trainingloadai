"use client";

import { useSyncExternalStore } from "react";

const storageKey = "trainingload:calendar-week-start";

export type CalendarWeekStart = "sunday" | "monday";
const defaultPreference: CalendarWeekStart = "monday";

function readPreference(): CalendarWeekStart {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "sunday" || value === "monday") return value;
  } catch {
    // Use the default when browser storage is unavailable.
  }
  return defaultPreference;
}

function subscribe(onChange: () => void) {
  window.addEventListener(storageKey, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(storageKey, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveCalendarWeekStart(preference: CalendarWeekStart) {
  localStorage.setItem(storageKey, preference);
  window.dispatchEvent(new Event(storageKey));
}

export function useCalendarWeekStartPreference() {
  return useSyncExternalStore(
    subscribe,
    readPreference,
    () => defaultPreference,
  );
}

export function useCalendarWeekStartsOn(): 0 | 1 {
  return useCalendarWeekStartPreference() === "monday" ? 1 : 0;
}

"use client";

import { useSyncExternalStore } from "react";

const storageKey = "trainingload:coach:sidebar:collapsed-groups:v1";
const defaultSnapshot = "[]";
const groupKeys = ["pinned", "today", "yesterday", "past"] as const;

type GroupKey = (typeof groupKeys)[number];

let inMemorySnapshot: string | null = null;

function readSnapshot() {
  if (inMemorySnapshot !== null) return inMemorySnapshot;
  try {
    return window.localStorage.getItem(storageKey) ?? defaultSnapshot;
  } catch {
    return defaultSnapshot;
  }
}

function parseCollapsedGroups(snapshot: string) {
  try {
    const value: unknown = JSON.parse(snapshot);
    if (Array.isArray(value)) {
      return groupKeys.filter((key) => value.includes(key));
    }
  } catch {
    // Fall back to the default when the saved preference is invalid.
  }
  return [];
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) onChange();
  };
  window.addEventListener(storageKey, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(storageKey, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setCoachSidebarGroupOpen(group: GroupKey, open: boolean) {
  const collapsed = parseCollapsedGroups(readSnapshot());
  const next = groupKeys.filter((key) =>
    key === group ? !open : collapsed.includes(key),
  );
  const snapshot = JSON.stringify(next);
  try {
    window.localStorage.setItem(storageKey, snapshot);
    inMemorySnapshot = null;
  } catch {
    inMemorySnapshot = snapshot;
  }
  window.dispatchEvent(new Event(storageKey));
}

export function useCollapsedCoachSidebarGroups() {
  return parseCollapsedGroups(
    useSyncExternalStore(subscribe, readSnapshot, () => defaultSnapshot),
  );
}

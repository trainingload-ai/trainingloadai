import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HealthCardKey } from "@/components/health/health-overview-model";
import {
  DASHBOARD_OVERVIEW_METRIC_KEYS,
  type DashboardOverviewMetricKey,
} from "@/hooks/useDashboardOverviewConfig";
import { getBrowserLocalStorage } from "@/lib/browser-storage";

export type HomeHealthMetricKey = Extract<
  HealthCardKey,
  "sleep" | "hrv" | "restingHeartRate"
>;
export type HomeOverviewMetricKey =
  | HomeHealthMetricKey
  | DashboardOverviewMetricKey;
export type HomeOverviewChartSpan = 1 | 2;

export type HomeOverviewLayoutItem = {
  key: HomeOverviewMetricKey;
  span: HomeOverviewChartSpan;
};

export const HOME_HEALTH_METRIC_KEYS: HomeHealthMetricKey[] = [
  "sleep",
  "hrv",
  "restingHeartRate",
];

export const DEFAULT_HOME_OVERVIEW_LAYOUT: HomeOverviewLayoutItem[] = [
  { key: "sleep", span: 2 },
  { key: "hrv", span: 1 },
  { key: "restingHeartRate", span: 1 },
];

// 沿用首版健康模块的 key，让已保存的用户布局无损升级为通用指标布局。
const STORAGE_KEY = "home-health-overview-layout-v1";
const HEALTH_KEYS = new Set<HomeHealthMetricKey>(HOME_HEALTH_METRIC_KEYS);
const VALID_KEYS = new Set<HomeOverviewMetricKey>([
  ...HOME_HEALTH_METRIC_KEYS,
  ...DASHBOARD_OVERVIEW_METRIC_KEYS,
]);

export function isHomeHealthMetricKey(
  key: HomeOverviewMetricKey,
): key is HomeHealthMetricKey {
  return HEALTH_KEYS.has(key as HomeHealthMetricKey);
}

export function normalizeHomeOverviewLayout(layout: HomeOverviewLayoutItem[]) {
  const seen = new Set<HomeOverviewMetricKey>();
  const result: HomeOverviewLayoutItem[] = [];

  for (const item of layout) {
    if (!item || !VALID_KEYS.has(item.key) || seen.has(item.key)) continue;
    seen.add(item.key);
    result.push({ key: item.key, span: item.span === 2 ? 2 : 1 });
  }

  return result;
}

type HomeMetricOverviewStore = {
  layout: HomeOverviewLayoutItem[];
  draftLayout: HomeOverviewLayoutItem[];
  isEditing: boolean;
  setDraftLayout: (
    next:
      | HomeOverviewLayoutItem[]
      | ((current: HomeOverviewLayoutItem[]) => HomeOverviewLayoutItem[]),
  ) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  commitDraft: () => void;
};

const useHomeMetricOverviewStore = create<HomeMetricOverviewStore>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_HOME_OVERVIEW_LAYOUT,
      draftLayout: [],
      isEditing: false,
      setDraftLayout: (next) =>
        set((state) => ({
          draftLayout: normalizeHomeOverviewLayout(
            typeof next === "function" ? next(state.draftLayout) : next,
          ),
        })),
      startEditing: () =>
        set({
          isEditing: true,
          draftLayout: normalizeHomeOverviewLayout(get().layout),
        }),
      cancelEditing: () => set({ isEditing: false, draftLayout: [] }),
      commitDraft: () =>
        set({
          layout: normalizeHomeOverviewLayout(get().draftLayout),
          draftLayout: [],
          isEditing: false,
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(getBrowserLocalStorage),
      partialize: (state) => ({ layout: state.layout }),
    },
  ),
);

export function useHomeMetricOverviewConfig() {
  const store = useHomeMetricOverviewStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  const layout = useMemo(
    () =>
      normalizeHomeOverviewLayout(
        isMounted ? store.layout : DEFAULT_HOME_OVERVIEW_LAYOUT,
      ),
    [isMounted, store.layout],
  );
  const draftLayout = useMemo(
    () => normalizeHomeOverviewLayout(store.draftLayout),
    [store.draftLayout],
  );

  return { ...store, layout, draftLayout, isMounted };
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useEffect, useMemo, useState } from "react";
import { getBrowserLocalStorage } from "@/lib/browser-storage";

export type DashboardOverviewMetricKey =
  | "count"
  | "duration"
  | "distance"
  | "speed"
  | "power"
  | "heartRate"
  | "climb"
  | "calories"
  | "vo2Max"
  | "atl"
  | "ctl"
  | "tsb"
  | "acRatio"
  | "monotony"
  // 周负荷
  | "weekPressure"
  | "restDays";

export type DashboardOverviewChartSpan = 1 | 2;

export interface DashboardOverviewLayoutItem {
  key: DashboardOverviewMetricKey;
  span: DashboardOverviewChartSpan;
}

const STORAGE_KEY = "dashboard-overview-layout-v1";

export const DASHBOARD_OVERVIEW_METRIC_KEYS: DashboardOverviewMetricKey[] = [
  "count",
  "duration",
  "distance",
  "speed",
  "power",
  "heartRate",
  "climb",
  "calories",
  "vo2Max",
  "atl",
  "ctl",
  "tsb",
  "acRatio",
  "monotony",
  "weekPressure",
  "restDays",
];

const DEFAULT_METRICS: DashboardOverviewMetricKey[] = [
  "count",
  "duration",
  "distance",
  "speed",
  "power",
  "heartRate",
];

export const MAX_DASHBOARD_OVERVIEW_METRICS = 10;

const DEFAULT_LAYOUT: DashboardOverviewLayoutItem[] = DEFAULT_METRICS.map(
  (key) => ({ key, span: 1 }),
);

const VALID_METRICS = new Set<DashboardOverviewMetricKey>(
  DASHBOARD_OVERVIEW_METRIC_KEYS,
);

const normalizeMetrics = (metrics: DashboardOverviewMetricKey[]) => {
  // 用户配置会进 localStorage，读取时要去重、过滤未知 key，并限制最大卡片数。
  const seen = new Set<DashboardOverviewMetricKey>();
  const result: DashboardOverviewMetricKey[] = [];

  for (const k of metrics) {
    if (!k) continue;
    if (!VALID_METRICS.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(k);
    if (result.length >= MAX_DASHBOARD_OVERVIEW_METRICS) return result;
  }

  if (result.length === 0) {
    return DEFAULT_METRICS;
  }

  return result;
};

const normalizeSpan = (span: unknown): DashboardOverviewChartSpan => {
  return span === 2 ? 2 : 1;
};

const metricsToLayout = (
  metrics: DashboardOverviewMetricKey[],
): DashboardOverviewLayoutItem[] => {
  return normalizeMetrics(metrics).map((key) => ({ key, span: 1 }));
};

const normalizeLayout = (
  layout: DashboardOverviewLayoutItem[],
  options: { fallbackToDefault?: boolean } = { fallbackToDefault: true },
): DashboardOverviewLayoutItem[] => {
  // layout 比 metrics 多了 span，需要在同一个入口校验并兼容空草稿。
  const seen = new Set<DashboardOverviewMetricKey>();
  const result: DashboardOverviewLayoutItem[] = [];

  for (const item of layout) {
    if (!item) continue;
    if (!VALID_METRICS.has(item.key)) continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    result.push({ key: item.key, span: normalizeSpan(item.span) });
    if (result.length >= MAX_DASHBOARD_OVERVIEW_METRICS) return result;
  }

  if (result.length === 0 && options.fallbackToDefault !== false) {
    return DEFAULT_LAYOUT.map((item) => ({ ...item }));
  }

  return result;
};

type DashboardOverviewStore = {
  layout: DashboardOverviewLayoutItem[];
  setLayout: (layout: DashboardOverviewLayoutItem[]) => void;
  setMetrics: (metrics: DashboardOverviewMetricKey[]) => void;
  draftLayout: DashboardOverviewLayoutItem[];
  setDraftLayout: (
    next:
      | DashboardOverviewLayoutItem[]
      | ((
          prev: DashboardOverviewLayoutItem[],
        ) => DashboardOverviewLayoutItem[]),
  ) => void;
  setDraftMetrics: (
    next:
      | DashboardOverviewMetricKey[]
      | ((prev: DashboardOverviewMetricKey[]) => DashboardOverviewMetricKey[]),
  ) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  commitDraft: () => void;
};

const useDashboardOverviewStore = create<DashboardOverviewStore>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_LAYOUT,
      setLayout: (layout) => set({ layout: normalizeLayout(layout) }),
      setMetrics: (metrics) => set({ layout: metricsToLayout(metrics) }),
      draftLayout: [],
      setDraftLayout: (next) =>
        set((state) => ({
          draftLayout: normalizeLayout(
            typeof next === "function" ? next(state.draftLayout) : next,
            { fallbackToDefault: false },
          ),
        })),
      setDraftMetrics: (next) =>
        set((state) => ({
          draftLayout: metricsToLayout(
            // 指标选择器只关心 key，提交前再补默认 span。
            typeof next === "function"
              ? next(state.draftLayout.map((item) => item.key))
              : next,
          ),
        })),
      startEditing: () =>
        set({
          draftLayout: get().layout.map((item) => ({ ...item })),
        }),
      cancelEditing: () => set({ draftLayout: [] }),
      commitDraft: () => {
        const draft = get().draftLayout;
        if (!draft || draft.length === 0) return;
        set({ layout: normalizeLayout(draft), draftLayout: [] });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(getBrowserLocalStorage),
      partialize: (state) => ({ layout: state.layout }),
    },
  ),
);

export function useDashboardOverviewConfig() {
  // Dashboard overview 配置只存在本地；挂载前使用默认布局避免 SSR/CSR 不一致。
  const store = useDashboardOverviewStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const normalized = normalizeLayout(store.layout);
    if (JSON.stringify(normalized) === JSON.stringify(store.layout)) return;
    store.setLayout(normalized);
  }, [isMounted, store.layout, store.setLayout]);

  const layout = useMemo(() => {
    return normalizeLayout(isMounted ? store.layout : DEFAULT_LAYOUT);
  }, [isMounted, store.layout]);

  const draftLayout = useMemo(() => {
    return normalizeLayout(store.draftLayout, { fallbackToDefault: false });
  }, [store.draftLayout]);

  const metrics = useMemo(() => layout.map((item) => item.key), [layout]);

  const draftMetrics = useMemo(
    () => draftLayout.map((item) => item.key),
    [draftLayout],
  );

  return {
    ...store,
    layout,
    draftLayout,
    metrics,
    draftMetrics,
    isMounted,
  };
}

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect, useState } from "react";
import { updateUserSetting } from "@/api/settings";
import { toast } from "sonner";
import { getBrowserLocalStorage } from "@/lib/browser-storage";

export interface FitnessStatusConfig {
  vo2Max: boolean;
  paceZones: boolean;
  atl: boolean;
  ctl: boolean;
  tsb: boolean;
  acRatio: boolean;
  monotony: boolean;
  intensity: boolean;
  restDays: boolean;
  weekPressure: boolean;
  weekCount: boolean;
  weekDuration: boolean;
  weekDistance: boolean;
  weekSpeed: boolean;
  weekPower: boolean;
  weekHeartRate: boolean;
  weekClimb: boolean;
  weekCalories: boolean;
}

export type FitnessStatusMetricKey = keyof FitnessStatusConfig;

export type FitnessStatusMetricSpan = 1 | 2 | 4;

export interface FitnessStatusLayoutItem {
  key: FitnessStatusMetricKey;
  span: FitnessStatusMetricSpan;
}

const DEFAULT_LAYOUT: FitnessStatusLayoutItem[] = [
  { key: "vo2Max", span: 1 },
  { key: "paceZones", span: 1 },
  { key: "atl", span: 1 },
  { key: "ctl", span: 1 },
  { key: "tsb", span: 1 },
  { key: "acRatio", span: 1 },
  { key: "monotony", span: 1 },
  { key: "intensity", span: 1 },
  { key: "restDays", span: 1 },
  { key: "weekPressure", span: 1 },
  { key: "weekCount", span: 1 },
  { key: "weekDuration", span: 1 },
  { key: "weekDistance", span: 1 },
  { key: "weekSpeed", span: 1 },
  { key: "weekPower", span: 1 },
  { key: "weekHeartRate", span: 1 },
  { key: "weekClimb", span: 1 },
  { key: "weekCalories", span: 1 },
];

const DEFAULT_CONFIG: FitnessStatusConfig = DEFAULT_LAYOUT.reduce(
  (acc, item) => ({ ...acc, [item.key]: true }),
  {
    vo2Max: false,
    paceZones: false,
    atl: false,
    ctl: false,
    tsb: false,
    acRatio: false,
    monotony: false,
    intensity: false,
    restDays: false,
    weekPressure: false,
    weekCount: false,
    weekDuration: false,
    weekDistance: false,
    weekSpeed: false,
    weekPower: false,
    weekHeartRate: false,
    weekClimb: false,
    weekCalories: false,
  } as FitnessStatusConfig,
);

interface FitnessStatusStore {
  layout: FitnessStatusLayoutItem[];
  setLayout: (layout: FitnessStatusLayoutItem[]) => void;
  setSpan: (key: FitnessStatusMetricKey, span: FitnessStatusMetricSpan) => void;
  addMetric: (
    key: FitnessStatusMetricKey,
    span?: FitnessStatusMetricSpan,
  ) => void;
  removeMetric: (key: FitnessStatusMetricKey) => void;
  toggleMetric: (key: FitnessStatusMetricKey) => void;
  isEditing: boolean;
  draftLayout: FitnessStatusLayoutItem[];
  addDialogOpen: boolean;
  isSaving: boolean;
  setDraftLayout: (layout: FitnessStatusLayoutItem[]) => void;
  setAddDialogOpen: (open: boolean) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  saveDraftLayout: (t: (key: string) => string) => Promise<void>;
}

const METRIC_KEYS: FitnessStatusMetricKey[] = DEFAULT_LAYOUT.map((x) => x.key);
const VALID_SPANS = new Set<FitnessStatusMetricSpan>([1, 2, 4]);

/** 持久化或编辑中的布局归一化：去重、过滤非法 key/span。 */
export function normalizeFitnessStatusLayout(
  layout: FitnessStatusLayoutItem[],
): FitnessStatusLayoutItem[] {
  const validKeys = new Set<FitnessStatusMetricKey>(METRIC_KEYS);
  const seen = new Set<FitnessStatusMetricKey>();
  const result: FitnessStatusLayoutItem[] = [];
  for (const item of layout) {
    if (!item) continue;
    if (!validKeys.has(item.key)) continue;
    if (seen.has(item.key)) continue;
    if (!VALID_SPANS.has(item.span)) continue;
    seen.add(item.key);
    result.push({ key: item.key, span: item.span });
  }
  return result;
}

const useFitnessStatusStore = create<FitnessStatusStore>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_LAYOUT,
      setLayout: (layout) => set({ layout }),
      setSpan: (key, span) =>
        set((state) => ({
          layout: state.layout.map((item) =>
            item.key === key ? { ...item, span } : item,
          ),
        })),
      addMetric: (key, span = 1) =>
        set((state) => {
          if (state.layout.some((item) => item.key === key)) return state;
          return { layout: [...state.layout, { key, span }] };
        }),
      removeMetric: (key) =>
        set((state) => ({
          layout: state.layout.filter((item) => item.key !== key),
        })),
      toggleMetric: (key) =>
        set((state) => {
          const exists = state.layout.some((item) => item.key === key);
          if (exists) {
            return { layout: state.layout.filter((item) => item.key !== key) };
          }
          return { layout: [...state.layout, { key, span: 1 }] };
        }),
      isEditing: false,
      draftLayout: [],
      addDialogOpen: false,
      isSaving: false,
      setDraftLayout: (layout) => set({ draftLayout: layout }),
      setAddDialogOpen: (open) => set({ addDialogOpen: open }),
      startEditing: () => {
        // 编辑模式先复制当前布局，用户取消时可以无损回退。
        const current = get().layout;
        set({
          isEditing: true,
          draftLayout: current.map((i) => ({ ...i })),
          addDialogOpen: false,
        });
      },
      cancelEditing: () =>
        set({
          isEditing: false,
          draftLayout: [],
          addDialogOpen: false,
          isSaving: false,
        }),
      saveDraftLayout: async (t) => {
        // 保存时同时写服务端设置和本地持久化状态，失败则保留编辑态便于重试。
        const normalized = normalizeFitnessStatusLayout(get().draftLayout);
        set({ isSaving: true });
        try {
          await updateUserSetting(
            "FITNESS_STATUS_LAYOUT",
            JSON.stringify(normalized),
          );
          set({
            layout: normalized,
            isEditing: false,
            draftLayout: [],
            addDialogOpen: false,
          });
          toast.success(t("saveSuccess"));
        } catch {
          toast.error(t("saveFailed"));
        } finally {
          set({ isSaving: false });
        }
      },
    }),
    {
      name: "fitness-status-layout-v1",
      storage: createJSONStorage(getBrowserLocalStorage),
      partialize: (state) => ({ layout: state.layout }),
    },
  ),
);

function deriveConfigFromLayout(
  layout: FitnessStatusLayoutItem[],
): FitnessStatusConfig {
  // 兼容旧组件仍按 boolean config 判断显示状态的用法。
  const enabled = new Set(layout.map((item) => item.key));
  return {
    vo2Max: enabled.has("vo2Max"),
    paceZones: enabled.has("paceZones"),
    atl: enabled.has("atl"),
    ctl: enabled.has("ctl"),
    tsb: enabled.has("tsb"),
    acRatio: enabled.has("acRatio"),
    monotony: enabled.has("monotony"),
    intensity: enabled.has("intensity"),
    restDays: enabled.has("restDays"),
    weekPressure: enabled.has("weekPressure"),
    weekCount: enabled.has("weekCount"),
    weekDuration: enabled.has("weekDuration"),
    weekDistance: enabled.has("weekDistance"),
    weekSpeed: enabled.has("weekSpeed"),
    weekPower: enabled.has("weekPower"),
    weekHeartRate: enabled.has("weekHeartRate"),
    weekClimb: enabled.has("weekClimb"),
    weekCalories: enabled.has("weekCalories"),
  };
}

export function useFitnessStatusConfig() {
  // 对外暴露布局、编辑状态和旧 config；首屏先用默认值避免 hydration mismatch。
  const store = useFitnessStatusStore();
  const [isMounted, setIsMounted] = useState(false);
  const persistedLayout = store.layout;
  const setLayout = store.setLayout;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const normalized = normalizeFitnessStatusLayout(persistedLayout);
    if (normalized.length === persistedLayout.length) return;
    setLayout(normalized);
  }, [isMounted, persistedLayout, setLayout]);

  useEffect(() => {
    if (!isMounted) return;
    try {
      const hasNew = window.localStorage.getItem("fitness-status-layout-v1");
      if (hasNew) return;
      const oldRaw = window.localStorage.getItem("fitness-status-config");
      if (!oldRaw) return;
      const parsed = JSON.parse(oldRaw) as {
        state?: { config?: FitnessStatusConfig };
      };
      const oldConfig = parsed?.state?.config;
      if (!oldConfig) return;

      // 从旧版 boolean 配置迁移到新版 layout 配置，只在新版 key 不存在时执行。
      const layout = DEFAULT_LAYOUT.filter(
        (item) => oldConfig[item.key] !== false,
      );
      setLayout(layout);
    } catch {
      return;
    }
  }, [isMounted, setLayout]);

  const layout = isMounted ? persistedLayout : DEFAULT_LAYOUT;
  const config = deriveConfigFromLayout(layout);

  return {
    ...store,
    // Use default config during SSR and first client render to avoid hydration mismatch
    layout,
    config: isMounted ? config : DEFAULT_CONFIG,
    isMounted,
  };
}

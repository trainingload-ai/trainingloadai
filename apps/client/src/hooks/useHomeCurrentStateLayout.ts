import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect, useMemo, useState } from "react";
import { getBrowserLocalStorage } from "@/lib/browser-storage";
import {
  normalizeFitnessStatusLayout,
  type FitnessStatusLayoutItem,
} from "@/hooks/useFitnessStatusConfig";
import { FITNESS_STATUS_METRIC_KEYS } from "@/app/[locale]/(main)/dashboard/components/FitnessStatus/fitness-status-model";

const STORAGE_KEY = "home-current-state-layout-v1";

const DEFAULT_HOME_LAYOUT: FitnessStatusLayoutItem[] = [
  { key: "vo2Max", span: 1 },
  { key: "atl", span: 1 },
  { key: "ctl", span: 1 },
  { key: "tsb", span: 1 },
  { key: "intensity", span: 1 },
  { key: "restDays", span: 1 },
];

const MAX_HOME_METRICS = FITNESS_STATUS_METRIC_KEYS.length;

type HomeCurrentStateStore = {
  layout: FitnessStatusLayoutItem[];
  draftLayout: FitnessStatusLayoutItem[];
  isEditing: boolean;
  setLayout: (layout: FitnessStatusLayoutItem[]) => void;
  setDraftLayout: (
    next:
      | FitnessStatusLayoutItem[]
      | ((prev: FitnessStatusLayoutItem[]) => FitnessStatusLayoutItem[]),
  ) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  commitDraft: () => void;
};

function asColumnLayout(
  layout: FitnessStatusLayoutItem[],
): FitnessStatusLayoutItem[] {
  return normalizeFitnessStatusLayout(layout).map((x) => ({ ...x, span: 1 }));
}

const useHomeCurrentStateStore = create<HomeCurrentStateStore>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_HOME_LAYOUT,
      draftLayout: [],
      isEditing: false,
      setLayout: (layout) =>
        set({
          layout: asColumnLayout(layout),
        }),
      setDraftLayout: (next) =>
        set((state) => {
          const raw =
            typeof next === "function" ? next(state.draftLayout) : next;
          return {
            draftLayout: asColumnLayout(raw),
          };
        }),
      startEditing: () =>
        set({
          isEditing: true,
          draftLayout: asColumnLayout(get().layout),
        }),
      cancelEditing: () =>
        set({
          isEditing: false,
          draftLayout: [],
        }),
      commitDraft: () => {
        const draft = get().draftLayout;
        set({
          layout: asColumnLayout(draft),
          isEditing: false,
          draftLayout: [],
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(getBrowserLocalStorage),
      partialize: (state) => ({ layout: state.layout }),
    },
  ),
);

export { MAX_HOME_METRICS, DEFAULT_HOME_LAYOUT };

export function useHomeCurrentStateLayout() {
  const store = useHomeCurrentStateStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const layout = useMemo(() => {
    if (!isMounted) return DEFAULT_HOME_LAYOUT;
    return asColumnLayout(store.layout);
  }, [isMounted, store.layout]);

  const draftLayout = useMemo(
    () => asColumnLayout(store.draftLayout),
    [store.draftLayout],
  );

  return {
    ...store,
    layout,
    draftLayout,
    isMounted,
    isEditing: store.isEditing,
  };
}

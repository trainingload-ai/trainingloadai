import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getBrowserLocalStorage } from "@/lib/browser-storage";
import {
  getActivityDataChartStorageKey,
  isActivityDataChartEnabled,
  type ActivityDataChartId,
} from "@/lib/activity-data-charts";

const STORAGE_KEY = "activity-data-chart-config-v1";

interface ActivityDataChartConfigStore {
  charts: Record<string, boolean>;
  toggleDataChart: (
    sportType: string | null | undefined,
    chartId: ActivityDataChartId,
  ) => void;
}

const normalizeDataChartConfig = (
  charts?: Record<string, boolean>,
): Record<string, boolean> => charts ?? {};

const useActivityDataChartConfigStore =
  create<ActivityDataChartConfigStore>()(
    persist(
      (set) => ({
        charts: {},
        toggleDataChart: (sportType, chartId) =>
          set((state) => {
            const currentCharts = normalizeDataChartConfig(state.charts);
            const storageKey = getActivityDataChartStorageKey(
              sportType,
              chartId,
            );
            const currentEnabled = isActivityDataChartEnabled(
              currentCharts,
              sportType,
              chartId,
            );

            return {
              charts: {
                ...currentCharts,
                [storageKey]: !currentEnabled,
              },
            };
          }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(getBrowserLocalStorage),
        merge: (persisted, current) => {
          const persistedCharts =
            typeof persisted === "object" && persisted && "charts" in persisted
              ? (persisted as { charts?: Record<string, boolean> }).charts
              : undefined;

          return {
            ...current,
            ...(typeof persisted === "object" && persisted ? persisted : {}),
            charts: normalizeDataChartConfig(persistedCharts),
          } as ActivityDataChartConfigStore;
        },
      },
    ),
  );

export function useActivityDataChartConfig() {
  const store = useActivityDataChartConfigStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return {
    ...store,
    charts: isMounted ? normalizeDataChartConfig(store.charts) : {},
    isMounted,
  };
}

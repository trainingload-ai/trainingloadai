import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect, useState } from "react";
import { getBrowserLocalStorage } from "@/lib/browser-storage";
import {
  getActivityOverviewStorageKey,
  isActivityOverviewMetricEnabled,
  type ActivityOverviewMetricId,
} from "@/lib/activity-overview-metrics";

export interface PowerConfig {
  avgPower: boolean;
  maxPower: boolean;
  normalizedPower: boolean;
  xPower: boolean;
  trainingStressScore: boolean;
  etss: boolean;
  intensityFactor: boolean;
  relativeIntensity: boolean;
  variabilityIndex: boolean;
  variabilityIndexSkiba: boolean;
  powerWeightRatio: boolean;
  ftp: boolean;
  cp: boolean;
  efficiencyFactor: boolean;
  powerHeartRateRatio: boolean;
}

export interface ActivityConfig {
  power: PowerConfig;
  // Placeholder for other tabs
  overview: Record<string, boolean>;
  heartRate: Record<string, boolean>;
  lap: Record<string, boolean>;
}

const DEFAULT_POWER_CONFIG: PowerConfig = {
  avgPower: true,
  maxPower: true,
  normalizedPower: true,
  xPower: false,
  trainingStressScore: true,
  etss: false,
  intensityFactor: true,
  relativeIntensity: false,
  variabilityIndex: true,
  variabilityIndexSkiba: false,
  powerWeightRatio: true,
  ftp: true,
  cp: true,
  efficiencyFactor: true,
  powerHeartRateRatio: true,
};

const DEFAULT_CONFIG: ActivityConfig = {
  power: DEFAULT_POWER_CONFIG,
  overview: {},
  heartRate: {},
  lap: {},
};

interface ActivityConfigStore {
  config: ActivityConfig;
  setConfig: (config: ActivityConfig) => void;
  togglePowerMetric: (key: keyof PowerConfig) => void;
  toggleOverviewMetric: (
    sportType: string | null | undefined,
    metricId: ActivityOverviewMetricId,
  ) => void;
}

const normalizeActivityConfig = (config?: Partial<ActivityConfig>) => ({
  ...DEFAULT_CONFIG,
  ...config,
  power: {
    ...DEFAULT_POWER_CONFIG,
    ...config?.power,
  },
  overview: config?.overview ?? {},
  heartRate: config?.heartRate ?? {},
  lap: config?.lap ?? {},
});

const useActivityConfigStore = create<ActivityConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      setConfig: (newConfig) =>
        set({ config: normalizeActivityConfig(newConfig) }),
      togglePowerMetric: (key) =>
        set((state) => ({
          config: {
            ...state.config,
            power: {
              ...state.config.power,
              [key]: !state.config.power[key],
            },
          },
        })),
      toggleOverviewMetric: (sportType, metricId) =>
        set((state) => {
          const currentConfig = normalizeActivityConfig(state.config);
          const storageKey = getActivityOverviewStorageKey(sportType, metricId);
          const currentEnabled = isActivityOverviewMetricEnabled(
            currentConfig.overview,
            sportType,
            metricId,
          );

          return {
            config: {
              ...currentConfig,
              overview: {
                ...currentConfig.overview,
                [storageKey]: !currentEnabled,
              },
            },
          };
        }),
    }),
    {
      name: "activity-config-v1",
      storage: createJSONStorage(getBrowserLocalStorage),
      merge: (persisted, current) => {
        const persistedConfig =
          typeof persisted === "object" && persisted && "config" in persisted
            ? (persisted as { config?: Partial<ActivityConfig> }).config
            : undefined;

        return {
          ...current,
          ...(typeof persisted === "object" && persisted ? persisted : {}),
          config: normalizeActivityConfig(persistedConfig),
        } as ActivityConfigStore;
      },
    },
  ),
);

export function useActivityConfig() {
  const store = useActivityConfigStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return {
    ...store,
    // Use default config during SSR and first client render to avoid hydration mismatch
    config: isMounted
      ? normalizeActivityConfig(store.config)
      : DEFAULT_CONFIG,
    isMounted,
  };
}

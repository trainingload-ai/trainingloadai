import { create } from "zustand";
import { Time } from "@/components/DateSelector/types";
import dayjs from "dayjs";
import { getUserSettings, updateUserSetting } from "@/api/settings";

type TimeBucket = "minute" | "hour" | "day" | "week" | "month";
export type SportType = "all" | "RUN" | "CYCLING" | "SWIM";
export type PowerUnit = "watts" | "watts_per_kg";
export type Theme = "light" | "dark" | "system";
export type ChartXaxis = "distance" | "time";
export type TimeFormat = "24h" | "12h";
// Page filters state interface
interface PageFilters {
  time: Time;
  previousTime: Time;
  selectedSportType: SportType;
}

interface DashboardPageFilters {
  time: Time;
  previousTime: Time;
  selectedSportType: SportType;
}

// Page times filters state interface
interface PageTimesFilters {
  time: Time[];
  selectedSportType: SportType;
}

export interface HeartRateFilters extends PageTimesFilters {
  activeTab: "curve" | "zones";
}

export interface PowerFilters extends PageTimesFilters {
  activeTab: "curve" | "maximum" | "profile" | "zones";
}

export interface PaceFilters extends PageTimesFilters {
  activeTab: "curve" | "zones";
}
interface BestDistanceFilters {
  time: Time[];
  selectedSportType: SportType;
  selectedDistances: string[];
}

// Activities page specific filters state
interface ActivitiesFilters extends PageFilters {
  orderBy: string;
  orderDirection: "asc" | "desc";
}

type Store = {
  powerFilters: PowerFilters;
  heartRateFilters: HeartRateFilters;
  paceFilters: PaceFilters;
  bestDistanceFilters: BestDistanceFilters;
  pmcFilters: PageFilters;
  // Global state (reserved for other features)
  bucket?: TimeBucket;

  // Independent filter states for each page
  dashboardFilters: DashboardPageFilters;
  mapFilters: PageFilters;
  activitiesFilters: ActivitiesFilters;

  // Filter setting methods
  setHeartRateTimes: (times: Time[]) => void;
  setHeartRateSportType: (type: SportType) => void;
  setHeartRateActiveTab: (tab: HeartRateFilters["activeTab"]) => void;
  setPowerTimes: (times: Time[]) => void;
  setPaceTimes: (times: Time[]) => void;
  setPaceActiveTab: (tab: PaceFilters["activeTab"]) => void;
  setPmcTime: (time: Time) => void;
  setPmcSportType: (type: SportType) => void;
  setDashboardTime: (time: Time) => void;
  setDashboardSportType: (type: SportType) => void;
  setPowerSportType: (type: SportType) => void;
  setPowerActiveTab: (tab: PowerFilters["activeTab"]) => void;
  setPaceSportType: (type: SportType) => void;
  setBestDistanceTimes: (times: Time[]) => void;
  setBestDistanceSportType: (type: SportType) => void;
  setBestDistanceDistances: (distances: string[]) => void;
  setMapTime: (time: Time) => void;
  setMapSportType: (type: SportType) => void;
  setActivitiesTime: (time: Time) => void;
  setActivitiesSportType: (type: SportType) => void;
  setActivitiesOrderBy: (orderBy: string) => void;
  setActivitiesOrderDirection: (orderDirection: "asc" | "desc") => void;
  selectedStat: { id: string; metric: string };
  setSelectedStat: (id: string, metric: string) => void;
  activitySelectedStat: { id: string; metric: string };
  setActivitySelectedStat: (id: string, metric: string) => void;
  pmcSelectedStat: { id: string; metric: string };
  setPmcSelectedStat: (id: string, metric: string) => void;
  activitiesPage: number;
  setActivitiesPage: (value: number) => void;
  mapType: "tianditu" | "openstreetmap";
  setMapType: (value: "tianditu" | "openstreetmap") => void;
  chartXaxis: ChartXaxis;
  setChartXaxis: (chartXaxis: ChartXaxis) => void;
  timeFormat: TimeFormat;
  setTimeFormat: (timeFormat: TimeFormat) => void;
  systemUnit: "metric" | "imperial";
  setSystemUnit: (unit: "metric" | "imperial") => void;
  powerUnit: PowerUnit;
  setPowerUnit: (unit: PowerUnit) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  // API methods for settings
  loadSettings: () => Promise<void>;
  updateSetting: (category: string, value: string) => Promise<void>;
};

// Helper function to calculate previousTime
export const calculatePreviousTime = (time: Time): Time => {
  if (time.mode === "day") {
    return {
      mode: "day",
      day: dayjs(time.day).subtract(1, "day").toISOString(),
    };
  } else if (time.mode === "past-minutes") {
    const timeDiff = time.pastMinutesStart - time.pastMinutesEnd;
    return {
      mode: "past-minutes",
      pastMinutesStart: time.pastMinutesStart + timeDiff,
      pastMinutesEnd: time.pastMinutesEnd + timeDiff,
    };
  } else if (time.mode === "range") {
    const timeRangeLength =
      dayjs(time.endDate).diff(dayjs(time.startDate), "day") + 1;
    return {
      mode: "range",
      startDate: dayjs(time.startDate)
        .subtract(timeRangeLength, "day")
        .toISOString(),
      endDate: dayjs(time.startDate).subtract(1, "day").toISOString(),
    };
  } else if (time.mode === "week") {
    return {
      mode: "week",
      week: dayjs(time.week).subtract(1, "week").toISOString(),
    };
  } else if (time.mode === "month") {
    return {
      mode: "month",
      month: dayjs(time.month).subtract(1, "month").toISOString(),
    };
  } else if (time.mode === "year") {
    return {
      mode: "year",
      year: dayjs(time.year).subtract(1, "year").toISOString(),
    };
  } else if (time.mode === "all-time") {
    return {
      mode: "all-time",
    };
  } else {
    return time; // fallback case
  }
};

// 默认过滤器状态
const defaultFilters: PageFilters = {
  time: {
    mode: "range",
    startDate: dayjs().subtract(6, "day").toISOString(),
    endDate: dayjs().toISOString(),
    wellKnown: "Last 7 days",
  },
  previousTime: {
    mode: "range",
    startDate: dayjs().subtract(13, "day").toISOString(),
    endDate: dayjs().subtract(7, "day").toISOString(),
  },
  selectedSportType: "all",
};

const defaultDashboardFilters: DashboardPageFilters = {
  time: {
    mode: "range",
    startDate: dayjs().subtract(29, "day").toISOString(),
    endDate: dayjs().toISOString(),
    wellKnown: "Last 30 days",
  },
  previousTime: {
    mode: "range",
    startDate: dayjs().subtract(59, "day").toISOString(),
    endDate: dayjs().subtract(30, "day").toISOString(),
  },
  selectedSportType: "all",
};

// Activities 页面默认过滤器状态
const defaultActivitiesFilters: ActivitiesFilters = {
  ...defaultFilters,
  orderBy: "startTime",
  orderDirection: "desc",
};

const defaultMapFilters: PageFilters = {
  ...defaultFilters,
  time: {
    mode: "all-time",
  },
};

// Heart Rate 页面默认过滤器状态（今年）
const defaultHeartRateFilters: HeartRateFilters = {
  time: [
    {
      mode: "year",
      year: dayjs().startOf("year").toISOString(),
    },
  ],
  selectedSportType: "all",
  activeTab: "curve",
};

// Power 页面默认过滤器状态（今年）
const defaultPowerFilters: PowerFilters = {
  time: [
    {
      mode: "year",
      year: dayjs().startOf("year").toISOString(),
    },
  ],
  selectedSportType: "all",
  activeTab: "curve",
};

// Pace 页面默认过滤器状态（今年）
const defaultPaceFilters: PaceFilters = {
  time: [
    {
      mode: "year",
      year: dayjs().startOf("year").toISOString(),
    },
  ],
  selectedSportType: "RUN",
  activeTab: "curve",
};

const defaultBestDistanceFilters: BestDistanceFilters = {
  time: [
    {
      mode: "all-time",
    },
  ],
  selectedSportType: "RUN",
  selectedDistances: ["1000", "5000", "10000", "21097", "42195"],
};

// PMC 页面默认过滤器状态（最近 60 天）
const defaultPMCFilters: PageFilters = {
  time: {
    mode: "range",
    startDate: dayjs().subtract(59, "day").toISOString(),
    endDate: dayjs().toISOString(),
    wellKnown: "Last 60 days",
  },
  previousTime: calculatePreviousTime({
    mode: "range",
    startDate: dayjs().subtract(59, "day").toISOString(),
    endDate: dayjs().toISOString(),
    wellKnown: "Last 60 days",
  }),
  selectedSportType: "all",
};

export const useStore = create<Store>((set) => ({
  // 各页面独立的过滤状态
  dashboardFilters: { ...defaultDashboardFilters },
  mapFilters: { ...defaultMapFilters },
  activitiesFilters: { ...defaultActivitiesFilters },
  pmcFilters: { ...defaultPMCFilters },

  powerFilters: defaultPowerFilters,
  heartRateFilters: defaultHeartRateFilters,
  paceFilters: defaultPaceFilters,
  bestDistanceFilters: defaultBestDistanceFilters,

  setHeartRateTimes: (times: Time[]) => {
    set((state) => ({
      heartRateFilters: {
        ...state.heartRateFilters,
        time: times,
      },
    }));
  },
  setHeartRateSportType: (type: SportType) => {
    set((state) => ({
      heartRateFilters: {
        ...state.heartRateFilters,
        selectedSportType: type,
      },
    }));
  },
  setHeartRateActiveTab: (tab: HeartRateFilters["activeTab"]) => {
    set((state) => ({
      heartRateFilters: {
        ...state.heartRateFilters,
        activeTab: tab,
      },
    }));
  },
  setPowerTimes: (times: Time[]) => {
    set((state) => ({
      powerFilters: {
        ...state.powerFilters,
        time: times,
      },
    }));
  },
  setPowerActiveTab: (tab: PowerFilters["activeTab"]) => {
    set((state) => ({
      powerFilters: {
        ...state.powerFilters,
        activeTab: tab,
      },
    }));
  },
  setPaceTimes: (times: Time[]) => {
    set((state) => ({
      paceFilters: {
        ...state.paceFilters,
        time: times,
      },
    }));
  },
  setPaceActiveTab: (tab: PaceFilters["activeTab"]) => {
    set((state) => ({
      paceFilters: {
        ...state.paceFilters,
        activeTab: tab,
      },
    }));
  },
  setBestDistanceTimes: (times: Time[]) => {
    set((state) => ({
      bestDistanceFilters: {
        ...state.bestDistanceFilters,
        time: times,
      },
    }));
  },
  setBestDistanceSportType: (type) => {
    set((state) => ({
      bestDistanceFilters: {
        ...state.bestDistanceFilters,
        selectedSportType: type,
        selectedDistances: [],
      },
    }));
  },
  setBestDistanceDistances: (distances: string[]) => {
    set((state) => ({
      bestDistanceFilters: {
        ...state.bestDistanceFilters,
        selectedDistances: distances,
      },
    }));
  },

  setPmcTime: (time) => {
    set((state) => ({
      pmcFilters: {
        ...state.pmcFilters,
        time,
        previousTime: calculatePreviousTime(time),
      },
    }));
  },
  setPmcSportType: (type) => {
    set((state) => ({
      pmcFilters: {
        ...state.pmcFilters,
        selectedSportType: type,
      },
    }));
  },

  // Dashboard filter setting methods
  setDashboardTime: (time) => {
    const previousTime = calculatePreviousTime(time);
    set((state) => ({
      dashboardFilters: {
        ...state.dashboardFilters,
        time,
        previousTime,
      },
    }));
  },
  setDashboardSportType: (type) => {
    set((state) => ({
      dashboardFilters: {
        ...state.dashboardFilters,
        selectedSportType: type,
      },
    }));
  },
  setPowerSportType: (type) => {
    set((state) => ({
      powerFilters: {
        ...state.powerFilters,
        selectedSportType: type,
      },
    }));
  },
  setPaceSportType: (type) => {
    set((state) => ({
      paceFilters: {
        ...state.paceFilters,
        selectedSportType: type,
      },
    }));
  },

  // Map filter setting methods
  setMapTime: (time) => {
    const previousTime = calculatePreviousTime(time);
    set((state) => ({
      mapFilters: {
        ...state.mapFilters,
        time,
        previousTime,
      },
    }));
  },
  setMapSportType: (type) => {
    set((state) => ({
      mapFilters: {
        ...state.mapFilters,
        selectedSportType: type,
      },
    }));
  },

  // Activities filter setting methods
  setActivitiesTime: (time) => {
    const previousTime = calculatePreviousTime(time);
    set((state) => ({
      activitiesFilters: {
        ...state.activitiesFilters,
        time,
        previousTime,
      },
    }));
  },
  setActivitiesSportType: (type) => {
    set((state) => ({
      activitiesFilters: {
        ...state.activitiesFilters,
        selectedSportType: type,
      },
    }));
  },
  setActivitiesOrderBy: (orderBy) => {
    set((state) => ({
      activitiesFilters: {
        ...state.activitiesFilters,
        orderBy,
      },
    }));
  },
  setActivitiesOrderDirection: (orderDirection) => {
    set((state) => ({
      activitiesFilters: {
        ...state.activitiesFilters,
        orderDirection,
      },
    }));
  },
  selectedStat: { id: "count", metric: "count" },
  setSelectedStat: (id: string, metric: string) =>
    set({ selectedStat: { id, metric } }),
  activitySelectedStat: { id: "speed", metric: "speed" },
  setActivitySelectedStat: (id: string, metric: string) =>
    set({ activitySelectedStat: { id, metric } }),
  pmcSelectedStat: { id: "fitness", metric: "fitness" },
  setPmcSelectedStat: (id: string, metric: string) =>
    set({ pmcSelectedStat: { id, metric } }),
  activitiesPage: 1,
  setActivitiesPage: (activitiesPage) => set({ activitiesPage }),
  mapType: "openstreetmap",
  setMapType: (mapType: "tianditu" | "openstreetmap") => set({ mapType }),
  systemUnit: "metric",
  setSystemUnit: (systemUnit: "metric" | "imperial") => set({ systemUnit }),
  powerUnit: "watts",
  setPowerUnit: (powerUnit: PowerUnit) => set({ powerUnit }),
  theme: "system",
  setTheme: (theme: Theme) => set({ theme }),
  chartXaxis: "distance",
  setChartXaxis: (chartXaxis: ChartXaxis) => set({ chartXaxis }),
  timeFormat: "24h",
  setTimeFormat: (timeFormat: TimeFormat) => set({ timeFormat }),
  // API methods for settings
  loadSettings: async () => {
    try {
      const settings = await getUserSettings();
      set({
        systemUnit:
          (settings?.UNIT_SYSTEM as "metric" | "imperial") || "metric",
        powerUnit: (settings?.POWER_UNIT as PowerUnit) || "watts",
        theme: (settings?.THEME as Theme) || "system",
        chartXaxis: (settings?.CHART_XAXIS as ChartXaxis) || "distance",
        timeFormat: (settings?.TIME_FORMAT as TimeFormat) || "24h",
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  },
  updateSetting: async (category, value) => {
    try {
      await updateUserSetting(category, value);
      // Update local state based on category
      if (category === "power_unit") {
        set({ powerUnit: value as PowerUnit });
      } else if (category === "theme") {
        set({ theme: value as Theme });
      } else if (category === "unit_system") {
        set({ systemUnit: value as "metric" | "imperial" });
      } else if (category === "chart_xaxis") {
        set({ chartXaxis: value as ChartXaxis });
      } else if (category === "time_format") {
        set({ timeFormat: value as TimeFormat });
      }
    } catch (error) {
      console.error("Failed to update setting:", error);
      throw error;
    }
  },
}));

export const goPageBack = () => {
  const { activitiesPage, setActivitiesPage } = useStore.getState();
  if (activitiesPage > 1) {
    setActivitiesPage(activitiesPage - 1);
  }
};

export const goPageForward = () => {
  const { activitiesPage, setActivitiesPage } = useStore.getState();
  setActivitiesPage(activitiesPage + 1);
};

// Create common time navigation function
export const createTimeNavigation = (
  time: Time,
  setTime: (time: Time) => void,
) => {
  const goBack = () => {
    if (time.mode === "day") {
      setTime({
        mode: "day",
        day: dayjs(time.day).subtract(1, "day").toISOString(),
      });
    } else if (time.mode === "range") {
      const startDate = dayjs(time.startDate);
      const endDate = dayjs(time.endDate);
      const daysBetweenStartAndEnd = endDate.diff(startDate, "day");
      setTime({
        mode: "range",
        startDate: startDate
          .subtract(daysBetweenStartAndEnd, "day")
          .toISOString(),
        endDate: startDate.toISOString(),
      });
    } else if (time.mode === "week") {
      setTime({
        mode: "week",
        week: dayjs(time.week).subtract(1, "week").toISOString(),
      });
    } else if (time.mode === "month") {
      setTime({
        mode: "month",
        month: dayjs(time.month).subtract(1, "month").toISOString(),
      });
    } else if (time.mode === "year") {
      setTime({
        mode: "year",
        year: dayjs(time.year).subtract(1, "year").toISOString(),
      });
    }
  };

  const goForward = () => {
    if (time.mode === "day") {
      setTime({
        mode: "day",
        day: dayjs(time.day).add(1, "day").toISOString(),
      });
    } else if (time.mode === "range") {
      const startDate = dayjs(time.startDate);
      const endDate = dayjs(time.endDate);
      const daysBetweenStartAndEnd = endDate.diff(startDate, "day");
      setTime({
        mode: "range",
        startDate: endDate.add(1, "day").toISOString(),
        endDate: endDate.add(daysBetweenStartAndEnd + 1, "day").toISOString(),
      });
    } else if (time.mode === "week") {
      setTime({
        mode: "week",
        week: dayjs(time.week).add(1, "week").toISOString(),
      });
    } else if (time.mode === "month") {
      setTime({
        mode: "month",
        month: dayjs(time.month).add(1, "month").toISOString(),
      });
    } else if (time.mode === "year") {
      setTime({
        mode: "year",
        year: dayjs(time.year).add(1, "year").toISOString(),
      });
    }
  };

  return { goBack, goForward };
};

// Helper function to check if can go forward
export const canGoForward = (time: Time): boolean => {
  const now = dayjs();

  if (time.mode === "day") {
    return dayjs(time.day).isBefore(now, "day");
  } else if (time.mode === "range") {
    return dayjs(time.endDate).isBefore(now, "day");
  } else if (time.mode === "week") {
    return dayjs(time.week).endOf("week").isBefore(now, "day");
  } else if (time.mode === "month") {
    return dayjs(time.month).endOf("month").isBefore(now, "day");
  } else if (time.mode === "year") {
    return dayjs(time.year).endOf("year").isBefore(now, "day");
  }

  return false;
};

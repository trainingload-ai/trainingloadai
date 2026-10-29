import { timeToRange } from "@/lib/timeRange";
import type { Time } from "@/components/DateSelector/types";
import type { SportType } from "@/lib/store";

interface FilterParams {
  sportType?: string;
  startDate?: string;
  endDate?: string;
}

interface MapFilters {
  time: Time;
  selectedSportType: SportType;
}

export const buildFilterParams = (mapFilters: MapFilters): FilterParams => {
  const { time, selectedSportType } = mapFilters;

  const tr = timeToRange(time);
  const st = selectedSportType;

  return {
    ...(st !== "all" && { sportType: st }),
    ...(tr?.start && { startDate: tr.start }),
    ...(tr?.end && { endDate: tr.end }),
  };
};

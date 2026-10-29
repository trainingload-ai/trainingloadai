"use client";

import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import SportTypeFilter from "./ActivityFilter";
import { DateSelectorByRange } from "../DateSelector/DateSelectorByRange";

dayjs.extend(isSameOrAfter);

interface DashboardSubHeaderProps {
  time: Time;
  setTime: (time: Time) => void;
  selectedSportType?: SportType;
  setSportType?: (type: SportType) => void;
  exclude?: string[];
  buttons?: React.ReactNode[];
}

export function DashboardSubHeader({
  time,
  setTime,
  selectedSportType,
  setSportType,
  exclude = [],
  buttons = [],
}: DashboardSubHeaderProps) {
  return (
    <div>
      <div className="flex gap-2 mb-2 justify-between">
        {setSportType && selectedSportType ? (
          <SportTypeFilter
            selectedSportType={selectedSportType}
            setSportType={setSportType}
          />
        ) : (
          <div></div>
        )}
        <div className="flex items-center gap-2">
          {buttons.map((button, index) => (
            <div key={index}>{button}</div>
          ))}
          <DateSelectorByRange
            time={time}
            setTime={setTime}
            exclude={exclude}
          />
        </div>
      </div>
    </div>
  );
}

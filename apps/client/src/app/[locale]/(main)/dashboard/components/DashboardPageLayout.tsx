"use client";

import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";
import { DashboardSubHeader } from "./DashboardSubHeader";

interface DashboardPageLayoutProps {
  children: React.ReactNode;
  time: Time;
  setTime: (time: Time) => void;
  selectedSportType?: SportType;
  setSportType?: (type: SportType) => void;
  showFilters?: boolean;
  exclude?: string[];
  buttons?: React.ReactNode[];
}

export function DashboardPageLayout({
  children,
  time,
  setTime,
  selectedSportType,
  setSportType,
  showFilters = true,
  exclude = [],
  buttons = [],
}: DashboardPageLayoutProps) {
  return (
    <div className="flex flex-col h-full gap-2 lg:gap-3">
      {showFilters && (
        <DashboardSubHeader
          time={time}
          setTime={setTime}
          selectedSportType={selectedSportType}
          setSportType={setSportType}
          exclude={exclude}
          buttons={buttons}
        />
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

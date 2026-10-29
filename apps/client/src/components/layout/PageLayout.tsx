"use client";

import { SubHeader } from "@/components/SubHeader/SubHeader";
import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";

interface PageLayoutProps {
  children: React.ReactNode;
  time: Time;
  setTime: (time: Time) => void;
  selectedSportType?: SportType;
  setSportType?: (type: SportType) => void;
  showFilters?: boolean;
  exclude?: string[];
  buttons?: React.ReactNode[];
}

export function PageLayout({
  children,
  time,
  setTime,
  selectedSportType,
  setSportType,
  showFilters = true,
  exclude = [],
  buttons = [],
}: PageLayoutProps) {
  return (
    <div className="flex flex-col h-full gap-2 lg:gap-2">
      {showFilters && (
        <SubHeader
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

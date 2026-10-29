"use client";

import SportTypeFilter from "@/components/SubHeader/ActivityFilter";
import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";
import type { ReactNode } from "react";

interface DashboardSubHeaderProps {
  time: Time;
  setTime: (time: Time) => void;
  selectedSportType?: SportType;
  setSportType?: (type: SportType) => void;
  exclude?: string[];
  buttons?: ReactNode[];
}

export function DashboardSubHeader({
  selectedSportType,
  setSportType,
  buttons = [],
}: DashboardSubHeaderProps) {
  return (
    <div >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-100 px-2.5 py-2 dark:bg-muted/45">
        <div className="flex min-w-0 items-center gap-2">
          {setSportType && selectedSportType ? (
            <SportTypeFilter
              selectedSportType={selectedSportType}
              setSportType={setSportType}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {buttons.map((button, index) => (
            <div key={index}>{button}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

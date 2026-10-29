"use client";
import { Button } from "@/components/ui/button";
import { createTimeNavigation, canGoForward } from "@/lib/store";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { DateSelector } from "@/components/DateSelector/DateSelector";
import { Time } from "@/components/DateSelector/types";
import { SportType } from "@/lib/store";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import SportTypeFilter from "./ActivityFilter";
import { DateAdd } from "../DateSelector/DateAdd";
import { DateMultiSelectDropdown } from "../DateSelector/DateMultiSelectDropdown";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

dayjs.extend(isSameOrAfter);

interface SubHeaderProps {
  time: Time;
  setTime: (time: Time) => void;
  selectedSportType?: SportType;
  setSportType?: (type: SportType) => void;
  exclude?: string[];
  buttons?: React.ReactNode[];
}

interface SubHeaderWithTimesProps {
  times: Time[];
  setTimes: (times: Time[]) => void;
  selectedSportType: SportType;
  setSportType: (type: SportType) => void;
  exclude?: string[];
  allowAll?: boolean;
  // 是否支持多选时间范围
  multiple?: boolean;
  inlineMobile?: boolean;
  compactAllLabel?: boolean;
  allowedSportTypes?: Array<Exclude<SportType, "all">>;
}

export function SubHeader({
  time,
  setTime,
  selectedSportType,
  setSportType,
  exclude = [],
  buttons = [],
}: SubHeaderProps) {
  const { goBack, goForward } = createTimeNavigation(time, setTime);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {setSportType && selectedSportType ? (
          <SportTypeFilter
            selectedSportType={selectedSportType}
            setSportType={setSportType}
          />
        ) : (
          <div></div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {buttons.map((button, index) => (
            <div key={index}>{button}</div>
          ))}
          <DateSelector time={time} setTime={setTime} exclude={exclude} />
          {!exclude.length ? (
            <div className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={goBack}
                disabled={time.mode === "past-minutes"}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goForward}
                disabled={!canGoForward(time)}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SubHeaderWithTimes({
  times,
  setTimes,
  selectedSportType,
  setSportType,
  exclude = [],
  allowAll = true,
  multiple = true,
  inlineMobile = false,
  compactAllLabel = false,
  allowedSportTypes,
}: SubHeaderWithTimesProps) {
  const isMobile = useIsMobile();
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 md:mb-2 md:gap-2",
          inlineMobile &&
            "[&_button]:h-8 [&_button]:overflow-hidden [&_button]:rounded-compact [&_button]:px-2 [&_button]:text-sm",
        )}
      >
        <div
          className={cn(
            "min-w-0 flex-1 md:flex-none",
            inlineMobile && "w-[6.5rem] flex-none [&_button]:w-full",
          )}
        >
          <SportTypeFilter
            selectedSportType={selectedSportType}
            setSportType={setSportType}
            allowAll={allowAll}
            compactAllLabel={compactAllLabel}
            allowedSportTypes={allowedSportTypes}
          />
        </div>
        <div
          className={cn(
            "min-w-0 flex-1 [&_button]:w-full md:[&_button]:w-auto",
            inlineMobile &&
              "max-w-[4.5rem] flex-none [&_button]:w-auto [&_button]:max-w-full",
          )}
        >
          {multiple ? (
            isMobile ? (
              <DateMultiSelectDropdown
                times={times}
                setTimes={setTimes}
                exclude={exclude}
              />
            ) : (
              <DateAdd times={times} setTimes={setTimes} exclude={exclude} />
            )
          ) : (
            <DateSelector
              time={times[0]}
              setTime={(time) => setTimes([time])}
              exclude={exclude}
            />
          )}
        </div>
      </div>
    </div>
  );
}

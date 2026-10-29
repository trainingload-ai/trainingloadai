"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";
import MonthYearPicker from "./MonthYearPicker";
import { useTranslations } from "next-intl";
import { CalendarPlanActions } from "./CalendarPlanActions";

interface CalendarHeaderProps {
  monthLabel: string;
  displayMode: "week" | "month";
  showDisplayModeToggle?: boolean;
  onDisplayModeChange: (mode: "week" | "month") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  currentMonthDate: Date;
  onMonthChange: (month: Date) => void;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  monthLabel,
  displayMode,
  showDisplayModeToggle = true,
  onDisplayModeChange,
  onPrev,
  onNext,
  onToday,
  currentMonthDate,
  onMonthChange,
}) => {
  const t = useTranslations("CalendarHeader");

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 md:flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="auto"
                  className="min-w-0 max-w-full p-2 text-left text-md font-semibold tracking-tight"
                >
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span className="truncate">{monthLabel}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <MonthYearPicker
                  value={currentMonthDate}
                  onChange={(date) => onMonthChange(date)}
                  fromYear={2000}
                  toYear={dayjs().year() + 5}
                />
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1 rounded-md bg-background/80">
              <Button
                variant="ghost"
                size="icon"
                onClick={onPrev}
                aria-label={t("prevMonth")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="px-2.5"
                onClick={onToday}
              >
                {t("today")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNext}
                aria-label={t("nextMonth")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden min-w-0 items-center justify-between gap-2 md:flex md:shrink-0 md:justify-end">
          {showDisplayModeToggle ? (
            <div className="inline-flex rounded-md bg-neutral-100 dark:bg-muted/45 p-1">
              {(["week", "month"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onDisplayModeChange(mode)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    displayMode === mode
                      ? "bg-background text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {mode === "week" ? t("weekMode") : t("monthMode")}
                </button>
              ))}
            </div>
          ) : null}

          <CalendarPlanActions />
        </div>
      </div>
    </div>
  );
};

export default CalendarHeader;

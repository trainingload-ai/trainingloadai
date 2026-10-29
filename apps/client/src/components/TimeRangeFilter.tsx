"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock } from "lucide-react";

export type TimeRangeOption =
  | "all-time"
  | "past-7-days"
  | "past-1-month"
  | "past-6-months"
  | "past-1-year";

export interface TimeRangeFilterProps {
  value: TimeRangeOption;
  onChange: (value: TimeRangeOption) => void;
  className?: string;
}

const timeRangeOptions = [
  { value: "all-time" as const, labelKey: "range.allTime", icon: Calendar },
  { value: "past-7-days" as const, labelKey: "range.past7Days", icon: Clock },
  { value: "past-1-month" as const, labelKey: "range.past1Month", icon: Clock },
  {
    value: "past-6-months" as const,
    labelKey: "range.past6Months",
    icon: Clock,
  },
  { value: "past-1-year" as const, labelKey: "range.past1Year", icon: Clock },
];

export const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({
  value,
  onChange,
  className,
}) => {
  const t = useTranslations("TimeFilters");
  const selectedOption = timeRangeOptions.find(
    (option) => option.value === value,
  );
  const Icon = selectedOption?.icon || Calendar;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`w-[140px] ${className || ""}`}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <SelectValue placeholder={t("range.placeholder")} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {timeRangeOptions.map((option) => {
          const OptionIcon = option.icon;
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <OptionIcon className="h-4 w-4" />
                <span>{t(option.labelKey)}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default TimeRangeFilter;

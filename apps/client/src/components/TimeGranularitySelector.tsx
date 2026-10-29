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

export type TimeGranularity = "day" | "week" | "month" | "year" | "all-time";

interface TimeGranularitySelectorProps {
  value: TimeGranularity;
  onChange: (value: TimeGranularity) => void;
  className?: string;
}

const timeGranularityOptions = [
  { value: "day" as const, labelKey: "granularity.day" },
  { value: "week" as const, labelKey: "granularity.week" },
  { value: "month" as const, labelKey: "granularity.month" },
  { value: "year" as const, labelKey: "granularity.year" },
  { value: "all-time" as const, labelKey: "granularity.allTime" },
];

export function TimeGranularitySelector({
  value,
  onChange,
  className,
}: TimeGranularitySelectorProps) {
  const t = useTranslations("TimeFilters");

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={t("granularity.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {timeGranularityOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

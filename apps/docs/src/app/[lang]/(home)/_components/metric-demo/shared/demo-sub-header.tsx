"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bike,
  ChevronDown,
  FlameKindling,
  Waves,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DemoSportType, DemoTimeKey } from "./demo-types";

const SPORT_ICONS: Record<DemoSportType, typeof Activity> = {
  all: Activity,
  RUN: FlameKindling,
  CYCLING: Bike,
  SWIM: Waves,
};

export function useDemoFilters(defaults?: {
  sportType?: DemoSportType;
  times?: DemoTimeKey[];
  singleTime?: DemoTimeKey;
}) {
  const [sportType, setSportType] = useState<DemoSportType>(
    defaults?.sportType ?? "all",
  );
  const [times, setTimes] = useState<DemoTimeKey[]>(
    defaults?.times ?? ["thisYear", "last30"],
  );
  const [singleTime, setSingleTime] = useState<DemoTimeKey>(
    defaults?.singleTime ?? "last90",
  );

  const toggleTime = (key: DemoTimeKey) => {
    setTimes((current) =>
      current.includes(key)
        ? current.length > 1
          ? current.filter((item) => item !== key)
          : current
        : [...current, key],
    );
  };

  return {
    sportType,
    setSportType,
    times,
    setTimes,
    toggleTime,
    singleTime,
    setSingleTime,
  };
}

export function DemoSportFilter({
  value,
  options,
  onChange,
  allowAll = true,
}: {
  value: DemoSportType;
  options: Array<{ value: DemoSportType; label: string }>;
  onChange: (value: DemoSportType) => void;
  allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(
    () =>
      allowAll ? options : options.filter((option) => option.value !== "all"),
    [allowAll, options],
  );
  const current =
    filtered.find((option) => option.value === value) ?? filtered[0]!;
  const Icon = SPORT_ICONS[current.value] ?? Activity;

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-compact bg-background px-3 text-xs font-medium"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon className="size-3.5 text-muted-foreground" />
        {current.label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-compact border border-border/70 bg-background p-1 shadow-lg">
          {filtered.map((option) => {
            const OptionIcon = SPORT_ICONS[option.value] ?? Activity;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                  option.value === value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <OptionIcon className="size-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function DemoTimeChips({
  times,
  options,
  onToggle,
  multiple = true,
  singleValue,
  onSingleChange,
}: {
  times: DemoTimeKey[];
  options: Array<{ key: DemoTimeKey; label: string }>;
  onToggle: (key: DemoTimeKey) => void;
  multiple?: boolean;
  singleValue?: DemoTimeKey;
  onSingleChange?: (key: DemoTimeKey) => void;
}) {
  if (!multiple) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={cn(
              "rounded-compact px-2.5 py-1.5 text-xs transition-colors",
              singleValue === option.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onSingleChange?.(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = times.includes(option.key);
        return (
          <button
            key={option.key}
            type="button"
            className={cn(
              "rounded-compact px-2.5 py-1.5 text-xs transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onToggle(option.key)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function DemoSubHeader({
  sportType,
  sportOptions,
  onSportChange,
  allowAll = true,
  times,
  timeOptions,
  onToggleTime,
  multiple = true,
  singleTime,
  onSingleTimeChange,
  buttons,
}: {
  sportType: DemoSportType;
  sportOptions: Array<{ value: DemoSportType; label: string }>;
  onSportChange: (value: DemoSportType) => void;
  allowAll?: boolean;
  times: DemoTimeKey[];
  timeOptions: Array<{ key: DemoTimeKey; label: string }>;
  onToggleTime: (key: DemoTimeKey) => void;
  multiple?: boolean;
  singleTime?: DemoTimeKey;
  onSingleTimeChange?: (key: DemoTimeKey) => void;
  buttons?: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <DemoSportFilter
        value={sportType}
        options={sportOptions}
        onChange={onSportChange}
        allowAll={allowAll}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {buttons?.map((button, index) => (
          <div key={index}>{button}</div>
        ))}
        <DemoTimeChips
          times={times}
          options={timeOptions}
          onToggle={onToggleTime}
          multiple={multiple}
          singleValue={singleTime}
          onSingleChange={onSingleTimeChange}
        />
      </div>
    </div>
  );
}

export function DemoRecalculateButton({
  label,
  calculatingLabel,
}: {
  label: string;
  calculatingLabel: string;
}) {
  const [calculating, setCalculating] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={calculating}
      onClick={() => {
        setCalculating(true);
        window.setTimeout(() => setCalculating(false), 900);
      }}
    >
      {calculating ? calculatingLabel : label}
    </Button>
  );
}

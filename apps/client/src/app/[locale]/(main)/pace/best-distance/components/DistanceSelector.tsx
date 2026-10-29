"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { SportType } from "@/lib/store";

import { useTranslations } from "next-intl";

// Define distances per sport type
export const DISTANCE_OPTIONS: Record<
  string,
  { label: string; value: string; translationKey?: string }[]
> = {
  RUN: [
    { label: "400m", value: "400" },
    { label: "800m", value: "800" },
    // { label: '1000m', value: '1000'},
    { label: "1000m", value: "1000" },
    { label: "1500m", value: "1500" },
    { label: "1mi", value: "1609" },
    { label: "3km", value: "3000" },
    { label: "5km", value: "5000" },
    { label: "10km", value: "10000" },
    { label: "Half Marathon", value: "21097", translationKey: "halfMarathon" },
    { label: "Marathon", value: "42195", translationKey: "marathon" },
  ],
  CYCLING: [
    { label: "10km", value: "10000" },
    { label: "20km", value: "20000" },
    { label: "40km", value: "40000" },
    { label: "90km", value: "90000" },
    { label: "180km", value: "180000" },
  ],
  SWIM: [
    { label: "100m", value: "100" },
    { label: "400m", value: "400" },
    { label: "1500m", value: "1500" },
  ],
  all: [],
};

export const TIME_OPTIONS: Record<
  string,
  { label: string; value: string; translationKey?: string }[]
> = {
  RUN: [
    { label: "60s", value: "60s", translationKey: "1min" },
    { label: "5m", value: "300s", translationKey: "5min" },
    { label: "12m", value: "720s", translationKey: "cooperTest" },
    { label: "20m", value: "1200s", translationKey: "20min" },
    { label: "30m", value: "1800s", translationKey: "30min" },
    { label: "1h", value: "3600s", translationKey: "1hour" },
    { label: "2h", value: "7200s", translationKey: "2hour" },
    { label: "3h", value: "10800s", translationKey: "3hour" },
    { label: "5h", value: "18000s", translationKey: "5hour" },
    { label: "8h", value: "28800s", translationKey: "8hour" },
  ],
  CYCLING: [
    { label: "60s", value: "60s", translationKey: "1min" },
    { label: "5m", value: "300s", translationKey: "5min" },
    { label: "20m", value: "1200s", translationKey: "ftp20" },
    { label: "1h", value: "3600s", translationKey: "ftp60" },
    { label: "2h", value: "7200s", translationKey: "2hour" },
    { label: "3h", value: "10800s", translationKey: "3hour" },
    { label: "5h", value: "18000s", translationKey: "5hour" },
    { label: "8h", value: "28800s", translationKey: "8hour" },
  ],
  SWIM: [
    { label: "60s", value: "60s", translationKey: "1min" },
    { label: "5m", value: "300s", translationKey: "5min" },
    { label: "20m", value: "1200s", translationKey: "20min" },
    { label: "1h", value: "3600s", translationKey: "1hour" },
    { label: "2h", value: "7200s", translationKey: "2hour" },
  ],
  all: [],
};

interface DistanceSelectorProps {
  selectedSportType: SportType;
  selectedDistances: string[];
  onChange: (distances: string[]) => void;
}

export function DistanceSelector({
  selectedSportType,
  selectedDistances,
  onChange,
}: DistanceSelectorProps) {
  const t = useTranslations("bestDistance");
  const [open, setOpen] = React.useState(false);

  const options = DISTANCE_OPTIONS[selectedSportType] || [];

  const handleSelect = (currentValue: string) => {
    const isSelected = selectedDistances.includes(currentValue);
    if (isSelected) {
      onChange(selectedDistances.filter((value) => value !== currentValue));
    } else {
      onChange([...selectedDistances, currentValue]);
    }
  };

  const getLabel = (option: { label: string; translationKey?: string }) => {
    if (option.translationKey) {
      return t(`distances.${option.translationKey}`);
    }
    return option.label;
  };

  if (options.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        role="combobox"
        disabled
        className="w-[200px] justify-between"
      >
        {t("noDistances")}
        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="w-auto min-w-[150px] justify-between"
        >
          <div className="flex gap-1 flex-wrap items-center">
            {selectedDistances.length === 0 && (
              <span className="text-mobile-caption pc:text-xs">
                {t("selectDistances")}
              </span>
            )}
            {selectedDistances.length > 0 && (
              <div className="flex gap-1">
                {selectedDistances.length <= 2 ? (
                  selectedDistances.map((val) => {
                    const opt = options.find((o) => o.value === val);
                    return opt ? (
                      <Badge
                        key={val}
                        variant="secondary"
                        className="mr-1 h-5 px-1 text-mobile-unit pc:text-[10px]"
                      >
                        {getLabel(opt)}
                      </Badge>
                    ) : null;
                  })
                ) : (
                  <Badge
                    variant="secondary"
                    className="h-5 px-1 text-mobile-unit pc:text-[10px]"
                  >
                    {selectedDistances.length} {t("selected")}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedDistances.includes(option.value)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {getLabel(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

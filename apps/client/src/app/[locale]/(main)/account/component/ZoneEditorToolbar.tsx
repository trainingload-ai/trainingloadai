"use client";

import { AlertCircle, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SportType } from "@/api/activities";
import { BenchmarkType } from "./zoneSettings";
import { getZoneEditorSportLabel } from "./zone-editor-model";

type BenchmarkOption = {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  value: BenchmarkType;
};

export function ZoneEditorToolbar({
  benchmarks,
  currentBenchmarkLabel,
  currentBenchmarkVal,
  isCustom,
  isMobile,
  onBenchmarkChange,
  onSportChange,
  selectedBenchmark,
  sportOptions,
  benchmarkPickerOpen,
  sportPickerOpen,
  setBenchmarkPickerOpen,
  setSportPickerOpen,
  sportType,
  t,
  userZoneBenchmark,
}: {
  benchmarks: BenchmarkOption[];
  currentBenchmarkLabel?: string;
  currentBenchmarkVal: number;
  isCustom: boolean;
  isMobile: boolean;
  onBenchmarkChange: (value: BenchmarkType) => void;
  onSportChange: (value: SportType) => void;
  selectedBenchmark: BenchmarkType;
  sportOptions: SportType[];
  benchmarkPickerOpen: boolean;
  sportPickerOpen: boolean;
  setBenchmarkPickerOpen: (open: boolean) => void;
  setSportPickerOpen: (open: boolean) => void;
  sportType: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  userZoneBenchmark?: BenchmarkType;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        {isMobile ? (
          <AdaptiveDialog open={sportPickerOpen} onOpenChange={setSportPickerOpen}>
            <AdaptiveDialogTrigger asChild>
              <Button variant="outline" className="w-[140px] justify-between">
                <span className="truncate">
                  {getZoneEditorSportLabel({ sportType, t })}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </AdaptiveDialogTrigger>
            <AdaptiveDialogContent mobileClassName="p-0">
              <AdaptiveDialogHeader className="px-4 pt-4">
                <AdaptiveDialogTitle className="text-base font-medium">
                  {t("selectSport")}
                </AdaptiveDialogTitle>
              </AdaptiveDialogHeader>
              <div className="p-4 pt-0">
                <Command>
                  <CommandList>
                    <CommandGroup>
                      {sportOptions.map((value) => {
                        const label = getZoneEditorSportLabel({
                          sportType: value,
                          t,
                        });
                        const selected = sportType === value;
                        return (
                          <CommandItem
                            key={value}
                            value={value}
                            onSelect={() => {
                              onSportChange(value);
                              setSportPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {label}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            </AdaptiveDialogContent>
          </AdaptiveDialog>
        ) : (
          <Select value={sportType} onValueChange={(value) => onSportChange(value as SportType)}>
            <SelectTrigger size="default" className="w-[120px]">
              <SelectValue placeholder={t("selectSport")} />
            </SelectTrigger>
            <SelectContent>
              {sportOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {getZoneEditorSportLabel({ sportType: value, t })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex flex-row gap-2 items-center">
          {isMobile ? (
            <AdaptiveDialog
              open={benchmarkPickerOpen}
              onOpenChange={setBenchmarkPickerOpen}
            >
              <AdaptiveDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full min-w-0 sm:min-w-[180px] justify-between"
                >
                  <span className="truncate">
                    {benchmarks.find((item) => item.value === selectedBenchmark)?.label ??
                      t("selectBenchmark")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </AdaptiveDialogTrigger>
              <AdaptiveDialogContent mobileClassName="p-0">
                <AdaptiveDialogHeader className="px-4 pt-4">
                  <AdaptiveDialogTitle className="text-base font-medium">
                    {t("selectBenchmark")}
                  </AdaptiveDialogTitle>
                </AdaptiveDialogHeader>
                <div className="p-4 pt-0">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {benchmarks.map((benchmark) => {
                          const isSaved = userZoneBenchmark === benchmark.value;
                          const selected = selectedBenchmark === benchmark.value;
                          return (
                            <CommandItem
                              key={benchmark.value}
                              value={benchmark.value}
                              disabled={benchmark.disabled}
                              onSelect={() => {
                                if (benchmark.disabled) return;
                                onBenchmarkChange(benchmark.value);
                                setBenchmarkPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="flex-1 truncate">
                                {benchmark.label}
                                {isSaved ? ` ${t("current")}` : ""}
                                {benchmark.disabled && benchmark.disabledReason
                                  ? ` (${benchmark.disabledReason})`
                                  : ""}
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
              </AdaptiveDialogContent>
            </AdaptiveDialog>
          ) : (
            <Select
              value={selectedBenchmark}
              onValueChange={(value) => onBenchmarkChange(value as BenchmarkType)}
            >
              <SelectTrigger size="default" className="min-w-[200px]">
                <SelectValue placeholder={t("selectBenchmark")} />
              </SelectTrigger>
              <SelectContent>
                {benchmarks.map((benchmark) => {
                  const isSaved = userZoneBenchmark === benchmark.value;
                  return (
                    <SelectItem
                      key={benchmark.value}
                      value={benchmark.value}
                      disabled={benchmark.disabled}
                    >
                      {benchmark.label}
                      {isSaved ? ` ${t("current")}` : ""}
                      {benchmark.disabled && benchmark.disabledReason
                        ? ` (${benchmark.disabledReason})`
                        : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          {userZoneBenchmark && userZoneBenchmark !== selectedBenchmark && (
            <div className="flex-shrink-0 flex items-center gap-1.5 text-mobile-caption pc:text-xs text-amber-600 px-2 py-1.5 rounded-md animate-in fade-in slide-in-from-left-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">
                {t("currentUsed", {
                  benchmark: currentBenchmarkLabel || "",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {currentBenchmarkVal > 0 && !isCustom && (
        <div className="text-sm text-muted-foreground">
          {t("referenceValue")}:{" "}
          <span className="font-bold text-foreground">{currentBenchmarkVal}</span>
        </div>
      )}
    </div>
  );
}

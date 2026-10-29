"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
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
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ACTIVITY_STATS_METRIC_OPTIONS,
  getActivityMetricLabel,
  type SupportedMetricKey,
} from "./activities-stats-model";

export function ActivityMetricSelector({
  metricKey,
  onMetricKeyChange,
}: {
  metricKey: SupportedMetricKey;
  onMetricKeyChange: (metricKey: SupportedMetricKey) => void;
}) {
  const tActivities = useTranslations("activities");
  const tDashboard = useTranslations("dashboard");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const currentLabel = useMemo(
    () => getActivityMetricLabel(tActivities, tDashboard, metricKey),
    [metricKey, tActivities, tDashboard],
  );

  if (!isMobile) {
    return (
      <Select
        value={metricKey}
        onValueChange={(value) =>
          onMetricKeyChange(value as SupportedMetricKey)
        }
      >
        <SelectTrigger
          size="sm"
          className="h-6 w-auto max-w-[140px] border-0 bg-transparent text-muted-foreground shadow-none hover:text-foreground focus-visible:ring-0 data-[placeholder]:text-muted-foreground"
          // className="h-6 w-auto max-w-[140px] "
        >
          <SelectValue className="truncate" aria-label={currentLabel} />
        </SelectTrigger>
        <SelectContent>
          {ACTIVITY_STATS_METRIC_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {getActivityMetricLabel(tActivities, tDashboard, option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="px-0 font-normal text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent
        desktopClassName="sm:max-w-xs"
        mobileClassName="max-h-[70vh]"
      >
        <div className="p-4">
          <Command>
            <CommandList>
              <CommandGroup>
                {ACTIVITY_STATS_METRIC_OPTIONS.map((option) => {
                  const label = getActivityMetricLabel(
                    tActivities,
                    tDashboard,
                    option,
                  );
                  const selected = option === metricKey;

                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => {
                        onMetricKeyChange(option);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 truncate">{label}</span>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

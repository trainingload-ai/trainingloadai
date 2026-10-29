"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useFitnessStatusConfig,
  FitnessStatusConfig,
} from "@/hooks/useFitnessStatusConfig";

export function FitnessStatusConfigDialog() {
  const t = useTranslations("dashboard.fitnessStatus");
  const { config, toggleMetric, isMounted } = useFitnessStatusConfig();

  // Metrics list matching the keys in FitnessStatusConfig
  const metrics: { key: keyof FitnessStatusConfig; labelKey: string }[] = [
    { key: "vo2Max", labelKey: "vo2Max.title" },
    { key: "atl", labelKey: "atl.title" },
    { key: "ctl", labelKey: "ctl.title" },
    { key: "tsb", labelKey: "tsb.title" },
    { key: "acRatio", labelKey: "acRatio.title" },
    { key: "monotony", labelKey: "monotony.title" },
    { key: "intensity", labelKey: "intensity.title" },
    { key: "restDays", labelKey: "restDays.title" },
  ];

  if (!isMounted) {
    return (
      <Button size="sm" variant="outline" disabled>
        <Settings className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            {t.has("configuration") ? t("configuration") : "训练指标配置"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 py-4">
          {metrics.map((metric) => (
            <Item key={metric.key} variant="outline" size="sm">
              <ItemContent>
                <ItemTitle>
                  <Label
                    htmlFor={metric.key}
                    className="cursor-pointer font-normal"
                  >
                    {t(metric.labelKey)}
                  </Label>
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <Switch
                  id={metric.key}
                  checked={config[metric.key]}
                  onCheckedChange={() => toggleMetric(metric.key)}
                />
              </ItemActions>
            </Item>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

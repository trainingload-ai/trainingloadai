"use client";

import React, { useMemo } from "react";
import { calcClampedPercent, clamp, cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import type { PMCData } from "@/api/usePMC";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PMCStatProps {
  title: string;
  type: "fitness" | "fatigue" | "form";
  data: PMCData[] | [];
  isLoading?: boolean;
  extremes?: { ctl?: number; atl?: number } | null;
  className?: string;
}

const PMCStat: React.FC<PMCStatProps> = ({
  title,
  type,
  data,
  isLoading,
  extremes,
  className,
}) => {
  const { pmcSelectedStat, setPmcSelectedStat } = useStore();
  const t = useTranslations("PMC");

  const { value, unit } = useMemo(() => {
    // Get today's data (latest data point)
    const todayData = data && data.length > 0 ? data[data.length - 1] : null;

    if (!todayData) {
      return { value: "--", unit: "" };
    }

    const rawValue = todayData[type];

    // Check if the value is valid
    if (!isFinite(rawValue) || isNaN(rawValue)) {
      return { value: "--", unit: "" };
    }

    // Format value with 2 decimal places
    const formattedValue = rawValue.toFixed(2);

    return { value: formattedValue, unit: "" };
  }, [data, type]);

  const acmp = useMemo(() => {
    const todayData = data && data.length > 0 ? data[data.length - 1] : null;
    if (!todayData) return null;
    const ctl = todayData.fitness;
    const atl = todayData.fatigue;
    if (!isFinite(ctl) || !isFinite(atl) || ctl <= 0) return null;
    const ratio = atl / ctl;
    return Math.round(ratio * 100) / 100;
  }, [data]);

  const typeAbbr =
    type === "fitness"
      ? t("abbr.fitness")
      : type === "fatigue"
        ? t("abbr.fatigue")
        : t("abbr.form");

  const maxValue = useMemo(() => {
    if (type === "fitness") return extremes?.ctl;
    if (type === "fatigue") return extremes?.atl;
    return undefined;
  }, [extremes, type]);

  const fallbackMax = useMemo(() => {
    if (!data || data.length === 0) return undefined;
    if (type === "fitness") {
      const max = Math.max(
        ...data.map((d) => (Number.isFinite(d.fitness) ? d.fitness : 0)),
      );
      return max > 0 ? max : undefined;
    }
    if (type === "fatigue") {
      const max = Math.max(
        ...data.map((d) => (Number.isFinite(d.fatigue) ? d.fatigue : 0)),
      );
      return max > 0 ? max : undefined;
    }
    return undefined;
  }, [data, type]);

  const todayData = useMemo(() => {
    return data && data.length > 0 ? data[data.length - 1] : undefined;
  }, [data]);

  const barPercent = useMemo(() => {
    if (type === "fitness")
      return calcClampedPercent(todayData?.fitness, maxValue ?? fallbackMax);
    if (type === "fatigue")
      return calcClampedPercent(todayData?.fatigue, maxValue ?? fallbackMax);
    return 0;
  }, [fallbackMax, maxValue, todayData, type]);

  const tsbValue =
    todayData?.form !== undefined && Number.isFinite(todayData.form)
      ? todayData.form
      : 0;
  const tsbDomainMin = -40;
  const tsbDomainMax = 40;
  const tsbFillPercent = clamp(
    ((tsbValue - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100,
    0,
    100,
  );
  const tsbZone =
    tsbValue < -30
      ? "danger"
      : tsbValue < -10
        ? "optimal"
        : tsbValue < 5
          ? "neutral"
          : tsbValue < 25
            ? "fresh"
            : "transition";

  // Set color based on type
  const getTypeColor = (type: string) => {
    switch (type) {
      case "fitness":
        return "text-sky-600 dark:text-sky-400";
      case "fatigue":
        return "text-violet-600 dark:text-violet-400";
      case "form":
        return "text-slate-600 dark:text-slate-400";
      default:
        return "text-foreground";
    }
  };

  const getAcmpSwatchColor = (v: number | null) => {
    if (v == null) return "#9ca3af";
    if (v >= 1.5) return "#ef4444";
    if (v >= 0.8 && v <= 1.3) return "#22c55e";
    return "#9ca3af";
  };

  const isSelected = pmcSelectedStat?.id === type;
  const selectedClass =
    type === "fitness"
      ? "border-sky-400/60 bg-sky-500/[0.06] ring-1 ring-sky-400/25 dark:border-sky-400/45 dark:bg-sky-400/[0.08]"
      : type === "fatigue"
        ? "border-violet-400/60 bg-violet-500/[0.06] ring-1 ring-violet-400/25 dark:border-violet-400/45 dark:bg-violet-400/[0.08]"
        : "border-slate-300/80 bg-slate-500/[0.05] ring-1 ring-slate-300/40 dark:border-slate-500/60 dark:bg-slate-300/[0.06]";
  const focusClass =
    type === "fitness"
      ? "focus-visible:ring-sky-400/45"
      : type === "fatigue"
        ? "focus-visible:ring-violet-400/45"
        : "focus-visible:ring-slate-300/60";

  const selectMetric = () => {
    if (!isSelected) setPmcSelectedStat(type, type);
  };

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      aria-label={`${title} (${typeAbbr})`}
      tabIndex={0}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col rounded-md border border-neutral-200 bg-background/55 shadow-none transition-[background-color,border-color,box-shadow] hover:border-neutral-300 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-background/35 dark:hover:border-neutral-600 dark:hover:bg-background/70",
        focusClass,
        isSelected && selectedClass,
        className,
      )}
      onClick={selectMetric}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectMetric();
      }}
    >
      <div className="flex flex-col gap-3 px-3 py-2 md:gap-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{title}</span>
            <span
              className={cn(
                "rounded-full border border-border/70 px-1.5 py-0.5 text-mobile-unit text-muted-foreground/80 pc:text-[10px]",
                isSelected && getTypeColor(type),
              )}
            >
              {typeAbbr}
            </span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("metricsExplanation")}
                onClick={(event) => event.stopPropagation()}
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t(`${type}.title`)}</DialogTitle>
                <DialogDescription>
                  <span>{t(`${type}.description`)}</span>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex items-center justify-between gap-2 text-2xl font-medium">
          <div className="relative flex min-w-0 items-baseline gap-1">
            <span
              className={cn(
                "truncate font-medium transition-opacity duration-200",
                getTypeColor(type),
                isLoading && "opacity-30",
              )}
            >
              {value || "--"}
            </span>
            {unit && (
              <span
                className={cn(
                  "text-muted-foreground text-mobile-caption pc:text-xs transition-opacity duration-200",
                  isLoading && "opacity-30",
                )}
              >
                {unit}
              </span>
            )}
          </div>
          {type === "form" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size={"sm"}
                  type="button"
                  variant={"ghost"}
                  className="gap-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span
                    className={cn("text-mobile-caption pc:text-xs font-medium")}
                    style={{ color: getAcmpSwatchColor(acmp) }}
                  >
                    {acmp != null ? acmp.toFixed(2) : "--"}
                  </span>
                  <span className="text-mobile-caption pc:text-xs">ACMP</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("acmpHelp.title")}</DialogTitle>
                  <DialogDescription>
                    <div className="space-y-2 text-sm">
                      <p>{t("acmpHelp.formula")}</p>
                      <p>{t("acmpHelp.sweet")}</p>
                      <p>{t("acmpHelp.danger")}</p>
                      <p>{t("acmpHelp.advice")}</p>
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {type !== "form" && (
          <div className="relative h-4 bg-muted rounded-micro w-full overflow-hidden">
            <div
              className={cn(
                "absolute inset-0",
                type === "fitness"
                  ? "bg-[hsl(var(--sky-500)/0.16)]"
                  : "bg-[hsl(var(--violet-500)/0.16)]",
              )}
            />
            <div
              className={cn(
                "absolute left-0 top-0 h-4 rounded-micro",
                type === "fitness"
                  ? "bg-[hsl(var(--sky-500)/0.85)]"
                  : "bg-[hsl(var(--violet-500)/0.85)]",
              )}
              style={{ width: `${barPercent}%` }}
            />
          </div>
        )}

        {type === "form" && (
          <div className="relative h-4 bg-muted rounded-micro w-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-4 bg-[hsl(var(--red-400)/0.16)]"
              style={{
                width: `${((-30 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
              }}
            />
            <div
              className="absolute top-0 h-4 bg-[hsl(var(--emerald-500)/0.16)]"
              style={{
                left: `${((-30 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
                width: `${((-10 - -30) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
              }}
            />
            <div
              className="absolute top-0 h-4 bg-[hsl(var(--slate-300)/0.16)]"
              style={{
                left: `${((-10 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
                width: `${((5 - -10) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
              }}
            />
            <div
              className="absolute top-0 h-4 bg-[hsl(var(--sky-500)/0.16)]"
              style={{
                left: `${((5 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
                width: `${((25 - 5) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
              }}
            />
            <div
              className="absolute top-0 h-4 bg-[hsl(var(--amber-500)/0.16)]"
              style={{
                left: `${((25 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100}%`,
                width: `${Math.max(
                  0,
                  100 -
                    ((-30 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) *
                      100 -
                    ((-10 - -30) / (tsbDomainMax - tsbDomainMin)) * 100 -
                    ((5 - -10) / (tsbDomainMax - tsbDomainMin)) * 100 -
                    ((25 - 5) / (tsbDomainMax - tsbDomainMin)) * 100,
                )}%`,
              }}
            />
            <div
              className={cn(
                "absolute left-0 top-0 h-4 rounded-micro",
                tsbZone === "danger"
                  ? "bg-[hsl(var(--red-400)/0.85)]"
                  : tsbZone === "optimal"
                    ? "bg-[hsl(var(--emerald-500)/0.85)]"
                    : tsbZone === "neutral"
                      ? "bg-[hsl(var(--slate-300)/0.85)]"
                      : tsbZone === "fresh"
                        ? "bg-[hsl(var(--sky-500)/0.85)]"
                        : "bg-[hsl(var(--amber-500)/0.85)]",
              )}
              style={{ width: `${tsbFillPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PMCStat;

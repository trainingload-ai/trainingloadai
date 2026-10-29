"use client";

import { useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { MetricDemoCopy } from "../types";
import type { PmcDataPoint } from "../shared/demo-types";

type PmcStatType = "fitness" | "fatigue" | "form";

function calcPercent(value: number | undefined, max: number) {
  if (!value || !max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function PmcDemoStat({
  copy,
  type,
  title,
  data,
  extremes,
  selected,
  onSelect,
}: {
  copy: MetricDemoCopy;
  type: PmcStatType;
  title: string;
  data: PmcDataPoint[];
  extremes: { ctl: number; atl: number };
  selected: PmcStatType;
  onSelect: (type: PmcStatType) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const today = data[data.length - 1];
  const value =
    type === "fitness"
      ? today?.fitness
      : type === "fatigue"
        ? today?.fatigue
        : today?.form;
  const display =
    value != null && Number.isFinite(value) ? value.toFixed(2) : "--";
  const abbr = copy.pmc.abbr[type];

  const barPercent = useMemo(() => {
    if (type === "fitness") return calcPercent(today?.fitness, extremes.ctl);
    if (type === "fatigue") return calcPercent(today?.fatigue, extremes.atl);
    return 0;
  }, [today, type, extremes]);

  const tsbValue = today?.form ?? 0;
  const tsbFillPercent = Math.max(
    0,
    Math.min(100, ((tsbValue + 40) / 80) * 100),
  );
  const tsbZone =
    tsbValue < -30
      ? "bg-red-400"
      : tsbValue < -10
        ? "bg-emerald-500"
        : tsbValue < 5
          ? "bg-slate-300"
          : tsbValue < 25
            ? "bg-sky-500"
            : "bg-amber-500";

  const acmp =
    today && today.fitness > 0
      ? Math.round((today.fatigue / today.fitness) * 100) / 100
      : null;

  const colorClass =
    type === "fitness"
      ? "text-sky-600 dark:text-sky-400"
      : type === "fatigue"
        ? "text-violet-600 dark:text-violet-400"
        : "text-slate-600 dark:text-slate-400";

  return (
    <div
      className={cn(
        "flex min-w-0 cursor-pointer flex-col rounded-compact border border-neutral-100 dark:border-neutral-600",
        selected === type && "bg-neutral-100 dark:bg-neutral-700",
        hovering && "bg-neutral-200 dark:bg-neutral-800",
      )}
      onClick={() => onSelect(type)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex flex-col gap-3 px-3 py-2 md:gap-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{title}</span>
            <span className="text-[10px] text-muted-foreground/70">{abbr}</span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label={copy.pmc.zoneHelp.ariaLabel}
              >
                <HelpCircle className="size-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{copy.pmc.zoneHelp.title}</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center justify-between gap-2 text-2xl font-medium">
          <span className={cn("truncate font-medium", colorClass)}>
            {display}
          </span>
          {type === "form" && acmp != null ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  ACWR {acmp}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{copy.pmc.acmpHelp.title}</DialogTitle>
                  <DialogDescription className="space-y-2">
                    <p>{copy.pmc.acmpHelp.formula}</p>
                    <p>{copy.pmc.acmpHelp.sweet}</p>
                    <p>{copy.pmc.acmpHelp.danger}</p>
                    <p>{copy.pmc.acmpHelp.advice}</p>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        {type === "form" ? (
          <div className="relative h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full", tsbZone)}
              style={{ width: `${tsbFillPercent}%` }}
            />
          </div>
        ) : (
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className={cn(
                "h-full rounded-full",
                type === "fitness" ? "bg-sky-500" : "bg-violet-500",
              )}
              style={{ width: `${barPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

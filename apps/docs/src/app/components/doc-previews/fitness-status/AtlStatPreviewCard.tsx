"use client";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Battery,
  Dumbbell,
  HelpCircle,
  Repeat,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "fumadocs-ui/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AtlStatPreviewCard({
  value = "16.99",
  unit = "",
  percent = 72,
  metricLabel = "ATL",
  valuePopoverTitle = "ATL value",
  valuePopoverBody = (
    <>
      A higher ATL usually means more recent fatigue. It is typically a 7-day
      exponentially weighted average of daily training stress.
    </>
  ),
  percentPopoverTitle = "ATL percentage",
  percentPopoverBody = (
    <>
      A visual percentage (0–100%) that represents how high the current ATL is
      relative to a reference range in this preview.
    </>
  ),
  helpTitle = "Fatigue",
  details = "Acute Training Load (fatigue) reflects the average training stress over the past 7 days.",
}: {
  value?: string;
  unit?: string;
  percent?: number;
  metricLabel?: string;
  valuePopoverTitle?: string;
  valuePopoverBody?: ReactNode;
  percentPopoverTitle?: string;
  percentPopoverBody?: ReactNode;
  helpTitle?: string;
  details?: ReactNode;
}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const [valueOpen, setValueOpen] = useState(false);
  const [percentOpen, setPercentOpen] = useState(false);
  const valueCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const percentCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const closeDelayMs = 80;

  const openValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    setValueOpen(true);
  };
  const scheduleCloseValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    valueCloseTimeoutRef.current = setTimeout(() => {
      setValueOpen(false);
    }, closeDelayMs);
  };

  const openPercent = () => {
    if (percentCloseTimeoutRef.current)
      clearTimeout(percentCloseTimeoutRef.current);
    setPercentOpen(true);
  };
  const scheduleClosePercent = () => {
    if (percentCloseTimeoutRef.current)
      clearTimeout(percentCloseTimeoutRef.current);
    percentCloseTimeoutRef.current = setTimeout(() => {
      setPercentOpen(false);
    }, closeDelayMs);
  };

  return (
    <Card className="relative overflow-hidden py-0 w-full max-w-[280px]">
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{metricLabel}</CardTitle>
        <div className="rounded-full bg-muted">
          <Zap className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-2xl font-bold inline-flex items-baseline text-left cursor-pointer"
              onMouseEnter={openValue}
              onMouseLeave={scheduleCloseValue}
              onFocus={openValue}
            >
              <span>{value}</span>
              {unit ? (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {unit}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 text-sm p-3"
            onMouseEnter={openValue}
            onMouseLeave={scheduleCloseValue}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <p className="font-medium mb-1">{valuePopoverTitle}</p>
            <div className="text-muted-foreground text-xs leading-relaxed">
              {valuePopoverBody}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Popover open={percentOpen} onOpenChange={setPercentOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative h-4 bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12 rounded-[2px] w-full overflow-hidden cursor-pointer"
                  onMouseEnter={openPercent}
                  onMouseLeave={scheduleClosePercent}
                  onFocus={openPercent}
                >
                  <div className="absolute left-0 top-0 h-4 w-full bg-violet-500/30" />
                  <div
                    className="absolute left-0 top-0 h-4 bg-violet-500/95 rounded-[2px]"
                    style={{ width: `${clampedPercent}%` }}
                  />
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-background dark:text-foreground">
                    {clampedPercent}%
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 text-sm p-3"
                onMouseEnter={openPercent}
                onMouseLeave={scheduleClosePercent}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <p className="font-medium mb-1">{percentPopoverTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {percentPopoverBody}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-6 shrink-0 flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 text-sm p-3">
                <p className="font-medium mb-1">{helpTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {details}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CtlStatPreviewCard({
  value = "67.2",
  unit = "",
  percent = 58,
  metricLabel = "CTL",
  valuePopoverTitle = "CTL value",
  valuePopoverBody = (
    <>
      CTL is often used as a proxy for “fitness”. It is typically a longer-term
      exponentially weighted average of daily training stress (commonly 42 days
      in PMC).
    </>
  ),
  percentPopoverTitle = "CTL percentage",
  percentPopoverBody = (
    <>
      A 0–100% visual percentage showing where today’s CTL sits in the preview
      range. It is for display only and depends on the chosen reference.
    </>
  ),
  helpTitle = "Fitness",
  details = "Chronic Training Load (fitness) reflects the weighted average training stress over a longer period (often 42 days).",
}: {
  value?: string;
  unit?: string;
  percent?: number;
  metricLabel?: string;
  valuePopoverTitle?: string;
  valuePopoverBody?: ReactNode;
  percentPopoverTitle?: string;
  percentPopoverBody?: ReactNode;
  helpTitle?: string;
  details?: ReactNode;
}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const [valueOpen, setValueOpen] = useState(false);
  const [percentOpen, setPercentOpen] = useState(false);
  const valueCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const percentCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const closeDelayMs = 80;

  const openValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    setValueOpen(true);
  };
  const scheduleCloseValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    valueCloseTimeoutRef.current = setTimeout(() => {
      setValueOpen(false);
    }, closeDelayMs);
  };

  const openPercent = () => {
    if (percentCloseTimeoutRef.current)
      clearTimeout(percentCloseTimeoutRef.current);
    setPercentOpen(true);
  };
  const scheduleClosePercent = () => {
    if (percentCloseTimeoutRef.current)
      clearTimeout(percentCloseTimeoutRef.current);
    percentCloseTimeoutRef.current = setTimeout(() => {
      setPercentOpen(false);
    }, closeDelayMs);
  };

  return (
    <Card className="relative overflow-hidden py-0 w-full max-w-[280px]">
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{metricLabel}</CardTitle>
        <div className="rounded-full bg-muted">
          <Dumbbell className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-2xl font-bold inline-flex items-baseline text-left cursor-pointer"
              onMouseEnter={openValue}
              onMouseLeave={scheduleCloseValue}
              onFocus={openValue}
            >
              <span>{value}</span>
              {unit ? (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {unit}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 text-sm p-3"
            onMouseEnter={openValue}
            onMouseLeave={scheduleCloseValue}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <p className="font-medium mb-1">{valuePopoverTitle}</p>
            <div className="text-muted-foreground text-xs leading-relaxed">
              {valuePopoverBody}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Popover open={percentOpen} onOpenChange={setPercentOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative h-4 bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12 rounded-[2px] w-full overflow-hidden cursor-pointer"
                  onMouseEnter={openPercent}
                  onMouseLeave={scheduleClosePercent}
                  onFocus={openPercent}
                >
                  <div className="absolute left-0 top-0 h-4 w-full bg-sky-500/30" />
                  <div
                    className="absolute left-0 top-0 h-4 bg-sky-500/95 rounded-[2px]"
                    style={{ width: `${clampedPercent}%` }}
                  />
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-background dark:text-foreground">
                    {clampedPercent}%
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 text-sm p-3"
                onMouseEnter={openPercent}
                onMouseLeave={scheduleClosePercent}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <p className="font-medium mb-1">{percentPopoverTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {percentPopoverBody}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-6 shrink-0 flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 text-sm p-3">
                <p className="font-medium mb-1">{helpTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {details}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TsbStatPreviewCard({
  value = "-12",
  unit = "",
  domainMin = -40,
  domainMax = 40,
  metricLabel = "TSB",
  valuePopoverTitle = "TSB value",
  valuePopoverBody = (
    <>
      TSB is often interpreted as “form” or freshness. It is commonly defined as
      CTL minus ATL, so it tends to be negative during heavy training blocks and
      rises during recovery or tapering.
    </>
  ),
  rangePopoverTitle = "TSB range",
  rangePopoverBody = (
    <>
      A segmented range view to help interpret today’s TSB. Typical guidance:
      very negative values indicate high fatigue risk; small positives indicate
      freshness; higher positives may indicate peak form but can also imply
      detraining if sustained.
    </>
  ),
  helpTitle = "Form",
  details = "Training Stress Balance (form) is commonly computed as CTL − ATL and reflects how “fresh” you are.",
}: {
  value?: string;
  unit?: string;
  domainMin?: number;
  domainMax?: number;
  metricLabel?: string;
  valuePopoverTitle?: string;
  valuePopoverBody?: ReactNode;
  rangePopoverTitle?: string;
  rangePopoverBody?: ReactNode;
  helpTitle?: string;
  details?: ReactNode;
}) {
  const numericValue = Number(value);
  const safeValue =
    Number.isFinite(numericValue) && domainMax !== domainMin ? numericValue : 0;
  const fillPercent = Math.max(
    0,
    Math.min(100, ((safeValue - domainMin) / (domainMax - domainMin)) * 100),
  );
  const zone =
    safeValue < -30
      ? "danger"
      : safeValue < -10
        ? "optimal"
        : safeValue < 5
          ? "neutral"
          : safeValue < 15
            ? "fresh"
            : safeValue < 25
              ? "peak"
              : "transition";

  const zoneFill =
    zone === "danger"
      ? "bg-red-500/95"
      : zone === "optimal"
        ? "bg-emerald-500/95"
        : zone === "neutral"
          ? "bg-slate-400/95"
          : zone === "fresh"
            ? "bg-sky-500/95"
            : zone === "peak"
              ? "bg-violet-500/95"
              : "bg-amber-500/95";

  const seg1 = ((-30 - domainMin) / (domainMax - domainMin)) * 100;
  const seg2 = ((-10 - -30) / (domainMax - domainMin)) * 100;
  const seg3 = ((5 - -10) / (domainMax - domainMin)) * 100;
  const seg4 = ((15 - 5) / (domainMax - domainMin)) * 100;
  const seg5 = ((25 - 15) / (domainMax - domainMin)) * 100;
  const seg6 = Math.max(0, 100 - seg1 - seg2 - seg3 - seg4 - seg5);

  const m1 = seg1;
  const m2 = seg1 + seg2;
  const m3 = seg1 + seg2 + seg3;
  const m4 = seg1 + seg2 + seg3 + seg4;
  const m5 = seg1 + seg2 + seg3 + seg4 + seg5;

  const [valueOpen, setValueOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const valueCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const rangeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const closeDelayMs = 80;

  const openValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    setValueOpen(true);
  };
  const scheduleCloseValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    valueCloseTimeoutRef.current = setTimeout(() => {
      setValueOpen(false);
    }, closeDelayMs);
  };

  const openRange = () => {
    if (rangeCloseTimeoutRef.current)
      clearTimeout(rangeCloseTimeoutRef.current);
    setRangeOpen(true);
  };
  const scheduleCloseRange = () => {
    if (rangeCloseTimeoutRef.current)
      clearTimeout(rangeCloseTimeoutRef.current);
    rangeCloseTimeoutRef.current = setTimeout(() => {
      setRangeOpen(false);
    }, closeDelayMs);
  };

  return (
    <Card className="relative overflow-hidden py-0 w-full max-w-[280px]">
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{metricLabel}</CardTitle>
        <div className="rounded-full bg-muted">
          <Battery className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-2xl font-bold inline-flex items-baseline text-left cursor-pointer"
              onMouseEnter={openValue}
              onMouseLeave={scheduleCloseValue}
              onFocus={openValue}
            >
              <span>{value}</span>
              {unit ? (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {unit}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 text-sm p-3"
            onMouseEnter={openValue}
            onMouseLeave={scheduleCloseValue}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <p className="font-medium mb-1">{valuePopoverTitle}</p>
            <div className="text-muted-foreground text-xs leading-relaxed">
              {valuePopoverBody}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative h-4 bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12 rounded-[2px] w-full overflow-hidden cursor-pointer"
                  onMouseEnter={openRange}
                  onMouseLeave={scheduleCloseRange}
                  onFocus={openRange}
                >
                  <div
                    className="absolute left-0 top-0 h-4 bg-red-500/30"
                    style={{ width: `${seg1}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-emerald-500/30"
                    style={{ left: `${seg1}%`, width: `${seg2}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-slate-400/30"
                    style={{ left: `${seg1 + seg2}%`, width: `${seg3}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-sky-500/30"
                    style={{
                      left: `${seg1 + seg2 + seg3}%`,
                      width: `${seg4}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-violet-500/30"
                    style={{
                      left: `${seg1 + seg2 + seg3 + seg4}%`,
                      width: `${seg5}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-amber-500/30"
                    style={{
                      left: `${seg1 + seg2 + seg3 + seg4 + seg5}%`,
                      width: `${seg6}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m1}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m2}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m3}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m4}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m5}%` }}
                  />
                  <div
                    className={`absolute left-0 top-0 h-4 ${zoneFill} rounded-[2px]`}
                    style={{ width: `${fillPercent}%` }}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 text-sm p-3"
                onMouseEnter={openRange}
                onMouseLeave={scheduleCloseRange}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <p className="font-medium mb-1">{rangePopoverTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {rangePopoverBody}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-6 shrink-0 flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 text-sm p-3">
                <p className="font-medium mb-1">{helpTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {details}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AcRatioStatPreviewCard({
  value = "1.12",
  unit = "",
  domainMin = 0,
  domainMax = 2,
  metricLabel = "A:C",
  valuePopoverTitle = "A:C 值",
  valuePopoverBody = (
    <>
      A:C（Acute:Chronic）负荷比通常用来观察短期训练负荷相对长期基线的变化强度。
      它常被近似为 ATL / CTL，但具体算法可能随平台不同而略有差异。
    </>
  ),
  rangePopoverTitle = "A:C 区间",
  rangePopoverBody = (
    <>
      分段区间用于快速判断负荷变化是否过快：较低通常代表训练不足或恢复期；中间区间常被认为更稳妥；
      比率过高往往意味着短期负荷相对基线增长过快，需要更关注伤病信号与恢复。
    </>
  ),
  helpTitle = "受伤风险",
  details = "A:C 负荷比用来对比短期与长期训练负荷，辅助评估训练激进程度与潜在风险。",
}: {
  value?: string;
  unit?: string;
  domainMin?: number;
  domainMax?: number;
  metricLabel?: string;
  valuePopoverTitle?: string;
  valuePopoverBody?: ReactNode;
  rangePopoverTitle?: string;
  rangePopoverBody?: ReactNode;
  helpTitle?: string;
  details?: ReactNode;
}) {
  const numericValue = Number(value);
  const safeValue =
    Number.isFinite(numericValue) && domainMax !== domainMin ? numericValue : 0;
  const fillPercent = Math.max(
    0,
    Math.min(100, ((safeValue - domainMin) / (domainMax - domainMin)) * 100),
  );

  const zone =
    safeValue < 0.8
      ? "low"
      : safeValue < 1.3
        ? "optimal"
        : safeValue < 1.5
          ? "high"
          : "danger";

  const zoneFill =
    zone === "danger"
      ? "bg-red-500/95"
      : zone === "high"
        ? "bg-amber-500/95"
        : zone === "optimal"
          ? "bg-emerald-500/95"
          : "bg-sky-500/95";

  const seg1 = ((0.8 - domainMin) / (domainMax - domainMin)) * 100;
  const seg2 = ((1.3 - 0.8) / (domainMax - domainMin)) * 100;
  const seg3 = ((1.5 - 1.3) / (domainMax - domainMin)) * 100;
  const seg4 = Math.max(0, 100 - seg1 - seg2 - seg3);

  const m1 = seg1;
  const m2 = seg1 + seg2;
  const m3 = seg1 + seg2 + seg3;

  const [valueOpen, setValueOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const valueCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const rangeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const closeDelayMs = 80;

  const openValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    setValueOpen(true);
  };
  const scheduleCloseValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    valueCloseTimeoutRef.current = setTimeout(() => {
      setValueOpen(false);
    }, closeDelayMs);
  };

  const openRange = () => {
    if (rangeCloseTimeoutRef.current)
      clearTimeout(rangeCloseTimeoutRef.current);
    setRangeOpen(true);
  };
  const scheduleCloseRange = () => {
    if (rangeCloseTimeoutRef.current)
      clearTimeout(rangeCloseTimeoutRef.current);
    rangeCloseTimeoutRef.current = setTimeout(() => {
      setRangeOpen(false);
    }, closeDelayMs);
  };

  return (
    <Card className="relative overflow-hidden py-0 w-full max-w-[280px]">
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{metricLabel}</CardTitle>
        <div className="rounded-full bg-muted">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-2xl font-bold inline-flex items-baseline text-left cursor-pointer"
              onMouseEnter={openValue}
              onMouseLeave={scheduleCloseValue}
              onFocus={openValue}
            >
              <span>{value}</span>
              {unit ? (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {unit}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 text-sm p-3"
            onMouseEnter={openValue}
            onMouseLeave={scheduleCloseValue}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <p className="font-medium mb-1">{valuePopoverTitle}</p>
            <div className="text-muted-foreground text-xs leading-relaxed">
              {valuePopoverBody}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative h-4 bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12 rounded-[2px] w-full overflow-hidden cursor-pointer"
                  onMouseEnter={openRange}
                  onMouseLeave={scheduleCloseRange}
                  onFocus={openRange}
                >
                  <div
                    className="absolute left-0 top-0 h-4 bg-sky-500/30"
                    style={{ width: `${seg1}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-emerald-500/30"
                    style={{ left: `${seg1}%`, width: `${seg2}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-amber-500/30"
                    style={{ left: `${seg1 + seg2}%`, width: `${seg3}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-red-500/30"
                    style={{
                      left: `${seg1 + seg2 + seg3}%`,
                      width: `${seg4}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m1}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m2}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m3}%` }}
                  />
                  <div
                    className={`absolute left-0 top-0 h-4 ${zoneFill} rounded-[2px]`}
                    style={{ width: `${fillPercent}%` }}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 text-sm p-3"
                onMouseEnter={openRange}
                onMouseLeave={scheduleCloseRange}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <p className="font-medium mb-1">{rangePopoverTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {rangePopoverBody}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-6 shrink-0 flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 text-sm p-3">
                <p className="font-medium mb-1">{helpTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {details}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonotonyStatPreviewCard({
  value = "0.72",
  unit = "",
  domainMin = 0.29,
  domainMax = 1.0,
  metricLabel = "Monotony",
  valuePopoverTitle = "Monotony 值",
  valuePopoverBody = (
    <>
      单调性用于描述训练负荷在一周内的波动程度：越高通常意味着每天负荷越接近、变化越少，
      长期维持可能与更高的疲劳与伤病风险相关。
    </>
  ),
  rangePopoverTitle = "Monotony 区间",
  rangePopoverBody = (
    <>
      分段区间用于辅助解读当前单调性：较低通常表示训练更有变化；中间区间提示需要留意；
      较高区间常见于“每天都差不多”的训练结构，建议引入更明确的高低日与休息日。
    </>
  ),
  helpTitle = "波动性",
  details = "训练单调性用于衡量训练周内负荷的波动程度，帮助识别过度单一的训练结构。",
}: {
  value?: string;
  unit?: string;
  domainMin?: number;
  domainMax?: number;
  metricLabel?: string;
  valuePopoverTitle?: string;
  valuePopoverBody?: ReactNode;
  rangePopoverTitle?: string;
  rangePopoverBody?: ReactNode;
  helpTitle?: string;
  details?: ReactNode;
}) {
  const numericValue = Number(value);
  const safeValue =
    Number.isFinite(numericValue) && domainMax !== domainMin ? numericValue : 0;
  const fillPercent = Math.max(
    0,
    Math.min(100, ((safeValue - domainMin) / (domainMax - domainMin)) * 100),
  );
  const zone = safeValue < 0.6 ? "low" : safeValue <= 0.8 ? "moderate" : "high";
  const zoneFill =
    zone === "high"
      ? "bg-red-500/95"
      : zone === "moderate"
        ? "bg-amber-500/95"
        : "bg-emerald-500/95";

  const seg1 = ((0.6 - domainMin) / (domainMax - domainMin)) * 100;
  const seg2 = ((0.8 - 0.6) / (domainMax - domainMin)) * 100;
  const seg3 = Math.max(0, 100 - seg1 - seg2);

  const m1 = seg1;
  const m2 = seg1 + seg2;

  const [valueOpen, setValueOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const valueCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const rangeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const closeDelayMs = 80;

  const openValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    setValueOpen(true);
  };
  const scheduleCloseValue = () => {
    if (valueCloseTimeoutRef.current)
      clearTimeout(valueCloseTimeoutRef.current);
    valueCloseTimeoutRef.current = setTimeout(() => {
      setValueOpen(false);
    }, closeDelayMs);
  };

  const openRange = () => {
    if (rangeCloseTimeoutRef.current)
      clearTimeout(rangeCloseTimeoutRef.current);
    setRangeOpen(true);
  };
  const scheduleCloseRange = () => {
    if (rangeCloseTimeoutRef.current)
      clearTimeout(rangeCloseTimeoutRef.current);
    rangeCloseTimeoutRef.current = setTimeout(() => {
      setRangeOpen(false);
    }, closeDelayMs);
  };

  return (
    <Card className="relative overflow-hidden py-0 w-full max-w-[280px]">
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{metricLabel}</CardTitle>
        <div className="rounded-full bg-muted">
          <Repeat className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-2xl font-bold inline-flex items-baseline text-left cursor-pointer"
              onMouseEnter={openValue}
              onMouseLeave={scheduleCloseValue}
              onFocus={openValue}
            >
              <span>{value}</span>
              {unit ? (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {unit}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 text-sm p-3"
            onMouseEnter={openValue}
            onMouseLeave={scheduleCloseValue}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <p className="font-medium mb-1">{valuePopoverTitle}</p>
            <div className="text-muted-foreground text-xs leading-relaxed">
              {valuePopoverBody}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative h-4 bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12 rounded-[2px] w-full overflow-hidden cursor-pointer"
                  onMouseEnter={openRange}
                  onMouseLeave={scheduleCloseRange}
                  onFocus={openRange}
                >
                  <div
                    className="absolute left-0 top-0 h-4 bg-emerald-500/30"
                    style={{ width: `${seg1}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-amber-500/30"
                    style={{ left: `${seg1}%`, width: `${seg2}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 bg-red-500/30"
                    style={{ left: `${seg1 + seg2}%`, width: `${seg3}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m1}%` }}
                  />
                  <div
                    className="absolute top-0 h-4 w-px bg-border dark:bg-white/15"
                    style={{ left: `${m2}%` }}
                  />
                  <div
                    className={`absolute left-0 top-0 h-4 ${zoneFill} rounded-[2px]`}
                    style={{ width: `${fillPercent}%` }}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 text-sm p-3"
                onMouseEnter={openRange}
                onMouseLeave={scheduleCloseRange}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <p className="font-medium mb-1">{rangePopoverTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {rangePopoverBody}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-6 shrink-0 flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 text-sm p-3">
                <p className="font-medium mb-1">{helpTitle}</p>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {details}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

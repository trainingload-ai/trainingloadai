"use client";

import React from "react";
import { clamp, cn } from "@/lib/utils";
import type { WeeklySummaryKey } from "@/api/charts";
import type { FitnessStatusData } from "@/api/usePMC";
import type { FitnessStatCard } from "./SortableFitnessStatCard";

type BarColor = { track: string; fill: string };
type BarColors = {
  atl: BarColor;
  ctl: BarColor;
  riskLow: BarColor;
  optimal: BarColor;
  moderate: BarColor;
  danger: BarColor;
  neutral: BarColor;
  peak: BarColor;
};

const FITNESS_STATUS_BAR_COLORS: BarColors = {
  atl: {
    track:
      "bg-[hsl(var(--violet-500)/0.16)] dark:bg-[hsl(var(--violet-500)/0.28)]",
    fill: "bg-[hsl(var(--violet-500)/0.85)] dark:bg-[hsl(var(--violet-500)/0.95)]",
  },
  ctl: {
    track: "bg-[hsl(var(--sky-500)/0.16)] dark:bg-[hsl(var(--sky-500)/0.28)]",
    fill: "bg-[hsl(var(--sky-500)/0.85)] dark:bg-[hsl(var(--sky-500)/0.95)]",
  },
  riskLow: {
    track: "bg-[hsl(var(--sky-500)/0.16)] dark:bg-[hsl(var(--sky-500)/0.28)]",
    fill: "bg-[hsl(var(--sky-500)/0.85)] dark:bg-[hsl(var(--sky-500)/0.95)]",
  },
  optimal: {
    track:
      "bg-[hsl(var(--emerald-500)/0.16)] dark:bg-[hsl(var(--emerald-500)/0.28)]",
    fill: "bg-[hsl(var(--emerald-500)/0.85)] dark:bg-[hsl(var(--emerald-500)/0.95)]",
  },
  moderate: {
    track:
      "bg-[hsl(var(--amber-500)/0.16)] dark:bg-[hsl(var(--amber-500)/0.28)]",
    fill: "bg-[hsl(var(--amber-500)/0.85)] dark:bg-[hsl(var(--amber-500)/0.95)]",
  },
  danger: {
    track: "bg-[hsl(var(--red-400)/0.16)] dark:bg-[hsl(var(--red-400)/0.28)]",
    fill: "bg-[hsl(var(--red-400)/0.85)] dark:bg-[hsl(var(--red-400)/0.95)]",
  },
  neutral: {
    track:
      "bg-[hsl(var(--slate-300)/0.16)] dark:bg-[hsl(var(--slate-300)/0.28)]",
    fill: "bg-[hsl(var(--slate-300)/0.85)] dark:bg-[hsl(var(--slate-300)/0.95)]",
  },
  peak: {
    track:
      "bg-[hsl(var(--violet-500)/0.16)] dark:bg-[hsl(var(--violet-500)/0.28)]",
    fill: "bg-[hsl(var(--violet-500)/0.85)] dark:bg-[hsl(var(--violet-500)/0.95)]",
  },
};

const FITNESS_STATUS_BAR_CONTAINER_CLASSNAME =
  "relative h-4 rounded-micro w-full overflow-hidden bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12";

export function FitnessStatusCardSubContent({
  stat,
  t,
  weeklySummaryPair,
  formatWeeklyValue,
  fitnessData,
  atlPercent,
  ctlPercent,
  tsbZone,
  tsbDomainMin,
  tsbDomainMax,
  tsbFillPercent,
  acRatioZone,
  acRatioFillPercent,
  monotonyZone,
  monotonyFillPercent,
}: {
  stat: FitnessStatCard;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  weeklySummaryPair:
    | Record<
        WeeklySummaryKey,
        { current: number | undefined; previous: number | undefined }
      >
    | null
    | undefined;
  formatWeeklyValue: (key: WeeklySummaryKey, v: number | undefined) => string;
  fitnessData: FitnessStatusData | undefined;
  atlPercent: number;
  ctlPercent: number;
  tsbZone: "danger" | "optimal" | "neutral" | "fresh" | "peak" | "transition";
  tsbDomainMin: number;
  tsbDomainMax: number;
  tsbFillPercent: number;
  acRatioZone: "low" | "optimal" | "high" | "danger";
  acRatioFillPercent: number;
  monotonyZone: "none" | "low" | "moderate" | "high";
  monotonyFillPercent: number;
}) {
  if (stat.key.startsWith("week")) {
    const key = stat.key as WeeklySummaryKey;
    const summary = weeklySummaryPair?.[key];
    const prev = summary?.previous;
    const cur = summary?.current;
    const diff = (cur ?? 0) - (prev ?? 0);
    const pct =
      prev && prev > 0 ? (diff / prev) * 100 : cur && cur > 0 ? 100 : 0;
    const pctTextClass =
      diff >= 0
        ? "text-[hsl(var(--emerald-500))]"
        : "text-[hsl(var(--red-500))]";
    const pctLabel = `${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return (
      <div className="flex items-center justify-between w-full text-mobile-unit pc:text-[10px] text-muted-foreground tabular-nums">
        <span className="truncate">
          {t("previousWeekLabel")} {formatWeeklyValue(key, prev)}
        </span>
        <span className="truncate text-right">
          {t("changeLabel")}
          <span className={cn("font-medium", pctTextClass)}>{pctLabel}</span>
        </span>
      </div>
    );
  }

  if (stat.key === "vo2Max") {
    const vo2MaxValue =
      fitnessData?.vo2Max !== undefined && Number.isFinite(fitnessData.vo2Max)
        ? fitnessData.vo2Max
        : undefined;
    if (vo2MaxValue === undefined) {
      return (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">{stat.description}</p>
      );
    }

    const thresholds = fitnessData?.vo2MaxClassification?.thresholds ?? {
      fair: 30,
      good: 35,
      veryGood: 40,
      excellent: 50,
    };

    const vo2DomainMin = 0;
    const vo2DomainMax = Math.max(60, thresholds.excellent + 10);

    const seg1 =
      ((thresholds.fair - vo2DomainMin) / (vo2DomainMax - vo2DomainMin)) * 100;
    const seg2 =
      ((thresholds.good - thresholds.fair) / (vo2DomainMax - vo2DomainMin)) *
      100;
    const seg3 =
      ((thresholds.veryGood - thresholds.good) /
        (vo2DomainMax - vo2DomainMin)) *
      100;
    const seg4 =
      ((thresholds.excellent - thresholds.veryGood) /
        (vo2DomainMax - vo2DomainMin)) *
      100;
    const seg5 = Math.max(0, 100 - seg1 - seg2 - seg3 - seg4);

    const m1 = seg1;
    const m2 = seg1 + seg2;
    const m3 = seg1 + seg2 + seg3;
    const m4 = seg1 + seg2 + seg3 + seg4;

    const vo2FillPercent = clamp(
      ((vo2MaxValue - vo2DomainMin) / (vo2DomainMax - vo2DomainMin)) * 100,
      0,
      100,
    );

    const level =
      fitnessData?.vo2MaxClassification?.level ??
      (vo2MaxValue >= thresholds.excellent
        ? "EXCELLENT"
        : vo2MaxValue >= thresholds.veryGood
          ? "VERY_GOOD"
          : vo2MaxValue >= thresholds.good
            ? "GOOD"
            : vo2MaxValue >= thresholds.fair
              ? "FAIR"
              : "POOR");

    const levelColors =
      level === "EXCELLENT"
        ? FITNESS_STATUS_BAR_COLORS.peak
        : level === "VERY_GOOD"
          ? FITNESS_STATUS_BAR_COLORS.ctl
          : level === "GOOD"
            ? FITNESS_STATUS_BAR_COLORS.optimal
            : level === "FAIR"
              ? FITNESS_STATUS_BAR_COLORS.moderate
              : FITNESS_STATUS_BAR_COLORS.danger;

    const levelTextClass =
      level === "EXCELLENT"
        ? "text-[hsl(var(--violet-500))]"
        : level === "VERY_GOOD"
          ? "text-[hsl(var(--sky-500))]"
          : level === "GOOD"
            ? "text-[hsl(var(--emerald-500))]"
            : level === "FAIR"
              ? "text-[hsl(var(--amber-500))]"
              : "text-[hsl(var(--red-500))]";

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={FITNESS_STATUS_BAR_CONTAINER_CLASSNAME}>
          <div
            className={`absolute left-0 top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.danger.track}`}
            style={{ width: `${seg1}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.moderate.track}`}
            style={{ left: `${seg1}%`, width: `${seg2}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.optimal.track}`}
            style={{ left: `${seg1 + seg2}%`, width: `${seg3}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.ctl.track}`}
            style={{ left: `${seg1 + seg2 + seg3}%`, width: `${seg4}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.peak.track}`}
            style={{
              left: `${seg1 + seg2 + seg3 + seg4}%`,
              width: `${seg5}%`,
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
            className={`absolute left-0 top-0 h-4 ${levelColors.fill} rounded-micro`}
            style={{ width: `${vo2FillPercent}%` }}
          />
          <div
            className="absolute top-0 h-4 w-px bg-foreground/60 dark:bg-white/40"
            style={{ left: `${vo2FillPercent}%` }}
          />
        </div>
        <div
          className={`text-mobile-caption pc:text-xs font-medium shrink-0 w-10 text-right ${levelTextClass}`}
        >
          {t(`vo2Max.level.${level}`)}
        </div>
      </div>
    );
  }

  if (stat.key === "atl" || stat.key === "ctl") {
    const percent = stat.key === "atl" ? atlPercent : ctlPercent;
    const colors =
      stat.key === "atl"
        ? FITNESS_STATUS_BAR_COLORS.atl
        : FITNESS_STATUS_BAR_COLORS.ctl;
    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={FITNESS_STATUS_BAR_CONTAINER_CLASSNAME}>
          <div className={`absolute left-0 top-0 h-4 w-full ${colors.track}`} />
          <div
            className={`absolute left-0 top-0 h-4 ${colors.fill} rounded-micro`}
            style={{ width: `${percent}%` }}
          />
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-mobile-unit pc:text-[10px] text-background dark:text-foreground">
            {percent}%
          </span>
        </div>
      </div>
    );
  }

  if (stat.key === "tsb") {
    const tsbColors =
      tsbZone === "danger"
        ? FITNESS_STATUS_BAR_COLORS.danger
        : tsbZone === "optimal"
          ? FITNESS_STATUS_BAR_COLORS.optimal
          : tsbZone === "neutral"
            ? FITNESS_STATUS_BAR_COLORS.neutral
            : tsbZone === "fresh"
              ? FITNESS_STATUS_BAR_COLORS.riskLow
              : tsbZone === "peak"
                ? FITNESS_STATUS_BAR_COLORS.peak
                : FITNESS_STATUS_BAR_COLORS.moderate;

    const seg1 = ((-30 - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100;
    const seg2 = ((-10 - -30) / (tsbDomainMax - tsbDomainMin)) * 100;
    const seg3 = ((5 - -10) / (tsbDomainMax - tsbDomainMin)) * 100;
    const seg4 = ((15 - 5) / (tsbDomainMax - tsbDomainMin)) * 100;
    const seg5 = ((25 - 15) / (tsbDomainMax - tsbDomainMin)) * 100;
    const seg6 = Math.max(0, 100 - seg1 - seg2 - seg3 - seg4 - seg5);

    const m1 = seg1;
    const m2 = seg1 + seg2;
    const m3 = seg1 + seg2 + seg3;
    const m4 = seg1 + seg2 + seg3 + seg4;
    const m5 = seg1 + seg2 + seg3 + seg4 + seg5;

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={FITNESS_STATUS_BAR_CONTAINER_CLASSNAME}>
          <div
            className={`absolute left-0 top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.danger.track}`}
            style={{ width: `${seg1}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.optimal.track}`}
            style={{ left: `${seg1}%`, width: `${seg2}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.neutral.track}`}
            style={{ left: `${seg1 + seg2}%`, width: `${seg3}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.riskLow.track}`}
            style={{ left: `${seg1 + seg2 + seg3}%`, width: `${seg4}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.peak.track}`}
            style={{
              left: `${seg1 + seg2 + seg3 + seg4}%`,
              width: `${seg5}%`,
            }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.moderate.track}`}
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
            className={`absolute left-0 top-0 h-4 ${tsbColors.fill} rounded-micro`}
            style={{ width: `${tsbFillPercent}%` }}
          />
        </div>
      </div>
    );
  }

  if (stat.key === "acRatio") {
    const colors =
      acRatioZone === "optimal"
        ? FITNESS_STATUS_BAR_COLORS.optimal
        : acRatioZone === "high"
          ? FITNESS_STATUS_BAR_COLORS.moderate
          : acRatioZone === "danger"
            ? FITNESS_STATUS_BAR_COLORS.danger
            : FITNESS_STATUS_BAR_COLORS.riskLow;

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={FITNESS_STATUS_BAR_CONTAINER_CLASSNAME}>
          <div
            className={`absolute left-0 top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.riskLow.track} w-full`}
            style={{ width: "40%" }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.optimal.track}`}
            style={{ left: "40%", width: "25%" }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.moderate.track}`}
            style={{ left: "65%", width: "10%" }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.danger.track}`}
            style={{ left: "75%", width: "25%" }}
          />
          <div className="absolute left-[40%] top-0 h-4 w-px bg-border dark:bg-white/15" />
          <div className="absolute left-[65%] top-0 h-4 w-px bg-border dark:bg-white/15" />
          <div
            className={`absolute left-0 top-0 h-4 ${colors.fill} rounded-micro`}
            style={{ width: `${acRatioFillPercent}%` }}
          />
        </div>
      </div>
    );
  }

  if (stat.key === "monotony") {
    const colors =
      monotonyZone === "low"
        ? FITNESS_STATUS_BAR_COLORS.optimal
        : monotonyZone === "moderate"
          ? FITNESS_STATUS_BAR_COLORS.moderate
          : monotonyZone === "high"
            ? FITNESS_STATUS_BAR_COLORS.danger
            : undefined;

    const seg1 = ((0.6 - 0.29) / (1.0 - 0.29)) * 100;
    const seg2 = ((0.8 - 0.6) / (1.0 - 0.29)) * 100;
    const seg3 = Math.max(0, 100 - seg1 - seg2);

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={FITNESS_STATUS_BAR_CONTAINER_CLASSNAME}>
          <div
            className={`absolute left-0 top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.optimal.track}`}
            style={{ width: `${seg1}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.moderate.track}`}
            style={{ left: `${seg1}%`, width: `${seg2}%` }}
          />
          <div
            className={`absolute top-0 h-4 ${FITNESS_STATUS_BAR_COLORS.danger.track}`}
            style={{ left: `${seg1 + seg2}%`, width: `${seg3}%` }}
          />
          <div
            className={`absolute left-0 top-0 h-4 ${colors ? colors.fill : "bg-transparent"} rounded-micro`}
            style={{ width: `${monotonyFillPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return <p className="text-mobile-caption pc:text-xs text-muted-foreground">{stat.description}</p>;
}

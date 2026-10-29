"use client";

import { useTranslations } from "next-intl";

import { useDashboardPMC } from "@/api/usePMC";
import { Link } from "@/i18n/navigation";

type TsbZone =
  | "danger"
  | "optimal"
  | "neutral"
  | "fresh"
  | "peak"
  | "transition";

const RING_SIZE = 54;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SEGMENTS: Array<{
  start: number;
  end: number;
  zone: TsbZone;
  color: string;
}> = [
  { start: 0, end: 12.5, zone: "danger", color: "#f87171" },
  { start: 12.5, end: 37.5, zone: "optimal", color: "#10b981" },
  { start: 37.5, end: 56.25, zone: "neutral", color: "#94a3b8" },
  { start: 56.25, end: 68.75, zone: "fresh", color: "#0ea5e9" },
  { start: 68.75, end: 81.25, zone: "peak", color: "#8b5cf6" },
  { start: 81.25, end: 100, zone: "transition", color: "#f59e0b" },
];

function StatusProgressRing({
  percent,
  zone,
}: {
  percent: number | null;
  zone: TsbZone;
}) {
  const safePercent = Math.max(0, Math.min(100, percent ?? 0));
  const activeColor =
    RING_SEGMENTS.find((segment) => segment.zone === zone)?.color ?? "#64748b";
  const markerAngle = (safePercent / 100) * Math.PI * 2 - Math.PI / 2;
  const markerX = RING_SIZE / 2 + Math.cos(markerAngle) * RING_RADIUS;
  const markerY = RING_SIZE / 2 + Math.sin(markerAngle) * RING_RADIUS;

  return (
    <div
      className="relative grid place-items-center"
      style={{ height: RING_SIZE, width: RING_SIZE }}
    >
      <svg
        aria-hidden="true"
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        width={RING_SIZE}
      >
        {RING_SEGMENTS.map((segment) => {
          const segmentLength =
            ((segment.end - segment.start) / 100) * RING_CIRCUMFERENCE;
          return (
            <circle
              key={segment.zone}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              opacity={segment.zone === zone ? 1 : 0.24}
              r={RING_RADIUS}
              stroke={segment.color}
              strokeDasharray={`${Math.max(0, segmentLength - 2.4)} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={-(segment.start / 100) * RING_CIRCUMFERENCE}
              strokeLinecap="round"
              strokeWidth={
                segment.zone === zone ? RING_STROKE + 1 : RING_STROKE
              }
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          );
        })}
        {percent != null ? (
          <circle
            cx={markerX}
            cy={markerY}
            fill={activeColor}
            r={3.8}
            stroke="var(--background)"
            strokeWidth={2}
          />
        ) : null}
      </svg>
      <span
        className="absolute text-[20px] font-bold leading-none tabular-nums"
        style={{ color: activeColor }}
      >
        {percent ?? "--"}
        {percent != null ? (
          <span className="text-[9px] font-semibold">%</span>
        ) : null}
      </span>
    </div>
  );
}

function StatusMetricBar({
  color,
  label,
  percent,
  value,
}: {
  color: string;
  label: string;
  percent: number;
  value: number | null;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1 text-[9px] leading-none">
        <span className="min-w-0 truncate font-medium text-muted-foreground">
          {label}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-foreground/80">
          {value ?? "--"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full"
          style={{
            backgroundColor: color,
            width: `${Math.max(0, Math.min(100, percent))}%`,
          }}
        />
      </div>
    </div>
  );
}

export function MobilePmcStatusPreview() {
  const t = useTranslations("V2HomePage");
  const {
    fitnessData,
    isPending,
    atlPercent,
    ctlPercent,
    tsbFillPercent,
    tsbZone,
  } = useDashboardPMC();
  const ready = !isPending && Boolean(fitnessData);
  const statusPercent = ready ? Math.round(tsbFillPercent) : null;
  const ctlValue = ready ? Math.round(fitnessData?.ctl ?? 0) : null;
  const atlValue = ready ? Math.round(fitnessData?.atl ?? 0) : null;

  return (
    <Link
      href="/metrics/pmc"
      aria-label={t("currentState.title")}
      className="flex h-[150px] w-[86px] shrink-0 flex-col items-center justify-between rounded-surface bg-neutral-100 px-2 py-2.5 text-foreground transition-colors active:bg-neutral-200 pc:hidden dark:bg-[#292b2a] dark:active:bg-muted"
    >
      <div className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {t("currentState.cards.form")}
        </span>
        <StatusProgressRing percent={statusPercent} zone={tsbZone} />
      </div>
      <div className="w-full space-y-2">
        <StatusMetricBar
          color="#0ea5e9"
          label={t("currentState.cards.fitness")}
          percent={ready ? ctlPercent : 0}
          value={ctlValue}
        />
        <StatusMetricBar
          color="#f97316"
          label={t("currentState.cards.fatigue")}
          percent={ready ? atlPercent : 0}
          value={atlValue}
        />
      </div>
    </Link>
  );
}
